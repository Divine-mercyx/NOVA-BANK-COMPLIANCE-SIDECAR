"""Map staged transactions to NFIU CTR row fields (CTR SAMPLE DATA NOVA)."""

from __future__ import annotations

from datetime import datetime

from app.models.entities import StagingTransaction
from app.schemas.integration import NfiuTransactionRow

NOVA_INSTITUTION_CODE = "60003"
NOVA_INSTITUTION_NAME = "NOVA BANK"
ENTITY_MARKERS = (
    "LTD",
    "LIMITED",
    "PLC",
    "BANK",
    "NIG",
    "NIGERIA",
    "ACCOUNT",
    "ACCT",
    "COLLECTIONS",
    "SERVICES",
    "LOGISTICS",
    "CONSTRUCTION",
)


def _iso_date(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.date().isoformat()


def _is_entity_name(name: str) -> bool:
    upper = name.upper()
    return any(marker in upper for marker in ENTITY_MARKERS)


def _split_person(name: str) -> tuple[str, str]:
    parts = [p for p in name.strip().split() if p]
    if len(parts) < 2:
        return name.strip(), ""
    return parts[0], " ".join(parts[1:])


def _party_fields(prefix: str, name: str, account: str) -> dict[str, str | int | float]:
    entity = _is_entity_name(name)
    first, last = ("", "") if entity else _split_person(name)
    return {
        f"t_{prefix}_client_type": 0 if entity else 1,
        f"t_{prefix}_type": "Account",
        f"t_{prefix}_funds_code": "L",
        f"t_{prefix}_currency_code": "NGN",
        f"t_{prefix}_foreign_amount": 0,
        f"t_{prefix}_exchange_rate": 1,
        f"t_{prefix}_country": "NG",
        f"t_{prefix}_institution_code": NOVA_INSTITUTION_CODE,
        f"t_{prefix}_institution_name": NOVA_INSTITUTION_NAME,
        f"t_{prefix}_account_number": account,
        f"t_{prefix}_account_name": name,
        f"t_{prefix}_person_first_name": first,
        f"t_{prefix}_person_last_name": last,
        f"t_{prefix}_entity_name": name if entity else "",
    }


def _tran_type(channel: str) -> str:
    mapping = {
        "NIP": "NIP",
        "NEFT": "NEFT",
        "RTGS": "RTGS",
        "SWIFT": "SWIFT",
        "CASH_WITHDRAWAL": "CASH",
        "CASH_DEPOSIT": "CASH",
        "MOBILE": "NIP",
    }
    return mapping.get(channel, channel)


def map_nfiu_row(tx: StagingTransaction) -> NfiuTransactionRow:
    """One NFIU sample-data row. Fields we do not have from HTD use Nova defaults."""
    date_s = _iso_date(tx.transaction_date)
    source = _party_fields("source", tx.sender_name or "", tx.sender_account or "")
    dest = _party_fields("dest", tx.receiver_name or "", tx.receiver_account or "")
    branch = tx.branch_code or ""
    location = "HEAD OFFICE BRANCH" if branch in {"001", "1", ""} else branch
    return NfiuTransactionRow.model_validate(
        {
            "t_account_number": tx.receiver_account or tx.sender_account or "",
            "t_trans_number": tx.finacle_ref,
            "t_location": location,
            "transaction_description": tx.narration or tx.finacle_ref,
            "t_date": date_s,
            "t_teller": "SYSTEM",
            "t_authorized": "SYSTEM",
            "t_late_deposit": 0,
            "t_date_posting": date_s,
            "t_value_date": date_s,
            "t_transmode_code": "C",
            "t_amount_local": tx.amount,
            **source,
            **dest,
            "processed_date": date_s,
            "issues": "",
            "branch_name": location,
            "Tran_Type": _tran_type(tx.channel.value if hasattr(tx.channel, "value") else str(tx.channel)),
        }
    )


map_ctr_row = map_nfiu_row
