from datetime import date, datetime, timedelta
from types import SimpleNamespace

from app.services.etl.dtd_control import resolve_posted_since
from app.services.etl.dtd_pipeline import lagos_day_bounds


def test_lagos_day_bounds_are_one_calendar_day():
    start_aware, start_naive, end_exclusive = lagos_day_bounds(date(2026, 9, 18))
    assert start_naive.day == 18
    assert start_naive.hour == 0
    assert end_exclusive.day == 19
    assert start_aware.tzinfo is not None


def test_resume_uses_watermark_with_overlap():
    day = date(2026, 9, 18)
    wm = datetime(2026, 9, 18, 14, 0)
    state = SimpleNamespace(watermark_at=wm, watermark_day="2026-09-18")
    since = resolve_posted_since(state, day, rescan=False)
    assert since == wm - timedelta(minutes=5)


def test_new_day_rescans_from_midnight():
    day = date(2026, 9, 18)
    _, start_naive, _ = lagos_day_bounds(day)
    state = SimpleNamespace(watermark_at=datetime(2026, 9, 17, 23, 0), watermark_day="2026-09-17")
    assert resolve_posted_since(state, day, rescan=False) == start_naive
    state.watermark_day = "2026-09-18"
    assert resolve_posted_since(state, day, rescan=True) == start_naive
