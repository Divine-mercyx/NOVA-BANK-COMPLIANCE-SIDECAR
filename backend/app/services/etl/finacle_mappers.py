"""Map CUSTOM schema rows to RawTransaction."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from dateutil import parser as date_parser

from app.schemas.compliance import RawTransaction, TransactionChannel
from app.services.etl.customer_registry import CustomerRegistry

ACCOUNT_DIGITS = re.compile(r"\D")


def normalize_account(acct: str) -> str:
    digits = ACCOUNT_DIGITS.sub("", acct or "")
    if len(digits) >= 10:
        return digits[-10:]
    if digits:
        return digits.zfill(10)
    return "0000000000"


def parse_withdrawal_name(particular: str) -> str:
    text = (particular or "").strip()
    if not text:
        return "UNKNOWN CUSTOMER"
    upper = text.upper()
    if " BY " in upper:
        idx = upper.rfind(" BY ")
        return text[idx + 4 :].strip()
    for prefix in ("CSHWD:", "WITHD:"):
        if prefix in upper:
            idx = upper.find(prefix)
            return text[idx + len(prefix) :].strip()
    return text


def account_label(acct: str) -> str:
    return f"ACCOUNT {normalize_account(acct)}"


def parse_oracle_date(value: Any) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        dt = value
    else:
        dt = date_parser.parse(str(value))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def map_niptrans(row: dict[str, Any], customers: CustomerRegistry | None = None) -> RawTransaction:
    registry = customers or CustomerRegistry.default()
    debit = normalize_account(str(row.get("DEBIT_ACCNT") or row.get("debit_accnt") or ""))
    credit = normalize_account(str(row.get("CREDIT_ACCNT") or row.get("credit_accnt") or ""))
    particular = str(row.get("TRANPARTICULARS") or row.get("NARRATIONS") or "")
    return RawTransaction(
        finacle_ref=str(row.get("REF_NUM") or row.get("TRANSID") or ""),
        channel=TransactionChannel.NIP,
        transaction_date=parse_oracle_date(row.get("TRAN_DATE") or row.get("RCRE_TIME")),
        amount=float(row.get("TRAN_AMT") or 0),
        currency="NGN",
        sender_name=registry.lookup_or_parse(debit, particular),
        sender_account=debit,
        receiver_name=registry.lookup(credit),
        receiver_account=credit,
        branch_code=str(row.get("SOL_ID") or "001").strip()[:20],
        narration=particular or None,
    )


def map_rtgstran(row: dict[str, Any], customers: CustomerRegistry | None = None) -> RawTransaction:
    registry = customers or CustomerRegistry.default()
    debit_raw = str(row.get("DEBIT_ACCNT") or "")
    credit_raw = str(row.get("CREDIT_ACCNT") or "")
    debit = normalize_account(debit_raw)
    credit = normalize_account(credit_raw)
    currency = str(row.get("CRNCY") or "NGN").strip()[:3]
    narration = str(row.get("NARRATIONS") or "")
    if currency.startswith("NGN") and len(currency) > 3:
        credit = normalize_account(credit_raw.replace("NGN", ""))
    return RawTransaction(
        finacle_ref=str(row.get("REF_NUM") or row.get("TRANSID") or ""),
        channel=TransactionChannel.RTGS,
        transaction_date=parse_oracle_date(row.get("TRANSDATE") or row.get("LCHG_TIME")),
        amount=float(row.get("TRAN_AMT") or 0),
        currency="NGN" if currency.startswith("NGN") else currency[:3],
        sender_name=registry.lookup_or_parse(debit, narration),
        sender_account=debit,
        receiver_name=registry.lookup(credit) if credit != "0000000000" else "RTGS BENEFICIARY",
        receiver_account=credit,
        branch_code=str(row.get("SOLID") or "001").strip()[:20],
        narration=narration or None,
    )


def map_cashless(row: dict[str, Any]) -> RawTransaction:
    acct = normalize_account(str(row.get("ACID") or ""))
    return RawTransaction(
        finacle_ref=str(row.get("TRAN_ID") or ""),
        channel=TransactionChannel.MOBILE,
        transaction_date=parse_oracle_date(row.get("TRAN_DATE") or row.get("RCRE_TIME")),
        amount=float(row.get("TRAN_AMT") or row.get("TOTAL_AMT") or 0),
        currency="NGN",
        sender_name=account_label(acct),
        sender_account=acct,
        receiver_name="NOVA BANK",
        receiver_account="0000000001",
        branch_code=str(row.get("ACCT_SOL") or row.get("INIT_SOL") or "001").strip()[:20],
        narration=f"Cashless {row.get('TRAN_TYPE') or ''}/{row.get('TRAN_SUB_TYPE') or ''}".strip(),
    )


def map_withdrawal(row: dict[str, Any], receiver_account: str | None = None) -> RawTransaction:
    acct = normalize_account(str(row.get("ACCT_NUMB") or ""))
    particular = str(row.get("PARTICULAR") or "")
    receiver = normalize_account(receiver_account) if receiver_account else "0000000001"
    return RawTransaction(
        finacle_ref=str(row.get("TRAN_ID") or ""),
        channel=TransactionChannel.CASH_WITHDRAWAL,
        transaction_date=parse_oracle_date(row.get("PSTD_DATE") or row.get("ENTRY_DATE") or row.get("TRAN_DATE")),
        amount=float(row.get("TRAN_AMT") or 0),
        currency=str(row.get("REF_CRNCY_CODE") or "NGN").strip()[:3],
        sender_name=parse_withdrawal_name(particular),
        sender_account=acct,
        receiver_name="CASH / TELLER",
        receiver_account=receiver,
        branch_code=str(row.get("INIT_SOL") or "001").strip()[:20],
        narration=particular or None,
    )


def map_withdrawal_rows(rows: list[dict[str, Any]]) -> list[RawTransaction]:
    """Dedupe withdrawal double-entry: keep debit leg, attach credit account when paired."""
    credits_by_tx: dict[str, str] = {}
    debits: list[dict[str, Any]] = []
    for row in rows:
        tran_id = str(row.get("TRAN_ID") or "")
        part_type = str(row.get("PART_TRAN_TYPE") or "").upper()
        if part_type == "C":
            credits_by_tx[tran_id] = str(row.get("ACCT_NUMB") or "")
        elif part_type == "D" or not part_type:
            debits.append(row)
    if not debits and rows:
        debits = rows
    out: list[RawTransaction] = []
    seen: set[str] = set()
    for row in debits:
        tran_id = str(row.get("TRAN_ID") or "")
        key = f"{tran_id}:{row.get('ACCT_NUMB')}:{row.get('TRAN_AMT')}"
        if key in seen:
            continue
        seen.add(key)
        out.append(map_withdrawal(row, credits_by_tx.get(tran_id)))
    return out
