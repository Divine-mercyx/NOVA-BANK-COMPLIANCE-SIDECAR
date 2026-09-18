"""Inclusive date windows for export/staging pulls (Africa/Lagos calendar days)."""

from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Query

from app.core.config import settings


def _bank_tz() -> ZoneInfo:
    return ZoneInfo(settings.finacle_timezone)


def _as_bank_tz(value: datetime) -> datetime:
    tz = _bank_tz()
    if value.tzinfo is None:
        return value.replace(tzinfo=tz)
    return value.astimezone(tz)


def _is_midnight(value: datetime) -> bool:
    return value.hour == 0 and value.minute == 0 and value.second == 0 and value.microsecond == 0


def resolve_export_window(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    """Treat YYYY-MM-DD (midnight) as a full inclusive calendar day in the bank timezone."""
    start = _as_bank_tz(start)
    end = _as_bank_tz(end)
    if _is_midnight(start):
        start = datetime.combine(start.date(), time.min, tzinfo=_bank_tz())
    if _is_midnight(end):
        end = datetime.combine(end.date(), time(23, 59, 59, 999999), tzinfo=_bank_tz())
    if start > end:
        raise HTTPException(400, "date_from must be on or before date_to")
    return start, end


def export_period_params(
    date_from: datetime | None = Query(None, description="Start date YYYY-MM-DD or ISO datetime"),
    date_to: datetime | None = Query(None, description="End date YYYY-MM-DD (inclusive) or ISO datetime"),
    period_start: datetime | None = Query(None, description="Legacy alias for date_from"),
    period_end: datetime | None = Query(None, description="Legacy alias for date_to"),
) -> tuple[datetime, datetime]:
    start = date_from or period_start
    end = date_to or period_end
    if start is None or end is None:
        raise HTTPException(400, "Provide date_from and date_to")
    return resolve_export_window(start, end)


def dtd_day_param(
    date: datetime | None = Query(
        None,
        description="Single Lagos calendar day (YYYY-MM-DD). Omit for today. DTD is never a date range.",
    ),
) -> date:
    tz = _bank_tz()
    if date is None:
        return datetime.now(tz).date()
    return _as_bank_tz(date).date()
