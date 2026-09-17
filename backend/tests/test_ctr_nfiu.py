from datetime import datetime, timezone
from types import SimpleNamespace

from app.models.entities import TransactionChannel
from app.services.integration.ctr_nfiu import map_ctr_row


def test_ctr_row_matches_nfiu_sample_columns():
    tx = SimpleNamespace(
        finacle_ref="S5949866",
        transaction_date=datetime(2026, 8, 27, 12, 0, tzinfo=timezone.utc),
        amount=10_000_000,
        sender_name="INTERSWITCH LIMITED",
        sender_account="0000000000",
        receiver_name="JOHN ADE",
        receiver_account="0012345678",
        branch_code="001",
        narration="RTGS INWARD",
        channel=TransactionChannel.RTGS,
    )
    row = map_ctr_row(tx)
    data = row.model_dump()
    assert list(data)[:5] == [
        "t_account_number",
        "t_trans_number",
        "t_location",
        "transaction_description",
        "t_date",
    ]
    assert data["t_account_number"] == "0012345678"
    assert data["t_trans_number"] == "S5949866"
    assert data["t_date"] == "2026-08-27"
    assert data["t_amount_local"] == 10_000_000
    assert data["t_source_entity_name"] == "INTERSWITCH LIMITED"
    assert data["t_source_client_type"] == 0
    assert data["t_dest_person_first_name"] == "JOHN"
    assert data["t_dest_person_last_name"] == "ADE"
    assert data["t_dest_client_type"] == 1
    assert data["Tran_Type"] == "RTGS"
    assert data["t_transmode_code"] == "C"
    assert data["issues"] == ""
    assert data["t_location"] == "HEAD OFFICE BRANCH"
