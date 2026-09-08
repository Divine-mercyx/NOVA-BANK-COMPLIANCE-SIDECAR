"""Fetch TBAADM.HTD for a fixed date range — streams each transaction as it is mapped.

Use on the VPN laptop to verify Oracle data vs app extraction:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts/fetch_htd_range.py

    python scripts/fetch_htd_range.py --from 2023-02-01 --to 2023-02-03
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.schemas.compliance import RawTransaction
from app.services.etl.customer_registry import CustomerRegistry
from app.services.etl.htd_mapper import map_htd_rows
from app.services.etl.oracle_client import get_oracledb
from app.services.etl.oracle_source import OracleFinacleSource


def parse_cli_date(value: str) -> datetime:
    tz = ZoneInfo(settings.finacle_timezone)
    parsed = datetime.strptime(value, "%Y-%m-%d")
    return parsed.replace(tzinfo=tz)


def format_transaction(tx: RawTransaction) -> str:
    tx_date = tx.transaction_date.strftime("%Y-%m-%d %H:%M") if tx.transaction_date else "?"
    return (
        f"{tx.finacle_ref} | {tx_date} | {tx.channel.value} | "
        f"{tx.amount:,.2f} {tx.currency} | "
        f"{tx.sender_account} {tx.sender_name[:30]} → "
        f"{tx.receiver_account} {tx.receiver_name[:30]}"
    )


def stream_htd_day(
    oracledb,
    source: OracleFinacleSource,
    day_start: datetime,
    day_end_exclusive: datetime,
    *,
    show_legs: bool = False,
) -> tuple[int, int]:
    """Fetch HTD legs in batches; print each mapped transaction as soon as D/C pair is complete."""
    admin_schema = settings.finacle_admin_schema
    sql = source.HTD_QUERY.format(admin_schema=admin_schema)
    batch_size = max(settings.finacle_oracle_fetch_batch_size, 500)
    customers = CustomerRegistry.default()

    rows: list[dict] = []
    printed_refs: set[str] = set()
    leg_total = 0
    tx_total = 0

    with oracledb.connect(
        user=settings.finacle_oracle_user,
        password=settings.finacle_oracle_password,
        dsn=settings.finacle_oracle_dsn,
    ) as conn:
        with conn.cursor() as cursor:
            cursor.arraysize = batch_size
            cursor.execute(
                sql,
                date_from=day_start,
                date_to_exclusive=day_end_exclusive,
            )
            cols = [d[0].lower() for d in cursor.description]

            while True:
                chunk = cursor.fetchmany(batch_size)
                if not chunk:
                    break

                for row in chunk:
                    leg = dict(zip(cols, row))
                    leg_total += 1
                    rows.append(leg)
                    if show_legs:
                        tran_id = leg.get("tran_id", "?")
                        part = leg.get("part_tran_type", "?")
                        amt = leg.get("tran_amt", "?")
                        print(f"    LEG {leg_total}: {tran_id} {part} {amt}", flush=True)

                mapped = map_htd_rows(rows, customers)
                for tx in mapped:
                    if tx.finacle_ref in printed_refs:
                        continue
                    printed_refs.add(tx.finacle_ref)
                    tx_total += 1
                    print(f"  TX {tx_total}: {format_transaction(tx)}", flush=True)

                print(
                    f"  … batch done — {leg_total:,} legs fetched, {tx_total:,} transactions mapped so far",
                    flush=True,
                )

    return leg_total, tx_total


def main() -> int:
    parser = argparse.ArgumentParser(description="Stream HTD transactions (same ETL query + mapper)")
    parser.add_argument("--from", dest="date_from", default="2023-02-01", help="Start date YYYY-MM-DD")
    parser.add_argument("--to", dest="date_to", default="2023-02-03", help="End date YYYY-MM-DD (inclusive)")
    parser.add_argument(
        "--show-legs",
        action="store_true",
        help="Also print each raw HTD leg row as it arrives (very verbose)",
    )
    args = parser.parse_args()

    if not settings.finacle_oracle_dsn:
        print("ERROR: Set FINACLE_ORACLE_* in backend/.env")
        return 1

    date_from = parse_cli_date(args.date_from)
    date_to = parse_cli_date(args.date_to)
    if date_to < date_from:
        print("ERROR: --to must be on or after --from")
        return 1

    source = OracleFinacleSource()
    start_naive, end_exclusive = source._resolve_dates(date_from, date_to)
    oracledb = get_oracledb()
    days = list(source.iter_day_windows(start_naive, end_exclusive))

    mode = "thick" if settings.finacle_oracle_thick_mode else "thin"
    print("=" * 60, flush=True)
    print("HTD streaming fetch (same query + mapper as ETL)", flush=True)
    print("=" * 60, flush=True)
    print(f"DSN:      {settings.finacle_oracle_dsn}", flush=True)
    print(f"User:     {settings.finacle_oracle_user!r}", flush=True)
    print(f"Mode:     {mode}", flush=True)
    print(f"Range:    {args.date_from} → {args.date_to} ({len(days)} day(s))", flush=True)
    print(f"Batch:    {settings.finacle_oracle_fetch_batch_size}", flush=True)
    print("=" * 60, flush=True)
    print("Transactions print live as debit/credit pairs complete.\n", flush=True)

    total_legs = 0
    total_tx = 0
    t0 = time.perf_counter()

    for index, (day_start, day_end) in enumerate(days, start=1):
        day_label = day_start.date().isoformat()
        print(f"[{index}/{len(days)}] === {day_label} ===", flush=True)
        day_t0 = time.perf_counter()

        try:
            legs, txs = stream_htd_day(
                oracledb,
                source,
                day_start,
                day_end,
                show_legs=args.show_legs,
            )
            total_legs += legs
            total_tx += txs
            elapsed = time.perf_counter() - day_t0
            print(
                f"  Day summary: {legs:,} legs → {txs:,} transactions ({elapsed:.1f}s)\n",
                flush=True,
            )
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback

            traceback.print_exc()
            return 1

    elapsed_total = time.perf_counter() - t0
    print("=" * 60, flush=True)
    print(
        f"DONE — {total_tx:,} transactions from {total_legs:,} legs in {elapsed_total:.1f}s",
        flush=True,
    )
    print("=" * 60, flush=True)

    if total_tx == 0:
        print("\nNo transactions mapped. Check MIN/MAX dates:", flush=True)
        print("  python scripts/test_oracle_connection.py", flush=True)
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
