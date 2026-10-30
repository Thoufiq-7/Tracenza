"""AICTE Approval Workflow Pipeline Service.

Core Philosophy:
"Officers decide. Tracenza routes, reminds, flags, and records. It never approves or rejects."

The pipeline coordinates the 4 statutory stages defined by the AICTE Approval Process Handbook (APH):
1. SCRUTINY: Initial eligibility, document completeness, and deterministic APH norm checks.
2. EVC: Expert Visiting Committee physical/virtual campus inspection.
3. SAC_SHC: Standing Appeals Committee / Standing Hearing Committee for hearings and grievances.
4. FINAL_REVIEW: Final statutory determination before issuance of EoA / LoA or formal rejection.
"""

from datetime import datetime, timezone
import logging
from sqlalchemy.orm import Session

from app.models.application import Application, WorkflowStage, ApplicationStatus, AIRecommendation
from app.models.user import User, UserRole
from app.models.validation_result import ValidationResult
from app.services.audit_service import audit_service
from app.services.rule_engine import RED, AMBER

logger = logging.getLogger(__name__)

STAGE_SEQUENCE = [
    WorkflowStage.SCRUTINY,
    WorkflowStage.EVC,
    WorkflowStage.SAC_SHC,
    WorkflowStage.FINAL_REVIEW,
]


class PipelineService:
    @staticmethod
    def get_current_stage(app: Application) -> WorkflowStage:
        raw = getattr(app, "stage", None) or WorkflowStage.SCRUTINY.value
        try:
            return WorkflowStage(raw)
        except ValueError:
            return WorkflowStage.SCRUTINY

    @staticmethod
    def get_stage_ageing_days(app: Application) -> int:
        ref_time = app.submitted_at or app.updated_at or datetime.now(timezone.utc)
        if ref_time.tzinfo is None:
            ref_time = ref_time.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        delta = now - ref_time
        return max(0, delta.days)

    def recommend_stage(self, db: Session, app: Application) -> tuple[WorkflowStage, str, list[str]]:
        """Advisory recommendation for the next pipeline stage.
        Tracenza routes and suggests; officers make the decision.
        """
        reasons: list[str] = []

        if app.status == ApplicationStatus.APPROVED:
            return WorkflowStage.FINAL_REVIEW, "Approval already recorded in ledger", ["Final decision recorded"]
        if app.status == ApplicationStatus.REJECTED:
            return WorkflowStage.SAC_SHC, "Hearing closed / Adverse determination", ["Under SAC appeal review"]

        findings = db.query(ValidationResult).filter(ValidationResult.application_id == app.id).all()
        reds = [f for f in findings if f.rag == RED]
        ambers = [f for f in findings if f.rag == AMBER]

        # Check for physical infrastructure/lab shortfalls requiring EVC on-site visit
        infra_reds = [f for f in reds if any(k in (f.rule_code or "").lower() or k in (f.check_type.value or "").lower()
                                             for k in ("lab", "bld", "geo", "land", "infra", "equipment"))]
        if infra_reds or app.ai_recommendation == AIRecommendation.INSPECTION:
            reasons.append(f"{len(infra_reds)} infrastructure/lab discrepancies flagged for physical/virtual verification")
            return WorkflowStage.EVC, "Physical/Virtual EVC inspection recommended", reasons

        # Check for active deficiency notices or statutory compliance hearing
        if app.status == ApplicationStatus.DEFICIENCY_FOUND or len(ambers) >= 3:
            reasons.append("Unresolved statutory clarifications / deficiency notice pending response")
            return WorkflowStage.SAC_SHC, "SAC/SHC hearing review recommended", reasons

        # If significant unresolved RED anomalies exist, stay in Scrutiny for officer triage
        if reds:
            reasons.append(f"{len(reds)} unconfirmed red compliance findings require officer resolution")
            return WorkflowStage.SCRUTINY, "Scrutiny officer review required", reasons

        # All norms clear or verified
        reasons.append("All statutory document checks and APH norms verified compliant")
        return WorkflowStage.FINAL_REVIEW, "Application eligible for Final Review", reasons

    def transition_stage(
        self,
        db: Session,
        app: Application,
        to_stage: WorkflowStage,
        officer: User,
        reason: str,
        committee_notes: str | None = None,
    ) -> Application:
        """Execute an officer-authorized stage transition.
        Enforces the principle: 'Officers decide. Tracenza routes, reminds, flags, and records.'
        """
        clean_reason = (reason or "").strip()
        if len(clean_reason) < 10:
            raise ValueError("A written reason of at least 10 characters is mandatory for stage routing")

        from_stage = self.get_current_stage(app)
        rec_stage, rec_label, _ = self.recommend_stage(db, app)
        overrides_recommendation = to_stage != rec_stage

        app.stage = to_stage.value
        app.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(app)

        # Cryptographically record transition into the append-only audit ledger
        audit_service.log_event(
            db=db,
            action="STAGE_TRANSITION",
            user_id=officer.id,
            application_id=app.id,
            actor_role=officer.role.value if hasattr(officer.role, "value") else str(officer.role),
            details={
                "from_stage": from_stage.value,
                "to_stage": to_stage.value,
                "reason": clean_reason,
                "committee_notes": (committee_notes or "").strip(),
                "recommended_stage": rec_stage.value,
                "overrides_recommendation": overrides_recommendation,
                "officer_name": officer.full_name,
            },
        )
        logger.info(
            f"Application {app.application_number} transitioned from {from_stage.value} to {to_stage.value} "
            f"by {officer.email}. Reason: {clean_reason}"
        )
        return app


pipeline_service = PipelineService()

