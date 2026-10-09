#!/usr/bin/env python3
"""Preview one Lagos calendar day of HTD extract with NIP institution enrichment.

Same paging, GAM, BANK_CODE_TABLE, and NIP_OUT/IN flow lookup as production ETL.

Usage (VPN + backend/.env):
    cd backend
    python scripts/preview_htd_day.py --date 2023-02-02
    python scripts/preview_htd_day.py --date 2023-02-02 --json
    python scripts/preview_htd_day.py --date 2023-02-02 --limit 20
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, time as dt_time, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.services.etl.customer_registry import CustomerRegistry
from app.services.etl.htd_mapper import map_htd_rows
from app.services.etl.nip_flow import collect_tran_ids_from_legs
from app.services.etl.oracle_client import get_oracledb
from app.services.etl.oracle_source import HtdDayCursor, OracleFinacleSource


def lagos_day_bounds(day: datetime) -> tuple[datetime, datetime]:
    tz = ZoneInfo(settings.finacle_timezone)
    if day.tzinfo is None:
        start = day.replace(tzinfo=tz)
    else:
        start = day.astimezone(tz)
    day_only = start.date()
    start_naive = datetime.combine(day_only, dt_time.min)
    end_exclusive = datetime.combine(day_only + timedelta(days=1), dt_time.min)
    return start_naive, end_exclusive


def tx_to_dict(tx) -> dict:
    return {
        "finacle_ref": tx.finacle_ref,
        "channel": tx.channel.value,
        "transaction_date": tx.transaction_date.isoformat() if tx.transaction_date else None,
        "amount": tx.amount,
        "currency": tx.currency,
        "sender_account": tx.sender_account,
        "sender_name": tx.sender_name,
        "receiver_account": tx.receiver_account,
        "receiver_name": tx.receiver_name,
        "source_institution_code": tx.source_institution_code,
        "source_institution_name": tx.source_institution_name,
        "dest_institution_code": tx.dest_institution_code,
        "dest_institution_name": tx.dest_institution_name,
        "narration": tx.narration,
        "branch_code": tx.branch_code,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="One-day HTD preview with NIP institutions")
    parser.add_argument("--date", default="2023-02-02", help="Calendar day YYYY-MM-DD (Africa/Lagos)")
    parser.add_argument("--json", action="store_true", help="Print each transaction as JSON")
    parser.add_argument("--limit", type=int, default=0, help="Stop after N transactions (0 = all)")
    args = parser.parse_args()

    if not settings.finacle_oracle_dsn:
        print("ERROR: Set FINACLE_ORACLE_* in backend/.env", flush=True)
        return 1

    try:
        parsed = datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        print("ERROR: --date must be YYYY-MM-DD", flush=True)
        return 1

    day_start, day_end = lagos_day_bounds(parsed)
    source = OracleFinacleSource()
    oracledb = get_oracledb()
    customers = CustomerRegistry.default()

    print("=" * 72, flush=True)
    print("HTD one-day preview (production mapper + NIP flow)", flush=True)
    print("=" * 72, flush=True)
    print(f"Date:        {args.date} ({settings.finacle_timezone})", flush=True)
    print(f"DSN:         {settings.finacle_oracle_dsn}", flush=True)
    print(f"HTD schema:  {settings.finacle_admin_schema}", flush=True)
    print(f"NIP schema:  {settings.finacle_nip_schema}", flush=True)
    print("=" * 72, flush=True)

    t0 = time.perf_counter()
    banks = source.fetch_bank_directory(oracledb, settings.finacle_admin_schema)
    nip_names = source.fetch_nip_institution_names(oracledb, settings.finacle_nip_schema)
    print(f"Loaded {len(banks)} Finacle bank codes, {len(nip_names)} NIP institution names\n", flush=True)

    cursor = HtdDayCursor()
    transactions: list[dict] = []
    page_no = 0

    while not cursor.done:
        page_no += 1
        flush_rows, cursor = source.fetch_htd_flush_page(
            oracledb,
            settings.finacle_admin_schema,
            day_start,
            day_end,
            cursor,
        )
        if not flush_rows:
            continue
        tran_ids = collect_tran_ids_from_legs(flush_rows)
        nip_lookup = source.fetch_nip_flow_lookup(
            oracledb, settings.finacle_nip_schema, tran_ids, nip_names
        )
        mapped = map_htd_rows(flush_rows, customers, banks, nip_lookup)
        print(
            f"Page {page_no}: {len(flush_rows)} legs → {len(mapped)} transactions "
            f"(NIP keys out={len(nip_lookup.outbound)} in={len(nip_lookup.inbound)})",
            flush=True,
        )
        for tx in mapped:
            row = tx_to_dict(tx)
            transactions.append(row)
            if args.json:
                print(json.dumps(row, ensure_ascii=False), flush=True)
            else:
                src = row["source_institution_code"] or "—"
                src_n = row["source_institution_name"] or "—"
                dst = row["dest_institution_code"] or "—"
                dst_n = row["dest_institution_name"] or "—"
                print(
                    f"  {row['finacle_ref']} | {row['channel']} | {row['amount']:,.2f} {row['currency']}\n"
                    f"    source: {src} {src_n}\n"
                    f"    dest:   {dst} {dst_n}\n"
                    f"    {row['sender_account']} → {row['receiver_account']} | {row['narration'] or ''}",
                    flush=True,
                )
            if args.limit and len(transactions) >= args.limit:
                cursor.done = True
                break

    elapsed = time.perf_counter() - t0
    with_inst = sum(
        1
        for t in transactions
        if t["source_institution_code"] or t["dest_institution_code"]
    )
    print("\n" + "=" * 72, flush=True)
    print(
        f"DONE — {len(transactions)} transactions in {elapsed:.1f}s "
        f"({with_inst} with at least one institution code)",
        flush=True,
    )
    print("=" * 72, flush=True)

    if not transactions:
        print("No transactions for this day. Try another date or check VPN/Oracle.", flush=True)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
