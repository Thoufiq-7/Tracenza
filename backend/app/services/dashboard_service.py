"""Dashboard analytics computed from live data (no placeholder numbers)."""

from collections import Counter
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.application import AIRecommendation, Application, ApplicationStatus
from app.models.audit_log import AuditLog
from app.models.document import Document, DocumentStatus
from app.models.user import User
from app.models.validation_result import Severity, ValidationResult
from app.models.verification import Verification, VerificationStatus
from app.schemas.dashboard import ActivityItem, AlertItem, DashboardStatsResponse, MetricsResponse, RiskDistributionItem
from app.services.obligation_service import obligation_service
from app.services.pipeline import pipeline_service

VISIBLE = Application.status != ApplicationStatus.DRAFT


class DashboardService:
    @staticmethod
    def get_stats(db: Session) -> DashboardStatsResponse:
        apps = db.query(Application).filter(VISIBLE).all()
        by_status = Counter(a.status for a in apps)
        docs = db.query(Document).filter(Document.is_current.is_(True)).all()
        times = [d.extracted_data.get("processing_seconds") for d in docs if (d.extracted_data or {}).get("processing_seconds")]
        now = datetime.now(timezone.utc)
        overdue = sum(
            1
            for a in apps
            if a.status == ApplicationStatus.DEFICIENCY_FOUND
            and a.rectification_due
            and (a.rectification_due if a.rectification_due.tzinfo else a.rectification_due.replace(tzinfo=timezone.utc)) < now
        )

        # AICTE Workflow Metrics
        pending_scrutiny = sum(
            1
            for a in apps
            if getattr(a, "stage", "SCRUTINY") in ("SCRUTINY", None)
            and a.status not in (ApplicationStatus.APPROVED, ApplicationStatus.REJECTED)
        )
        evc_pending = sum(
            1
            for a in apps
            if getattr(a, "stage", None) == "EVC" or a.ai_recommendation == AIRecommendation.INSPECTION
        )
        ob_summary = obligation_service.get_summary(db)
        overdue_obs = ob_summary.get("overdue_count", 0)

        pending_apps = [a for a in apps if a.status not in (ApplicationStatus.APPROVED, ApplicationStatus.REJECTED)]
        ageing_list = [pipeline_service.get_stage_ageing_days(a) for a in pending_apps]
        avg_ageing = round(sum(ageing_list) / len(ageing_list), 1) if ageing_list else 0.0

        return DashboardStatsResponse(
            total_applications=len(apps),
            awaiting_review=by_status[ApplicationStatus.SUBMITTED] + by_status[ApplicationStatus.UNDER_REVIEW],
            deficiency_found=by_status[ApplicationStatus.DEFICIENCY_FOUND],
            approved=by_status[ApplicationStatus.APPROVED],
            rejected=by_status[ApplicationStatus.REJECTED],
            high_risk_flagged=sum(1 for a in apps if a.risk_score >= 60),
            total_documents_processed=sum(1 for d in docs if d.status not in (DocumentStatus.PENDING, DocumentStatus.PROCESSING)),
            tamper_suspected_count=sum(1 for d in docs if ((d.extracted_data or {}).get("forensics") or {}).get("is_suspected")),
            duplicate_flags=sum(1 for d in docs if (d.extracted_data or {}).get("duplicates")),
            pending_source_verifications=db.query(Verification).filter(
                Verification.status.in_([VerificationStatus.PENDING, VerificationStatus.UNAVAILABLE])
            ).count(),
            avg_processing_seconds_per_document=round(sum(times) / len(times), 2) if times else None,
            overdue_rectifications=overdue,
            pending_scrutiny=pending_scrutiny,
            evc_pending=evc_pending,
            overdue_obligations=overdue_obs,
            stage_ageing_avg_days=avg_ageing,
        )

    @staticmethod
    def get_risk_distribution(db: Session) -> list[RiskDistributionItem]:
        scores = [a.risk_score for a in db.query(Application).filter(VISIBLE).all()]
        bands = [
            ("Low (<25)", 0, 25, "#10B981"),
            ("Medium (25-59)", 25, 60, "#F59E0B"),
            ("High (60-79)", 60, 80, "#F97316"),
            ("Critical (80+)", 80, 101, "#EF4444"),
        ]
        return [
            RiskDistributionItem(category=name, count=sum(1 for s in scores if lo <= s < hi), color=color)
            for name, lo, hi, color in bands
        ]

    @staticmethod
    def get_alerts(db: Session, limit: int = 10) -> list[AlertItem]:
        rows = (
            db.query(ValidationResult, Application)
            .join(Application, ValidationResult.application_id == Application.id)
            .filter(VISIBLE, ValidationResult.severity.in_([Severity.CRITICAL, Severity.WARNING]))
            .order_by(ValidationResult.created_at.desc())
            .limit(200)
            .all()
        )
        rows.sort(key=lambda r: (r[0].severity != Severity.CRITICAL, -r[0].created_at.timestamp()))
        return [
            AlertItem(
                id=str(v.id),
                application_id=str(a.id),
                application_number=a.application_number,
                institution_name=a.institution_name,
                title=v.finding,
                severity=v.severity.value,
                check_type=v.check_type.value,
                message=v.evidence or "",
                created_at=v.created_at,
            )
            for v, a in rows[:limit]
        ]

    @staticmethod
    def get_recent_activity(db: Session, limit: int = 15) -> list[ActivityItem]:
        logs = (
            db.query(AuditLog, Application)
            .outerjoin(Application, AuditLog.application_id == Application.id)
            .filter(AuditLog.action.notin_(["USER_LOGIN", "LOGIN_FAILED", "DOCUMENT_VIEWED"]))
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .all()
        )
        users = {u.id: u for u in db.query(User).filter(User.id.in_({l.user_id for l, _ in logs if l.user_id})).all()}
        out = []
        for log, app in logs:
            d = log.details or {}
            summary = d.get("filename") or d.get("to") or d.get("recommendation") or d.get("status") or d.get("rule_code") or ""
            out.append(
                ActivityItem(
                    id=str(log.id),
                    action=log.action.replace("_", " ").title(),
                    user_name=users[log.user_id].full_name if log.user_id in users else "Automated check",
                    institution_name=app.institution_name if app else "System",
                    timestamp=log.created_at,
                    details=str(summary),
                )
            )
        return out

    @staticmethod
    def get_metrics(db: Session) -> MetricsResponse:
        """Operational metrics aligned with evaluation criteria."""
        verifs = db.query(Verification).all()
        vc = Counter(v.status.value for v in verifs)
        docs = db.query(Document).filter(Document.is_current.is_(True)).all()
        levels = Counter(((d.extracted_data or {}).get("forensics") or {}).get("level", "not_run") for d in docs)
        times = [d.extracted_data.get("processing_seconds") for d in docs if (d.extracted_data or {}).get("processing_seconds")]
        decided = db.query(Application).filter(Application.decided_at.isnot(None)).all()
        agree = 0
        for a in decided:
            ai_adverse = a.ai_recommendation in (AIRecommendation.DEFICIENCY, AIRecommendation.INSPECTION)
            human_adverse = a.status in (ApplicationStatus.DEFICIENCY_FOUND, ApplicationStatus.REJECTED)
            agree += int(ai_adverse == human_adverse)
        return MetricsResponse(
            verification={"total_checks": len(verifs), "by_status": dict(vc)},
            forensics={"total_documents": len(docs), "by_level": dict(levels)},
            processing={"avg_seconds": round(sum(times) / len(times), 2) if times else None},
            decisions={"total_decided": len(decided), "ai_agreement_count": agree},
        )


dashboard_service = DashboardService()
