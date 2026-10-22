"""Vendor-facing feeds are NIP-only (institution codes come from NIP flow tables)."""

from app.schemas.compliance import RawTransaction, TransactionChannel

VENDOR_EXPORT_CHANNEL = TransactionChannel.NIP


def nip_staged_transactions(records: list[RawTransaction]) -> list[RawTransaction]:
    return [r for r in records if r.channel == VENDOR_EXPORT_CHANNEL]
