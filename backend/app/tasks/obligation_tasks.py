"""Celery task for periodic obligation & expiry monitoring sweeps."""

import logging
from app.core.celery_app import celery
from app.core.database import SessionLocal
from app.services.obligation_service import obligation_service

logger = logging.getLogger(__name__)


@celery.task(
    name="app.tasks.obligation_tasks.sweep_obligations_and_dispatch_alerts",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=3,
)
def sweep_obligations_and_dispatch_alerts():
    """Periodic Celery Beat task that evaluates time-sensitive compliance obligations."""
    logger.info("Executing Celery Beat periodic obligation sweep...")
    db = SessionLocal()
    try:
        result = obligation_service.periodic_obligation_sweep(db)
        logger.info(
            f"Obligation sweep completed: {result['total_obligations']} evaluated, "
            f"{result['overdue_flagged']} overdue, {result['alerts_dispatched']} alerts dispatched"
        )
        return result
    finally:
        db.close()

