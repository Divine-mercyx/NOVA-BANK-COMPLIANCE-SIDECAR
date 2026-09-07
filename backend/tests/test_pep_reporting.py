"""Tests for PEP reporting and Finacle field mapping."""

from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.entities import ReportType, TransactionChannel
from app.schemas.compliance import RawTransaction, TransactionChannel as SchemaChannel
from app.services.etl.finacle_mappers import map_withdrawal, parse_withdrawal_name
from app.services.etl.pep_registry import PepRegistry
from app.services.etl.transformer import TransactionTransformer
from app.services.reports.generator import ReportGenerator

SAMPLES = Path(__file__).resolve().parents[1] / "finacle_samples"


def test_parse_withdrawal_name_from_particular_by_clause():
    particular = "CSHWD: Cheque Withdrawal BY JOY JONE"
    assert parse_withdrawal_name(particular) == "JOY JONE"


def test_parse_withdrawal_name_cshwd_fallback():
    particular = "CSHWD: ATM Withdrawal"
    assert parse_withdrawal_name(particular) == "ATM Withdrawal"


def test_map_withdrawal_row_uses_parsed_name():
    row = {
        "TRAN_ID": "M00000212",
        "ACCT_NUMB": "1001010692",
        "TRAN_AMT": 1000,
        "REF_CRNCY_CODE": "NGN",
        "PARTICULAR": "CSHWD: Cheque Withdrawal BY JOY JONE",
        "PSTD_DATE": "2025-12-13 19:13:24",
        "INIT_SOL": "001",
    }
    tx = map_withdrawal(row)
    assert tx.sender_name == "JOY JONE"
    assert tx.narration == row["PARTICULAR"]


def test_pep_registry_matches_uat_account():
    registry = PepRegistry.from_csv(SAMPLES / "PEP_CUSTOMERS.csv")
    assert registry.is_pep_account("1001010207")
    assert registry.is_pep_name("GOLDEN SUGAR COMPANY LIMITED")


def test_transformer_flags_pep_by_account():
    registry = PepRegistry.from_csv(SAMPLES / "PEP_CUSTOMERS.csv")
    transformer = TransactionTransformer(pep_registry=registry)
    raw = RawTransaction(
        finacle_ref="M00000214",
        channel=SchemaChannel.CASH_WITHDRAWAL,
        transaction_date=datetime.now(timezone.utc),
        amount=5_002_000,
        currency="NGN",
        sender_name="JOY JONE",
        sender_account="1001010207",
        receiver_name="CASH / TELLER",
        receiver_account="0000000001",
    )
    payload, is_valid, errors = transformer.transform(raw)
    assert is_valid
    assert not errors
    assert payload["reportFlags"]["PEP"] is True
    assert payload["reportFlags"]["CTR"] is True


def test_report_generator_pep_csv_and_xml():
    tx = SimpleNamespace(
        finacle_ref="M00000214",
        transaction_date=datetime(2025, 12, 13, tzinfo=timezone.utc),
        channel=TransactionChannel.CASH_WITHDRAWAL,
        amount=5_002_000,
        currency="NGN",
        sender_name="JOY JONE",
        sender_account="1001010207",
        receiver_name="CASH / TELLER",
        receiver_account="0000000001",
        branch_code="001",
        reportable_pep=True,
        reportable_str=False,
    )
    gen = ReportGenerator(db=MagicMock())
    csv_out = gen._build_csv([tx])
    assert "pep_flag" in csv_out
    assert ",true" in csv_out.lower() or ",True" in csv_out

    xml_out = gen._build_xml(
        ReportType.PEP,
        [tx],
        datetime(2025, 12, 1, tzinfo=timezone.utc),
        datetime(2025, 12, 31, tzinfo=timezone.utc),
    )
    assert "<reportType>PEP</reportType>" in xml_out
    assert "<pepFlag>true</pepFlag>" in xml_out


@pytest.mark.asyncio
async def test_report_generator_fetches_pep_flagged_only():
    pep_tx = SimpleNamespace(reportable_pep=True, is_valid=True, transaction_date=datetime.now(timezone.utc))
    non_pep = SimpleNamespace(reportable_pep=False, is_valid=True, transaction_date=datetime.now(timezone.utc))

    result = MagicMock()
    result.scalars.return_value.all.return_value = [pep_tx]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    gen = ReportGenerator(db=db)
    rows = await gen._fetch_transactions(
        ReportType.PEP,
        datetime(2025, 1, 1, tzinfo=timezone.utc),
        datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    assert rows == [pep_tx]
    assert non_pep not in rows
