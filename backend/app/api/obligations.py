"""Obligation & Expiry Tracking API endpoints (Officers & System)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_official
from app.models.user import User
from app.services.obligation_service import obligation_service, ALERT_DISPATCH_QUEUE

router = APIRouter(prefix="/obligations", tags=["Compliance Obligations & Expiry Tracking"])
Official = Annotated[User, Depends(require_official)]
DB = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[dict[str, Any]])
def list_obligations(
    db: DB,
    current_user: Annotated[User, Depends(get_current_user)],
    status: str | None = Query(None, description="Filter by status: OVERDUE, UPCOMING, COMPLIANT"),
    obligation_type: str | None = Query(None, description="Filter by obligation type"),
):
    """List time-sensitive statutory compliance obligations across applications."""
    return obligation_service.get_all_obligations(db, filter_status=status, filter_type=obligation_type)


@router.get("/summary", response_model=dict[str, Any])
def obligations_summary(
    db: DB,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Return summary KPIs: total, overdue, upcoming, and distribution by type."""
    return obligation_service.get_summary(db)


@router.get("/alerts", response_model=list[dict[str, Any]])
def recent_alert_dispatches(
    current_user: Official,
):
    """View recent automated multi-channel alert records (Email, SMS, WhatsApp queues)."""
    return list(reversed(ALERT_DISPATCH_QUEUE))


@router.post("/sweep", response_model=dict[str, Any])
def trigger_obligation_sweep(
    db: DB,
    current_user: Official,
):
    """Manually trigger an obligation monitoring sweep to flag upcoming/overdue items and dispatch alerts."""
    return obligation_service.periodic_obligation_sweep(db)


@router.get("/{app_id}", response_model=list[dict[str, Any]])
def get_application_obligations(
    app_id: uuid.UUID,
    db: DB,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get all compliance obligations for a specific application."""
    from app.core.dependencies import get_application_for_user
    app = get_application_for_user(db, app_id, current_user)
    return obligation_service.extract_obligations_for_application(db, app)

