"""Triage & Officer Console (authorized officials only).

Provides human-in-the-loop review, stage progression routing, and compliance triage.
Philosophy: "Officers decide. Tracenza routes, reminds, flags, and records. It never approves or rejects."
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_application_for_user, require_official
from app.models.application import Application, ApplicationStatus, WorkflowStage
from app.models.finding_review import FindingReview, ReviewDecision
from app.models.user import User
from app.models.validation_result import ValidationResult
from app.schemas.application import ApplicationResponse, ApplicationStageTransition
from app.schemas.validation import ValidationResultResponse
from app.services.audit_service import audit_service
from app.services.compliance_service import compliance_service
from app.services.graph_service import graph_service
from app.services.notification_service import notification_service
from app.services.obligation_service import obligation_service
from app.services.pipeline import pipeline_service
from app.services.rule_engine import AMBER, GREEN, RED
from app.services.triage_service import approval_blockers, red_status

router = APIRouter(prefix="/triage", tags=["Triage & Human Console (officers only)"])
Official = Annotated[User, Depends(require_official)]
DB = Annotated[Session, Depends(get_db)]


@router.get("/queue")
def triage_queue(db: DB, current_user: Official):
    """Applications ordered by unreviewed red items, then risk, with APH workflow stage tracking."""
    out = []
    for app in db.query(Application).filter(Application.status != ApplicationStatus.DRAFT).order_by(desc(Application.risk_score)).all():
        rows = db.query(ValidationResult.rag, ValidationResult.actionable_by).filter(ValidationResult.application_id == app.id).all()
        s = red_status(db, app)
        rec_stage, rec_label, _ = pipeline_service.recommend_stage(db, app)
        stage_val = getattr(app, "stage", None) or WorkflowStage.SCRUTINY.value
        ageing = pipeline_service.get_stage_ageing_days(app)
        blockers = approval_blockers(db, app)

        out.append({
            "application": ApplicationResponse.model_validate(app).model_dump(mode="json"),
            "stage": stage_val,
            "stage_ageing_days": ageing,
            "recommended_stage": rec_stage.value,
            "recommendation_reason": rec_label,
            "red": s["total"],
            "red_unreviewed": len(s["unreviewed"]),
            "red_confirmed": len(s["confirmed"]),
            "amber": sum(1 for r, _ in rows if r == AMBER),
            "amber_institution": sum(1 for r, a in rows if r == AMBER and a == "institution"),
            "blockers_count": len(blockers),
            "blockers": blockers,
        })
    out.sort(key=lambda x: (-x["red_unreviewed"], -x["application"]["risk_score"]))
    return out


@router.get("/{app_id}")
def triage_bundle(app_id: uuid.UUID, db: DB, current_user: Official):
    """Everything the split-screen review needs for one application:
    rules, findings, documents, uniform obligations, blockers, and pipeline routing.
    """
    app = get_application_for_user(db, app_id, current_user)
    outcomes = compliance_service.evaluate(db, app)
    s = red_status(db, app)
    findings = []
    for f in db.query(ValidationResult).filter(ValidationResult.application_id == app.id).all():
        item = ValidationResultResponse.model_validate(f).model_dump(mode="json")
        review = s["reviews"].get(f.fingerprint)
        item["review"] = (
            {
                "decision": review.decision.value,
                "reason": review.reason,
                "at": review.created_at.isoformat(),
                "reviewer_id": str(review.reviewer_id),
            }
            if review
            else None
        )
        findings.append(item)
    order = {RED: 0, AMBER: 1, GREEN: 2}
    findings.sort(key=lambda x: (order.get(x.get("rag"), 3), x["check_type"]))

    docs = [
        {
            "id": str(d.id),
            "doc_type": d.doc_type.value,
            "filename": d.original_filename,
            "status": d.status.value,
            "mime_type": d.mime_type,
            "page_count": d.page_count,
            "uploaded_at": d.uploaded_at.isoformat(),
            "watermark": (d.custody or {}).get("watermark"),
            "original_sha256": d.content_hash,
            "stored_sha256": (d.custody or {}).get("stored_sha256"),
        }
        for d in sorted(app.documents, key=lambda d: d.uploaded_at)
        if d.is_current
    ]

    rec_stage, rec_label, factors = pipeline_service.recommend_stage(db, app)
    current_stage = getattr(app, "stage", None) or WorkflowStage.SCRUTINY.value
    stage_ageing = pipeline_service.get_stage_ageing_days(app)
    obligations = obligation_service.extract_obligations_for_application(db, app)

    return {
        "application": ApplicationResponse.model_validate(app).model_dump(mode="json"),
        "stage": current_stage,
        "pipeline_state": {
            "current_stage": current_stage,
            "stage_ageing_days": stage_ageing,
            "recommended_stage": rec_stage.value,
            "recommendation_reason": rec_label,
            "factors": factors,
        },
        "rules": outcomes,
        "findings": findings,
        "documents": docs,
        "obligations": obligations,
        "counts": {
            "green_rules": sum(1 for o in outcomes if o["rag"] == GREEN),
            "amber": sum(1 for f in findings if f["rag"] == AMBER),
            "red": s["total"],
            "red_unreviewed": len(s["unreviewed"]),
            "overdue_obligations": sum(1 for o in obligations if o["status"] == "OVERDUE"),
        },
        "approval_blockers": approval_blockers(db, app),
        "clarification_candidates": [str(f.id) for f in notification_service.clarification_candidates(db, app)],
    }


class ReviewIn(BaseModel):
    decision: ReviewDecision
    reason: str = Field(min_length=10, max_length=1000)


@router.post("/{app_id}/findings/{finding_id}/review")
def review_finding(app_id: uuid.UUID, finding_id: uuid.UUID, body: ReviewIn, db: DB, current_user: Official):
    """Officer confirms a RED anomaly as genuine, or overrides it with a recorded reason."""
    app = get_application_for_user(db, app_id, current_user)
    f = db.query(ValidationResult).filter(ValidationResult.id == finding_id, ValidationResult.application_id == app.id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")
    if f.rag != RED:
        raise HTTPException(status_code=422, detail="Only red findings are confirmed or overridden")
    review = FindingReview(
        application_id=app.id,
        fingerprint=f.fingerprint,
        finding_text=f.finding,
        decision=body.decision,
        reason=body.reason.strip(),
        reviewer_id=current_user.id,
    )
    db.add(review)
    db.commit()
    audit_service.log_event(
        db=db,
        action="FINDING_REVIEWED",
        user_id=current_user.id,
        application_id=app.id,
        details={
            "finding_id": str(f.id),
            "fingerprint": f.fingerprint,
            "decision": body.decision.value,
            "reason": body.reason.strip(),
            "check_type": f.check_type.value,
            "rule_code": f.rule_code,
        },
    )
    return {"decision": body.decision.value, "approval_blockers": approval_blockers(db, app)}


@router.post("/{app_id}/stage")
def transition_stage(
    app_id: uuid.UUID,
    body: ApplicationStageTransition,
    db: DB,
    current_user: Official,
):
    """Officer routes application to the next pipeline stage:
    SCRUTINY -> EVC -> SAC_SHC -> FINAL_REVIEW.
    Requires mandatory written reason (min 10 chars) recorded in the hash-chained audit ledger.
    """
    app = get_application_for_user(db, app_id, current_user)
    try:
        updated_app = pipeline_service.transition_stage(
            db=db,
            app=app,
            to_stage=body.stage,
            officer=current_user,
            reason=body.reason,
            committee_notes=body.committee_notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {
        "status": "success",
        "stage": updated_app.stage,
        "application_number": updated_app.application_number,
        "reason": body.reason.strip(),
    }


@router.get("/{app_id}/graph")
def collusion_graph(app_id: uuid.UUID, db: DB, current_user: Official):
    app = get_application_for_user(db, app_id, current_user)
    return graph_service.subgraph(db, app)
