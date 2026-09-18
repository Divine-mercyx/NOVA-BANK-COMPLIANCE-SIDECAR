"""Scheduled HTD nightly ETL and on-demand 30-minute DTD feed."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.etl.pipeline import ETLPipeline

logger = logging.getLogger("nova.scheduler")
_scheduler: AsyncIOScheduler | None = None
DTD_JOB_ID = "dtd_interval"


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


async def run_scheduled_dtd() -> None:
    from app.services.etl.dtd_control import run_scheduled_tick

    logger.info("DTD interval tick")
    try:
        async with AsyncSessionLocal() as db:
            await run_scheduled_tick(db)
    except Exception:
        logger.exception("DTD interval tick failed")


def _ensure_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.start()
    return _scheduler


def start_etl_scheduler() -> AsyncIOScheduler | None:
    scheduler = _ensure_scheduler()
    if settings.etl_schedule_enabled:
        scheduler.add_job(
            run_scheduled_etl,
            CronTrigger(hour=settings.etl_schedule_hour, minute=settings.etl_schedule_minute),
            id="daily_etl",
            replace_existing=True,
        )
        logger.info(
            "ETL scheduler started — daily at %02d:%02d UTC",
            settings.etl_schedule_hour,
            settings.etl_schedule_minute,
        )
    else:
        logger.info("Nightly HTD ETL scheduler disabled (ETL_SCHEDULE_ENABLED)")
    minutes = max(settings.dtd_schedule_interval_minutes, 5)
    scheduler.add_job(
        run_scheduled_dtd,
        IntervalTrigger(minutes=minutes),
        id=DTD_JOB_ID,
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        next_run_time=None,
    )
    logger.info("DTD interval job registered (paused until Start on Daily Transactions page)")
    return scheduler


def resume_dtd_job(interval_minutes: int, *, pull_immediately: bool) -> None:
    scheduler = _ensure_scheduler()
    minutes = max(interval_minutes or settings.dtd_schedule_interval_minutes, 5)
    next_run = datetime.now(timezone.utc) if pull_immediately else datetime.now(timezone.utc) + timedelta(minutes=minutes)
    scheduler.add_job(
        run_scheduled_dtd,
        IntervalTrigger(minutes=minutes),
        id=DTD_JOB_ID,
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        next_run_time=next_run,
    )
    logger.info("DTD feed armed — next Oracle pull at %s", next_run.isoformat())


def pause_dtd_job() -> None:
    if not _scheduler:
        return
    job = _scheduler.get_job(DTD_JOB_ID)
    if job:
        job.pause()
        logger.info("DTD feed paused")


def dtd_job_next_run() -> datetime | None:
    if not _scheduler:
        return None
    job = _scheduler.get_job(DTD_JOB_ID)
    if not job:
        return None
    return job.next_run_time


async def restore_dtd_job_from_db() -> None:
    from app.services.etl.dtd_control import get_state

    async with AsyncSessionLocal() as db:
        state = await get_state(db)
        await db.commit()
        if state.enabled:
            resume_dtd_job(state.interval_minutes, pull_immediately=False)
            logger.info("DTD feed restored from database (was running before restart)")


def stop_etl_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Schedulers stopped")
    _scheduler = None
