from datetime import date, datetime, time
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.entities import TransactionChannel
from app.schemas.integration import NfiuTransactionsResponse
from app.services.integration.export_service import ExportService
from app.services.integration.period import resolve_export_window


@pytest.mark.asyncio
async def test_list_dtd_returns_nfiu_envelope():
    day = date(2026, 10, 22)

    dtd_row = MagicMock()
    dtd_row.finacle_ref = "DTD-1"
    dtd_row.transaction_date = datetime(2026, 10, 22, 12, 0)
    dtd_row.amount = 1_000_000.0
    dtd_row.currency = "NGN"
    dtd_row.sender_name = "Alice Example"
    dtd_row.sender_account = "111"
    dtd_row.receiver_name = "Bob Example"
    dtd_row.receiver_account = "222"
    dtd_row.source_institution_code = "60003"
    dtd_row.source_institution_name = "NOVA BANK"
    dtd_row.dest_institution_code = "057"
    dtd_row.dest_institution_name = "ZENITH"
    dtd_row.branch_code = "001"
    dtd_row.narration = "NIP transfer"
    dtd_row.channel = TransactionChannel.NIP

    db = AsyncMock()
    count_result = MagicMock()
    count_result.scalar_one.return_value = 1
    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = [dtd_row]
    db.execute = AsyncMock(side_effect=[count_result, list_result])

    svc = ExportService(db)
    out = await svc.list_dtd(day, limit=10, offset=0)

    assert isinstance(out, NfiuTransactionsResponse)
    assert out.meta.scope == "dtd"
    assert out.meta.channel == "NIP"
    assert out.meta.total_matching == 1
    assert len(out.transactions) == 1
    assert out.transactions[0].t_trans_number == "DTD-1"
    assert out.transactions[0].t_amount_local == 1_000_000.0

    period_start, period_end = resolve_export_window(
        datetime.combine(day, time.min),
        datetime.combine(day, time.min),
    )
    assert out.meta.period_start == period_start
    assert out.meta.period_end == period_end
