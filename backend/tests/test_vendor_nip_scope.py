from app.schemas.compliance import RawTransaction, TransactionChannel
from app.services.etl.vendor_scope import nip_staged_transactions


def _tx(channel: TransactionChannel) -> RawTransaction:
    return RawTransaction(
        finacle_ref="X",
        channel=channel,
        transaction_date=__import__("datetime").datetime(2026, 1, 1, tzinfo=__import__("datetime").timezone.utc),
        amount=100,
        sender_name="A",
        sender_account="1",
        receiver_name="B",
        receiver_account="2",
    )


def test_nip_staged_transactions_filters_non_nip():
    rows = [_tx(TransactionChannel.NIP), _tx(TransactionChannel.RTGS), _tx(TransactionChannel.NIP)]
    assert len(nip_staged_transactions(rows)) == 2
