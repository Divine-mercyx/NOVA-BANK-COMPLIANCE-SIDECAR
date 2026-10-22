"""Close orphaned RUNNING jobs after API restart (no in-process worker survives a restart)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.entities import DtdPullRun, ExtractionRun, ExtractionStatus

logger = logging.getLogger("nova.etl")

_INTERRUPTED = "Interrupted — application restarted before the job finished"


async def reconcile_interrupted_jobs() -> int:
    """Mark stale RUNNING extraction/DTD pulls as failed. Returns rows updated."""
    now = datetime.now(timezone.utc)
    updated = 0
    async with AsyncSessionLocal() as db:
        ext = await db.execute(select(ExtractionRun).where(ExtractionRun.status == ExtractionStatus.RUNNING))
        for run in ext.scalars():
            run.status = ExtractionStatus.FAILED
            run.completed_at = now
            run.error_summary = _INTERRUPTED
            updated += 1

        dtd = await db.execute(select(DtdPullRun).where(DtdPullRun.status == ExtractionStatus.RUNNING))
        for pull in dtd.scalars():
            pull.status = ExtractionStatus.FAILED
            pull.completed_at = now
            pull.error_summary = _INTERRUPTED
            updated += 1

        if updated:
            await db.commit()
            logger.warning("Reconciled %s interrupted RUNNING job(s) after startup", updated)
    return updated
