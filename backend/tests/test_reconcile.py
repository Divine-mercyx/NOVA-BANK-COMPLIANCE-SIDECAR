import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.models.entities import ExtractionStatus
from app.services.etl import reconcile as reconcile_mod


def test_reconcile_marks_running_extraction_as_failed(monkeypatch):
    run = SimpleNamespace(
        status=ExtractionStatus.RUNNING,
        completed_at=None,
        error_summary=None,
    )
    scalars = MagicMock()
    scalars.scalars.return_value = iter([run])
    ext_result = MagicMock()
    ext_result.scalars = scalars.scalars

    empty = MagicMock()
    empty.scalars.return_value = iter([])

    session = AsyncMock()
    session.execute = AsyncMock(side_effect=[ext_result, empty])
    session.commit = AsyncMock()

    monkeypatch.setattr(reconcile_mod, "AsyncSessionLocal", lambda: _session_ctx(session))

    count = asyncio.run(reconcile_mod.reconcile_interrupted_jobs())
    assert count == 1
    assert run.status == ExtractionStatus.FAILED
    assert run.error_summary


class _session_ctx:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *args):
        return False
