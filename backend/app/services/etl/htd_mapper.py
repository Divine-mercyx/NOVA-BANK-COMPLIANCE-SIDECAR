"""Map TBAADM.HTD (+ GAM join) rows to RawTransaction.

Nova Bank confirmed all transactions land in TBAADM.HTD; account/customer
details come from TBAADM.GAM.
"""

from __future__ import annotations

import re
from typing import Any

from app.schemas.compliance import RawTransaction, TransactionChannel
from app.services.etl.customer_registry import CustomerRegistry
from app.services.etl.finacle_mappers import (
    normalize_account,
    parse_oracle_date,
    parse_withdrawal_name,
)


def infer_htd_channel(particular: str, tran_type: str, tran_sub_type: str) -> TransactionChannel:
    text = f"{particular} {tran_type} {tran_sub_type}".upper()
    if "RTGS" in text:
        return TransactionChannel.RTGS
    if "SWIFT" in text:
        return TransactionChannel.SWIFT
    if any(k in text for k in ("CSHWD", "WITHD", "CASH W/D", "CHEQUE WITHDRAWAL")):
        return TransactionChannel.CASH_WITHDRAWAL
    if "CASH DEP" in text or "DEPOSIT" in text and "CASH" in text:
        return TransactionChannel.CASH_DEPOSIT
    if any(k in text for k in ("NIP", "NEFT", "INSTANT PAYMENT", "TRANSFER", "BALANCE TRANSFER")):
        return TransactionChannel.NIP
    if tran_type.upper() in ("C", "M", "U"):
        return TransactionChannel.MOBILE
    return TransactionChannel.NIP


def _raw_foracid(row: dict[str, Any]) -> str:
    return str(row.get("foracid") or row.get("FORACID") or row.get("acid") or "").strip().strip('"')


def _leg_account(row: dict[str, Any]) -> str:
    raw = _raw_foracid(row)
    if re.fullmatch(r"\d{10}", raw):
        return raw
    return normalize_account(raw)


def _infer_currency(primary: dict[str, Any], debit: dict[str, Any] | None, credit: dict[str, Any] | None) -> str:
    explicit = str(
        primary.get("ref_crncy_code") or primary.get("REF_CRNCY_CODE") or primary.get("tran_crncy_code") or ""
    ).strip()
    if explicit:
        return explicit[:3]
    for row in (debit, credit):
        if not row:
            continue
        foracid = _raw_foracid(row).upper()
        if foracid.startswith("USD"):
            return "USD"
        if foracid.startswith("NGN"):
            return "NGN"
    return "NGN"


def _leg_name(row: dict[str, Any], customers: CustomerRegistry | None) -> str:
    acct = _leg_account(row)
    gam_name = (row.get("acct_name") or row.get("ACCT_NAME") or row.get("account_name") or "").strip()
    particular = str(row.get("tran_particular") or row.get("TRAN_PARTICULAR") or "")
    if gam_name:
        return gam_name
    if customers:
        return customers.lookup_or_parse(acct, particular)
    parsed = parse_withdrawal_name(particular)
    if parsed and parsed != "UNKNOWN CUSTOMER":
        return parsed
    return f"ACCOUNT {acct}" if acct != "0000000000" else "UNKNOWN CUSTOMER"


def map_htd_transaction(
    tran_id: str,
    debit: dict[str, Any] | None,
    credit: dict[str, Any] | None,
    customers: CustomerRegistry | None = None,
) -> RawTransaction | None:
    primary = debit or credit
    if not primary:
        return None

    particular = str(primary.get("tran_particular") or primary.get("TRAN_PARTICULAR") or "")
    tran_type = str(primary.get("tran_type") or primary.get("TRAN_TYPE") or "")
    tran_sub_type = str(primary.get("tran_sub_type") or primary.get("TRAN_SUB_TYPE") or "")
    channel = infer_htd_channel(particular, tran_type, tran_sub_type)

    sender_row = debit or primary
    receiver_row = credit

    sender_acct = _leg_account(sender_row)
    receiver_acct = _leg_account(receiver_row) if receiver_row else "0000000001"

    if channel == TransactionChannel.CASH_WITHDRAWAL and debit:
        sender_name = parse_withdrawal_name(particular) if particular else _leg_name(debit, customers)
        receiver_name = "CASH / TELLER"
    else:
        sender_name = _leg_name(sender_row, customers)
        receiver_name = _leg_name(receiver_row, customers) if receiver_row else "NOVA BANK"

    currency = _infer_currency(primary, debit, credit)

    amount_val = float(primary.get("tran_amt") or primary.get("TRAN_AMT") or 0)
    ref_suffix = f"{amount_val:.2f}-{sender_acct}".replace(".", "")
    finacle_ref = f"{tran_id}-{ref_suffix}" if tran_id else ref_suffix

    return RawTransaction(
        finacle_ref=finacle_ref,
        channel=channel,
        transaction_date=parse_oracle_date(
            primary.get("pstd_date") or primary.get("PSTD_DATE") or primary.get("tran_date") or primary.get("TRAN_DATE")
        ),
        amount=float(primary.get("tran_amt") or primary.get("TRAN_AMT") or 0),
        currency=currency,
        sender_name=sender_name,
        sender_account=sender_acct,
        receiver_name=receiver_name,
        receiver_account=receiver_acct,
        branch_code=str(primary.get("sol_id") or primary.get("SOL_ID") or "001").strip()[:20],
        narration=particular or None,
    )


def map_htd_rows(rows: list[dict[str, Any]], customers: CustomerRegistry | None = None) -> list[RawTransaction]:
    """Pair debit/credit legs by TRAN_ID + TRAN_AMT (one Finacle txn can have many legs)."""
    debits: dict[tuple[str, str], dict[str, Any]] = {}
    credits: dict[tuple[str, str], dict[str, Any]] = {}

    for row in rows:
        tran_id = str(row.get("tran_id") or row.get("TRAN_ID") or "").strip()
        amount = str(row.get("tran_amt") or row.get("TRAN_AMT") or "")
        if not tran_id:
            continue
        key = (tran_id, amount)
        part_type = str(row.get("part_tran_type") or row.get("PART_TRAN_TYPE") or "").strip().upper()
        if part_type.startswith("D"):
            debits[key] = row
        elif part_type.startswith("C"):
            credits[key] = row

    out: list[RawTransaction] = []
    for key, debit in debits.items():
        tran_id, _ = key
        credit = credits.get(key)
        tx = map_htd_transaction(tran_id, debit, credit, customers)
        if tx and tx.amount > 0:
            out.append(tx)
    return out
