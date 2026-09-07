"""Customer registry and STR eligibility tests."""

from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings
from app.schemas.compliance import RawTransaction, TransactionChannel
from app.services.etl.customer_registry import CustomerRegistry, parse_particular_name
from app.services.etl.finacle_mappers import map_niptrans
from app.services.etl.transformer import TransactionTransformer

SAMPLES = Path(__file__).resolve().parents[1] / "finacle_samples"


def test_customer_registry_resolves_nip_account():
    registry = CustomerRegistry.from_csv(SAMPLES / "CUSTOMER_NAMES.csv")
    assert registry.lookup("1002000063") == "ENGR USMANY"


def test_map_niptrans_uses_customer_registry():
    row = {
        "REF_NUM": "120922141054",
        "DEBIT_ACCNT": "1002000063",
        "CREDIT_ACCNT": "1102010043",
        "TRAN_AMT": 860,
        "TRAN_DATE": "2021-09-03",
        "TRANPARTICULARS": "TEST BY ENGR USMANY",
        "SOL_ID": "999",
    }
    tx = map_niptrans(row, CustomerRegistry.from_csv(SAMPLES / "CUSTOMER_NAMES.csv"))
    assert tx.sender_name == "ENGR USMANY"
    assert tx.receiver_name == "CWG USMANY"


def test_parse_particular_name():
    assert parse_particular_name("TEST BY ENGR USMANY") == "ENGR USMANY"


def test_str_flagged_for_sanctions_keyword():
    transformer = TransactionTransformer()
    raw = RawTransaction(
        finacle_ref="STR-001",
        channel=TransactionChannel.NIP,
        transaction_date=datetime.now(timezone.utc),
        amount=500_000,
        currency="NGN",
        sender_name="Hassan Ibrahim",
        sender_account="0123456789",
        receiver_name="Jane Doe",
        receiver_account="9876543210",
    )
    payload, is_valid, _ = transformer.transform(raw)
    assert is_valid
    assert payload["reportFlags"]["STR"] is True
