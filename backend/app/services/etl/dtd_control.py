"""Portal start/stop for the 30-minute TBAADM.DTD feed."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import DtdPullRun, DtdSchedulerState, DtdTransaction, ExtractionStatus, User
from app.services.etl.dtd_pipeline import DtdPipeline, lagos_day_bounds

STATE_ID = "default"
OVERLAP = timedelta(minutes=5)


def _tz() -> ZoneInfo:
    return ZoneInfo(settings.finacle_timezone)


def _today() -> date:
    return datetime.now(_tz()).date()


async def get_state(db: AsyncSession) -> DtdSchedulerState:
    result = await db.execute(select(DtdSchedulerState).where(DtdSchedulerState.id == STATE_ID))
    row = result.scalar_one_or_none()
    if row:
        if not row.interval_minutes:
            row.interval_minutes = max(settings.dtd_schedule_interval_minutes, 5)
        return row
    row = DtdSchedulerState(
        id=STATE_ID,
        enabled=False,
        interval_minutes=max(settings.dtd_schedule_interval_minutes, 5),
    )
    db.add(row)
    await db.flush()
    return row


def resolve_posted_since(state: DtdSchedulerState, day: date, *, rescan: bool) -> datetime:
    """Naive Lagos datetime for Oracle PSTD_DATE lower bound."""
    _, start_naive, _ = lagos_day_bounds(day)
    if rescan or not state.watermark_at or state.watermark_day != day.isoformat():
        return start_naive
    wm = state.watermark_at
    if wm.tzinfo is None:
        wm = wm.replace(tzinfo=_tz())
    else:
        wm = wm.astimezone(_tz())
    naive = (wm - OVERLAP).replace(tzinfo=None)
    return max(naive, start_naive)


async def snapshot(db: AsyncSession) -> dict:
    from app.services.etl.scheduler import dtd_job_next_run

    state = await get_state(db)
    day = _today()
    business_start, _, _ = lagos_day_bounds(day)

    pulls = await db.execute(
        select(func.count())
        .select_from(DtdPullRun)
        .where(DtdPullRun.business_date == business_start)
    )
    pulls_today = pulls.scalar_one() or 0

    new_today = (
        await db.execute(
            select(func.coalesce(func.sum(DtdPullRun.records_new), 0)).where(
                DtdPullRun.business_date == business_start
            )
        )
    ).scalar_one()
    skipped_today = (
        await db.execute(
            select(func.coalesce(func.sum(DtdPullRun.records_skipped), 0)).where(
                DtdPullRun.business_date == business_start
            )
        )
    ).scalar_one()
    staged_today = (
        await db.execute(
            select(func.count())
            .select_from(DtdTransaction)
            .where(DtdTransaction.business_date == business_start)
        )
    ).scalar_one() or 0

    runs_result = await db.execute(
        select(DtdPullRun).order_by(DtdPullRun.started_at.desc()).limit(20)
    )
    runs = list(runs_result.scalars().all())

    tx_result = await db.execute(
        select(DtdTransaction)
        .where(DtdTransaction.business_date == business_start)
        .order_by(DtdTransaction.created_at.desc())
        .limit(50)
    )
    transactions = list(tx_result.scalars().all())

    return {
        "enabled": state.enabled,
        "interval_minutes": state.interval_minutes,
        "business_date": day.isoformat(),
        "started_at": state.started_at,
        "started_by": state.started_by,
        "stopped_at": state.stopped_at,
        "stopped_by": state.stopped_by,
        "last_success_at": state.last_success_at,
        "last_error": state.last_error,
        "watermark_at": state.watermark_at,
        "next_run_at": dtd_job_next_run() if state.enabled else None,
        "pulls_today": pulls_today,
        "new_today": int(new_today or 0),
        "skipped_today": int(skipped_today or 0),
        "staged_today": staged_today,
        "dtd_means": "Day Transaction Detail — Finacle’s same-day transaction book (TBAADM.DTD). History lives in HTD.",
        "runs": runs,
        "transactions": transactions,
    }


async def start_feed(db: AsyncSession, user: User) -> dict:
    from fastapi import HTTPException

    from app.services.etl.scheduler import resume_dtd_job

    if settings.finacle_mode.lower() != "oracle":
        raise HTTPException(400, "Day Transaction Detail feed requires FINACLE_MODE=oracle on the VPN laptop.")

    state = await get_state(db)
    now = datetime.now(timezone.utc)
    state.enabled = True
    state.started_at = now
    state.started_by = user.full_name
    state.stopped_at = None
    state.stopped_by = None
    state.last_error = None
    await db.commit()
    last = None
    if state.last_run_id:
        found = await db.execute(select(DtdPullRun).where(DtdPullRun.id == state.last_run_id))
        last = found.scalar_one_or_none()
    day = _today()
    rescan = (
        state.watermark_day != day.isoformat()
        or not state.watermark_at
        or (last is not None and last.status == ExtractionStatus.FAILED)
    )
    since = resolve_posted_since(state, day, rescan=rescan)
    run = await DtdPipeline(db).pull_day(day, posted_since=since)
    await db.refresh(state)
    state.last_run_id = run.id
    if run.status == ExtractionStatus.SUCCESS:
        state.last_success_at = datetime.now(timezone.utc)
        state.last_error = None
        state.watermark_at = datetime.now(_tz())
        state.watermark_day = day.isoformat()
    else:
        state.last_error = run.error_summary
    await db.commit()
    resume_dtd_job(state.interval_minutes, pull_immediately=False)
    return await snapshot(db)


async def stop_feed(db: AsyncSession, user: User) -> dict:
    from app.services.etl.scheduler import pause_dtd_job

    state = await get_state(db)
    state.enabled = False
    state.stopped_at = datetime.now(timezone.utc)
    state.stopped_by = user.full_name
    await db.commit()
    pause_dtd_job()
    return await snapshot(db)


async def run_scheduled_tick(db: AsyncSession) -> None:
    state = await get_state(db)
    if not state.enabled:
        return
    day = _today()
    last = None
    if state.last_run_id:
        result = await db.execute(select(DtdPullRun).where(DtdPullRun.id == state.last_run_id))
        last = result.scalar_one_or_none()
    rescan = (
        state.watermark_day != day.isoformat()
        or not state.watermark_at
        or (last is not None and last.status == ExtractionStatus.FAILED)
    )
    since = resolve_posted_since(state, day, rescan=rescan)
    run = await DtdPipeline(db).pull_day(day, posted_since=since)
    await db.refresh(state)
    state.last_run_id = run.id
    if run.status == ExtractionStatus.SUCCESS:
        state.last_success_at = datetime.now(timezone.utc)
        state.last_error = None
        state.watermark_at = datetime.now(_tz())
        state.watermark_day = day.isoformat()
    else:
        state.last_error = run.error_summary
    await db.commit()
