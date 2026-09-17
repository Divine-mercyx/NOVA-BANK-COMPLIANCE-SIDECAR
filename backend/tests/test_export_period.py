from datetime import datetime

import pytest

from app.services.integration.period import resolve_export_window


def test_same_calendar_day_is_inclusive():
    start, end = resolve_export_window(
        datetime(2023, 2, 3),
        datetime(2023, 2, 3),
    )
    assert start.day == 3
    assert start.hour == 0
    assert end.day == 3
    assert end.hour == 23
    assert end.minute == 59


def test_explicit_datetimes_are_kept():
    start, end = resolve_export_window(
        datetime.fromisoformat("2023-02-03T00:00:00+01:00"),
        datetime.fromisoformat("2023-02-03T23:59:59+01:00"),
    )
    assert end.hour == 23
    assert end.second == 59


def test_reversed_range_rejected():
    with pytest.raises(Exception):
        resolve_export_window(datetime(2023, 2, 4), datetime(2023, 2, 3))
