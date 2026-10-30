"""Pydantic schemas for dashboard metrics, alerts and activity."""

from datetime import datetime
from typing import Any
from pydantic import BaseModel


class DashboardStatsResponse(BaseModel):
    total_applications: int
    awaiting_review: int
    deficiency_found: int
    approved: int
    rejected: int
    high_risk_flagged: int
    total_documents_processed: int
    tamper_suspected_count: int
    duplicate_flags: int
    pending_source_verifications: int
    avg_processing_seconds_per_document: float | None
    overdue_rectifications: int
    # AICTE Workflow Pipeline & Compliance KPIs
    pending_scrutiny: int = 0
    evc_pending: int = 0
    overdue_obligations: int = 0
    stage_ageing_avg_days: float = 0.0


class RiskDistributionItem(BaseModel):
    category: str
    count: int
    color: str


class AlertItem(BaseModel):
    id: str
    application_id: str
    application_number: str
    institution_name: str
    title: str
    severity: str
    check_type: str
    message: str
    created_at: datetime


class ActivityItem(BaseModel):
    id: str
    action: str
    user_name: str
    institution_name: str
    timestamp: datetime
    details: str


class MetricsResponse(BaseModel):
    verification: dict[str, Any]
    forensics: dict[str, Any]
    processing: dict[str, Any]
    decisions: dict[str, Any]
