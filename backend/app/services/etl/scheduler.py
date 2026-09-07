"""Scheduled daily ETL extraction."""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.etl.pipeline import ETLPipeline

logger = logging.getLogger("nova.scheduler")
_scheduler: AsyncIOScheduler | None = None


async def run_scheduled_etl() -> None:
    logger.info("Starting scheduled ETL (mode=%s)", settings.finacle_mode)
    async with AsyncSessionLocal() as db:
        run = await ETLPipeline(db).run(actor_name="ETL Scheduler")
        logger.info(
            "Scheduled ETL finished: status=%s extracted=%s valid=%s",
            run.status.value,
            run.records_extracted,
            run.records_valid,
        )


def start_etl_scheduler() -> AsyncIOScheduler | None:
    global _scheduler
    if not settings.etl_schedule_enabled:
        logger.info("ETL scheduler disabled (set ETL_SCHEDULE_ENABLED=true to enable)")
        return None
    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        run_scheduled_etl,
        CronTrigger(hour=settings.etl_schedule_hour, minute=settings.etl_schedule_minute),
        id="daily_etl",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "ETL scheduler started — daily at %02d:%02d UTC",
        settings.etl_schedule_hour,
        settings.etl_schedule_minute,
    )
    return _scheduler


def stop_etl_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("ETL scheduler stopped")
    _scheduler = None
