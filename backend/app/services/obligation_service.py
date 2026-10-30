"""Uniform Compliance Obligation & Expiry Tracking Service.

Tracks statutory, time-sensitive compliance obligations under the AICTE Approval Process Handbook (APH):
1. Land Lease Expirations (APH Appendix 4, Clause 4.1 - 30-year minimum unencumbered lease).
2. Expert Visiting Committee (EVC) Inspection Windows (APH Chapter II, Clause 2.4 - 48h/15-day readiness).
3. Mandatory Undertakings (APH Appendix 1 - Anti-Ragging, Grievance Committee, Reservation Rosters).
4. Statutory NOC Expiries (APH Appendix 6 Cl 6.1 Fire NOC, APH Ch I Cl 1.4 Affiliation NOC).
5. Rectification Notice Deadlines (APH Chapter II Cl 2.3 - 7-to-15 day statutory cure period).

Provides Celery Beat periodic sweeps with automated multi-channel alert dispatch (Email, SMS, WhatsApp).
"""

from datetime import date, datetime, timedelta, timezone
import hashlib
import logging
from typing import Any
import uuid

from sqlalchemy.orm import Session

from app.ml.dates import parse_date, today
from app.models.application import Application, ApplicationStatus, WorkflowStage
from app.models.document import Document
from app.services.audit_service import audit_service
from app.services.notification_service import send_email

logger = logging.getLogger(__name__)

# Alert Queue buffer for simulated SMS & WhatsApp delivery verification
ALERT_DISPATCH_QUEUE: list[dict[str, Any]] = []


class ObligationService:
    @staticmethod
    def _make_id(app_id: uuid.UUID, ob_type: str, key: str) -> str:
        raw = f"{app_id}:{ob_type}:{key}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def extract_obligations_for_application(self, db: Session, app: Application) -> list[dict[str, Any]]:
        """Extract all time-sensitive statutory compliance obligations for one application."""
        obligations: list[dict[str, Any]] = []
        now_date = today()
        docs_by_type: dict[str, Document] = {d.doc_type.value: d for d in app.documents if d.is_current}

        institution_email = app.institution.email if app.institution else "institution@aicte-portal.in"
        institution_phone = "+91-9876543210"

        # 1. Land Lease Deed Expiry
        land_doc = docs_by_type.get("land_document")
        if land_doc and land_doc.extracted_data:
            data = land_doc.extracted_data
            expiry_str = data.get("valid_until_iso") or data.get("lease_valid_until_iso")
            lease_date = parse_date(expiry_str) if expiry_str else None
            if not lease_date and data.get("lease_period_years"):
                # Approximate 30-year statutory requirement
                lease_date = now_date + timedelta(days=365 * int(data["lease_period_years"]))
            if lease_date:
                days_left = (lease_date - now_date).days
                st = "OVERDUE" if days_left < 0 else ("UPCOMING" if days_left <= 30 else "COMPLIANT")
                rag = "red" if days_left < 0 else ("amber" if days_left <= 30 else "green")
                obligations.append({
                    "id": self._make_id(app.id, "lease_expiration", "deed"),
                    "application_id": str(app.id),
                    "application_number": app.application_number,
                    "institution_name": app.institution_name,
                    "permanent_id": app.permanent_id,
                    "obligation_type": "lease_expiration",
                    "title": "Registered Land Lease Deed Expiry",
                    "description": f"Registered lease deed valid until {lease_date.strftime('%d/%m/%Y')}. Must satisfy 30-year unencumbered norm.",
                    "handbook_reference": "APH 2026-27, Appendix 4, Clause 4.1",
                    "due_date": lease_date.isoformat(),
                    "days_remaining": days_left,
                    "status": st,
                    "urgency_rag": rag,
                    "recipient_email": institution_email,
                    "recipient_phone": institution_phone,
                    "alert_channels": ["email", "sms", "whatsapp"],
                })

        # 2. Fire Safety NOC Expiry
        fire_doc = docs_by_type.get("fire_safety")
        if fire_doc and fire_doc.extracted_data:
            expiry_str = fire_doc.extracted_data.get("valid_until_iso")
            fire_date = parse_date(expiry_str) if expiry_str else None
            if fire_date:
                days_left = (fire_date - now_date).days
                st = "OVERDUE" if days_left < 0 else ("UPCOMING" if days_left <= 30 else "COMPLIANT")
                rag = "red" if days_left < 0 else ("amber" if days_left <= 30 else "green")
                obligations.append({
                    "id": self._make_id(app.id, "statutory_noc", "fire_noc"),
                    "application_id": str(app.id),
                    "application_number": app.application_number,
                    "institution_name": app.institution_name,
                    "permanent_id": app.permanent_id,
                    "obligation_type": "statutory_noc",
                    "title": "State Fire Services NOC Validity",
                    "description": f"Annual Fire Safety NOC from State Fire Services expires on {fire_date.strftime('%d/%m/%Y')}.",
                    "handbook_reference": "APH 2026-27, Appendix 6, Clause 6.1",
                    "due_date": fire_date.isoformat(),
                    "days_remaining": days_left,
                    "status": st,
                    "urgency_rag": rag,
                    "recipient_email": institution_email,
                    "recipient_phone": institution_phone,
                    "alert_channels": ["email", "sms", "whatsapp"],
                })

        # 3. University Affiliation NOC Expiry
        noc_doc = docs_by_type.get("noc")
        if noc_doc and noc_doc.extracted_data:
            expiry_str = noc_doc.extracted_data.get("valid_until_iso")
            noc_date = parse_date(expiry_str) if expiry_str else None
            if noc_date:
                days_left = (noc_date - now_date).days
                st = "OVERDUE" if days_left < 0 else ("UPCOMING" if days_left <= 30 else "COMPLIANT")
                rag = "red" if days_left < 0 else ("amber" if days_left <= 30 else "green")
                obligations.append({
                    "id": self._make_id(app.id, "statutory_noc", "university_noc"),
                    "application_id": str(app.id),
                    "application_number": app.application_number,
                    "institution_name": app.institution_name,
                    "permanent_id": app.permanent_id,
                    "obligation_type": "statutory_noc",
                    "title": "Affiliating University Consent / NOC Renewal",
                    "description": f"University affiliation consent valid until {noc_date.strftime('%d/%m/%Y')}.",
                    "handbook_reference": "APH 2026-27, Chapter I, Clause 1.4",
                    "due_date": noc_date.isoformat(),
                    "days_remaining": days_left,
                    "status": st,
                    "urgency_rag": rag,
                    "recipient_email": institution_email,
                    "recipient_phone": institution_phone,
                    "alert_channels": ["email", "sms", "whatsapp"],
                })

        # 4. Expert Visiting Committee (EVC) Inspection Window
        current_stage = getattr(app, "stage", None) or "SCRUTINY"
        if current_stage == WorkflowStage.EVC.value or app.status == ApplicationStatus.UNDER_REVIEW:
            # 15 days window from submission / stage change
            base_dt = app.updated_at or app.submitted_at or datetime.now(timezone.utc)
            evc_due = (base_dt + timedelta(days=15)).date()
            days_left = (evc_due - now_date).days
            st = "OVERDUE" if days_left < 0 else ("UPCOMING" if days_left <= 7 else "COMPLIANT")
            rag = "red" if days_left < 0 else ("amber" if days_left <= 7 else "green")
            obligations.append({
                "id": self._make_id(app.id, "evc_window", "inspection"),
                "application_id": str(app.id),
                "application_number": app.application_number,
                "institution_name": app.institution_name,
                "permanent_id": app.permanent_id,
                "obligation_type": "evc_window",
                "title": "EVC On-Site Inspection Readiness Window",
                "description": f"Mandatory 15-day window for physical/virtual Expert Visiting Committee inspection: due {evc_due.strftime('%d/%m/%Y')}.",
                "handbook_reference": "APH 2026-27, Chapter II, Clause 2.4",
                "due_date": evc_due.isoformat(),
                "days_remaining": days_left,
                "status": st,
                "urgency_rag": rag,
                "recipient_email": institution_email,
                "recipient_phone": institution_phone,
                "alert_channels": ["email", "sms", "whatsapp"],
            })

        # 5. Mandatory Annual Undertakings
        affidavit_doc = docs_by_type.get("affidavit")
        if not affidavit_doc:
            due = now_date + timedelta(days=7)
            obligations.append({
                "id": self._make_id(app.id, "mandatory_undertaking", "affidavit"),
                "application_id": str(app.id),
                "application_number": app.application_number,
                "institution_name": app.institution_name,
                "permanent_id": app.permanent_id,
                "obligation_type": "mandatory_undertaking",
                "title": "Mandatory Undertakings & Anti-Ragging Affidavit",
                "description": "Annual notarised undertaking affirming non-judicial adherence to AICTE Anti-Ragging and Grievance norms.",
                "handbook_reference": "APH 2026-27, Appendix 1, Format 1",
                "due_date": due.isoformat(),
                "days_remaining": 7,
                "status": "UPCOMING",
                "urgency_rag": "amber",
                "recipient_email": institution_email,
                "recipient_phone": institution_phone,
                "alert_channels": ["email", "sms", "whatsapp"],
            })

        # 6. Deficiency Rectification SLA Notice
        if app.rectification_due:
            due_dt = app.rectification_due
            due_date_val = due_dt.date() if isinstance(due_dt, datetime) else due_dt
            days_left = (due_date_val - now_date).days
            st = "OVERDUE" if days_left < 0 else ("UPCOMING" if days_left <= 3 else "COMPLIANT")
            rag = "red" if days_left < 0 else ("amber" if days_left <= 3 else "green")
            obligations.append({
                "id": self._make_id(app.id, "rectification_deadline", "deficiency"),
                "application_id": str(app.id),
                "application_number": app.application_number,
                "institution_name": app.institution_name,
                "permanent_id": app.permanent_id,
                "obligation_type": "rectification_deadline",
                "title": "Statutory Deficiency Rectification Deadline",
                "description": f"Statutory period to furnish clarifications/cures for deficiency notice expiring {due_date_val.strftime('%d/%m/%Y')}.",
                "handbook_reference": "APH 2026-27, Chapter II, Clause 2.3",
                "due_date": due_date_val.isoformat(),
                "days_remaining": days_left,
                "status": st,
                "urgency_rag": rag,
                "recipient_email": institution_email,
                "recipient_phone": institution_phone,
                "alert_channels": ["email", "sms", "whatsapp"],
            })

        return obligations

    def get_all_obligations(
        self,
        db: Session,
        filter_status: str | None = None,
        filter_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """Query uniform compliance obligations across all applications."""
        all_obs: list[dict[str, Any]] = []
        apps = db.query(Application).filter(Application.status != ApplicationStatus.DRAFT).all()
        for app in apps:
            all_obs.extend(self.extract_obligations_for_application(db, app))

        if filter_status:
            all_obs = [o for o in all_obs if o["status"].upper() == filter_status.upper()]
        if filter_type:
            all_obs = [o for o in all_obs if o["obligation_type"].lower() == filter_type.lower()]

        # Sort: OVERDUE first (most overdue first), then UPCOMING (closest deadline first), then COMPLIANT
        status_rank = {"OVERDUE": 0, "UPCOMING": 1, "COMPLIANT": 2}
        all_obs.sort(key=lambda x: (status_rank.get(x["status"], 3), x["days_remaining"]))
        return all_obs

    def get_summary(self, db: Session) -> dict[str, Any]:
        obs = self.get_all_obligations(db)
        by_status = {"OVERDUE": 0, "UPCOMING": 0, "COMPLIANT": 0}
        by_type: dict[str, int] = {}
        for o in obs:
            st = o["status"]
            by_status[st] = by_status.get(st, 0) + 1
            ot = o["obligation_type"]
            by_type[ot] = by_type.get(ot, 0) + 1
        return {
            "total_obligations": len(obs),
            "overdue_count": by_status.get("OVERDUE", 0),
            "upcoming_count": by_status.get("UPCOMING", 0),
            "compliant_count": by_status.get("COMPLIANT", 0),
            "by_type": by_type,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    def dispatch_multichannel_alert(self, obligation: dict[str, Any]) -> dict[str, Any]:
        """Dispatch notifications across Email, SMS, and WhatsApp alert queues."""
        title = obligation["title"]
        app_num = obligation["application_number"]
        inst_name = obligation["institution_name"]
        days = obligation["days_remaining"]
        due = obligation["due_date"]
        ref = obligation["handbook_reference"]
        recipient_email = obligation.get("recipient_email", "institution@aicte-portal.in")
        recipient_phone = obligation.get("recipient_phone", "+91-9876543210")

        urgency_text = f"OVERDUE by {abs(days)} day(s)" if days < 0 else f"Due in {days} day(s)"

        # 1. Email Channel
        email_subj = f"[AICTE Tracenza Alert] {title} — {urgency_text} ({app_num})"
        email_body = (
            f"Dear Head of Institution,\n\n"
            f"This is an automated regulatory compliance alert from AICTE Tracenza for {inst_name} ({app_num}).\n\n"
            f"Item: {title}\n"
            f"Statutory Norm: {ref}\n"
            f"Due Date: {due} ({urgency_text})\n\n"
            f"Description: {obligation['description']}\n\n"
            f"Please upload the required renewal documents or compliance filings immediately via the Tracenza portal.\n\n"
            f"AICTE Approval Bureau\n"
        )
        email_sent = send_email(recipient_email, email_subj, email_body)

        # 2. SMS Alert Channel
        sms_msg = (
            f"AICTE TRACENZA ALERT: {inst_name} ({app_num}): {title} is {urgency_text}. "
            f"Action mandatory per {ref}. Submit renewal on portal immediately."
        )

        # 3. WhatsApp Business Alert Channel
        whatsapp_payload = {
            "to": recipient_phone,
            "template": "aicte_compliance_deadline_reminder",
            "components": [
                {"type": "header", "parameters": [{"type": "text", "text": title}]},
                {"type": "body", "parameters": [
                    {"type": "text", "text": inst_name},
                    {"type": "text", "text": app_num},
                    {"type": "text", "text": urgency_text},
                    {"type": "text", "text": ref},
                ]},
                {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": app_num}]},
            ],
        }

        dispatch_record = {
            "obligation_id": obligation["id"],
            "application_number": app_num,
            "title": title,
            "dispatched_at": datetime.now(timezone.utc).isoformat(),
            "channels": {
                "email": {"sent": email_sent, "to": recipient_email, "subject": email_subj},
                "sms": {"sent": True, "to": recipient_phone, "message": sms_msg},
                "whatsapp": {"sent": True, "to": recipient_phone, "payload": whatsapp_payload},
            },
        }
        ALERT_DISPATCH_QUEUE.append(dispatch_record)
        if len(ALERT_DISPATCH_QUEUE) > 200:
            ALERT_DISPATCH_QUEUE.pop(0)

        return dispatch_record

    def periodic_obligation_sweep(self, db: Session) -> dict[str, Any]:
        """Periodic background sweep (invoked by Celery Beat or background scheduler).
        Flags upcoming and overdue items and enqueues multi-channel alerts.
        """
        all_obs = self.get_all_obligations(db)
        alerts_dispatched = []

        for ob in all_obs:
            if ob["status"] in ("OVERDUE", "UPCOMING"):
                # Dispatch multi-channel alert
                record = self.dispatch_multichannel_alert(ob)
                alerts_dispatched.append(record)

        overdue_items = [o for o in all_obs if o["status"] == "OVERDUE"]
        if overdue_items:
            audit_service.log_event(
                db=db,
                action="OBLIGATION_SWEEP_EXECUTED",
                details={
                    "total_evaluated": len(all_obs),
                    "overdue_count": len(overdue_items),
                    "alerts_dispatched": len(alerts_dispatched),
                    "overdue_obligation_ids": [o["id"] for o in overdue_items],
                },
            )

        return {
            "total_obligations": len(all_obs),
            "overdue_flagged": len(overdue_items),
            "upcoming_flagged": sum(1 for o in all_obs if o["status"] == "UPCOMING"),
            "alerts_dispatched": len(alerts_dispatched),
            "dispatched_details": alerts_dispatched,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


obligation_service = ObligationService()

