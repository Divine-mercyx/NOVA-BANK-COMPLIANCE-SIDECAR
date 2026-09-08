"""Background and chunked ETL execution helpers."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.entities import ExtractionRun, ExtractionStatus
from app.schemas.compliance import TransactionChannel
from app.services.etl.pipeline import ETLPipeline

logger = logging.getLogger(__name__)


async def execute_etl_background(
    run_id: str,
    channels: list[TransactionChannel] | None,
    date_from: datetime | None,
    date_to: datetime | None,
    actor_name: str = "System",
) -> None:
    logger.info("Background ETL worker started for run %s", run_id)
    async with AsyncSessionLocal() as db:
        pipeline = ETLPipeline(db)
        try:
            await pipeline._log(run_id, "INFO", None, "Background worker started — connecting to Oracle…")
            await db.commit()
            await pipeline.execute_run(run_id, channels, date_from, date_to, actor_name)
        except Exception as exc:
            logger.exception("Background ETL failed for run %s", run_id)
            result = await db.execute(select(ExtractionRun).where(ExtractionRun.id == run_id))
            run = result.scalar_one_or_none()
            if run and run.status == ExtractionStatus.RUNNING:
                run.status = ExtractionStatus.FAILED
                run.completed_at = datetime.now(timezone.utc)
                run.error_summary = str(exc)
                await pipeline._log(run_id, "ERROR", None, str(exc))
                await db.commit()
