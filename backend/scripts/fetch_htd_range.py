"""Fetch TBAADM.HTD for a fixed date range — same logic as the ETL pipeline.

Use on the VPN laptop to verify Oracle data vs app extraction:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts/fetch_htd_range.py

    # custom range
    python scripts/fetch_htd_range.py --from 2023-02-01 --to 2023-02-03
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, time as dt_time, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.services.etl.oracle_client import get_oracledb
from app.services.etl.oracle_source import OracleFinacleSource


def parse_cli_date(value: str) -> datetime:
    """Parse YYYY-MM-DD into bank-local midnight."""
    tz = ZoneInfo(settings.finacle_timezone)
    parsed = datetime.strptime(value, "%Y-%m-%d")
    return parsed.replace(tzinfo=tz)


def oracle_count_for_day(
    conn,
    admin_schema: str,
    day_start: datetime,
    day_end_exclusive: datetime,
) -> int:
    sql = f"""
        SELECT COUNT(*)
        FROM {admin_schema}.HTD h
        WHERE NVL(h.PSTD_DATE, h.TRAN_DATE) >= :date_from
          AND NVL(h.PSTD_DATE, h.TRAN_DATE) < :date_to_exclusive
    """
    with conn.cursor() as cur:
        cur.execute(sql, date_from=day_start, date_to_exclusive=day_end_exclusive)
        return int(cur.fetchone()[0])


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch HTD legs using the same ETL query as the app")
    parser.add_argument("--from", dest="date_from", default="2023-02-01", help="Start date YYYY-MM-DD")
    parser.add_argument("--to", dest="date_to", default="2023-02-03", help="End date YYYY-MM-DD (inclusive)")
    parser.add_argument("--sample", type=int, default=3, help="Sample mapped transactions to print per day")
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
    admin_schema = settings.finacle_admin_schema
    days = list(source.iter_day_windows(start_naive, end_exclusive))

    mode = "thick" if settings.finacle_oracle_thick_mode else "thin"
    print("=" * 60)
    print("HTD range fetch (same code path as ETL)")
    print("=" * 60)
    print(f"DSN:      {settings.finacle_oracle_dsn}")
    print(f"User:     {settings.finacle_oracle_user!r}")
    print(f"Schema:   {admin_schema}")
    print(f"Mode:     {mode}")
    print(f"Timezone: {settings.finacle_timezone}")
    print(f"Range:    {args.date_from} → {args.date_to} ({len(days)} day(s))")
    print(f"Resolved: {start_naive} → {end_exclusive} (exclusive end)")
    print(f"Batch:    {settings.finacle_oracle_fetch_batch_size}")
    print("=" * 60)

    total_legs = 0
    total_mapped = 0
    t0 = time.perf_counter()

    with oracledb.connect(
        user=settings.finacle_oracle_user,
        password=settings.finacle_oracle_password,
        dsn=settings.finacle_oracle_dsn,
    ) as conn:
        for index, (day_start, day_end) in enumerate(days, start=1):
            day_label = day_start.date().isoformat()
            print(f"\n[{index}/{len(days)}] {day_label}")
            print("-" * 40)

            day_t0 = time.perf_counter()
            try:
                oracle_count = oracle_count_for_day(conn, admin_schema, day_start, day_end)
                print(f"  Oracle COUNT(*):     {oracle_count:,} leg rows")
            except Exception as exc:
                print(f"  Oracle COUNT failed: {exc}")
                oracle_count = -1

            try:
                mapped = source.extract_htd_window(day_start, day_end, oracledb)
                elapsed = time.perf_counter() - day_t0
                print(f"  App query + map:     {len(mapped):,} transactions ({elapsed:.1f}s)")

                if oracle_count >= 0 and len(mapped) == 0 and oracle_count > 0:
                    print("  WARN: Oracle has legs but mapper returned 0 — check PART_TRAN_TYPE D/C pairing")

                if args.sample and mapped:
                    print("  Sample transactions:")
                    for tx in mapped[: args.sample]:
                        print(
                            f"    {tx.finacle_ref} | {tx.channel.value} | "
                            f"{tx.amount} {tx.currency} | {tx.sender_name[:40]}"
                        )

                total_mapped += len(mapped)
            except Exception as exc:
                print(f"  App extract FAILED: {exc}")
                import traceback

                traceback.print_exc()
                return 1

    elapsed_total = time.perf_counter() - t0
    print("\n" + "=" * 60)
    print(f"DONE — {total_mapped:,} mapped transactions in {elapsed_total:.1f}s")
    print("=" * 60)

    if total_mapped == 0:
        print("\nNo transactions mapped. Try:")
        print("  python scripts/test_oracle_connection.py")
        print("  Pick dates between MIN and MAX from that output.")
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
