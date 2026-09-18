#!/usr/bin/env python3
"""Describe TBAADM.DTD (same-day transactions) — structure only.

No COUNT(*), no NFIU mapping, no 30-minute scheduler.

VPN laptop, from backend/:

  python scripts/probe_dtd.py
"""

from __future__ import annotations

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.services.etl.oracle_client import connect_oracle, get_oracledb

SAMPLE_LIMIT = 5


def _fmt(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    return str(value).replace("\n", " ")[:100]


def main() -> int:
    schema = settings.finacle_admin_schema
    table = f"{schema}.DTD"
    print("=== Nova DTD structure probe ===", flush=True)
    print(f"    DSN    = {settings.finacle_oracle_dsn}", flush=True)
    print(f"    USER   = {settings.finacle_oracle_user}", flush=True)
    print(f"    TABLE  = {table}", flush=True)
    print("    Goal   = columns + 5 sample legs. No pairing, no NFIU layout.", flush=True)

    oracledb = get_oracledb()
    with connect_oracle(oracledb, apply_call_timeout=True) as conn:
        with conn.cursor() as cursor:
            print("\n[1] Column dictionary", flush=True)
            cursor.execute(
                """
                SELECT column_id, column_name, data_type, data_length, nullable
                FROM all_tab_columns
                WHERE owner = :owner
                  AND table_name = 'DTD'
                ORDER BY column_id
                """,
                owner=schema.upper(),
            )
            columns = cursor.fetchall()
            if not columns:
                print(
                    f"    No DTD columns visible as {schema}.DTD — "
                    "this user may lack GRANT SELECT. Ask IT, or check owner below.",
                    flush=True,
                )
                cursor.execute(
                    """
                    SELECT owner, table_name
                    FROM all_tables
                    WHERE UPPER(table_name) = 'DTD'
                    ORDER BY owner
                    """
                )
                owners = cursor.fetchall()
                if not owners:
                    print("    all_tables: no DTD at all for this login.", flush=True)
                    return 1
                for owner, name in owners:
                    print(f"    visible: {owner}.{name}", flush=True)
                return 1

            col_names = []
            for col_id, name, dtype, length, nullable in columns:
                col_names.append(str(name).upper())
                print(
                    f"    {int(col_id):3d}  {name:<32} {dtype}({length})  null={nullable}",
                    flush=True,
                )

            print("\n[2] Same names as HTD? (dictionary only)", flush=True)
            cursor.execute(
                """
                SELECT column_name
                FROM all_tab_columns
                WHERE owner = :owner
                  AND table_name = 'HTD'
                """,
                owner=schema.upper(),
            )
            htd_cols = {str(row[0]).upper() for row in cursor.fetchall()}
            dtd_set = set(col_names)
            overlap = sorted(dtd_set & htd_cols)
            only_dtd = sorted(dtd_set - htd_cols)
            only_htd = sorted(htd_cols - dtd_set)
            print(f"    overlap     ({len(overlap)}): {', '.join(overlap) or '(none)'}", flush=True)
            print(f"    DTD-only    ({len(only_dtd)}): {', '.join(only_dtd) or '(none)'}", flush=True)
            print(f"    HTD-only    ({len(only_htd)}): {', '.join(only_htd) or '(none)'}", flush=True)

            pairing_keys = ("TRAN_ID", "PART_TRAN_TYPE", "PART_TRAN_SRL_NUM", "TRAN_AMT", "ACID")
            print("\n[3] Pairing / GAM keys present on DTD?", flush=True)
            for key in pairing_keys:
                print(f"    {key:<22} {'yes' if key in dtd_set else 'NO'}", flush=True)
            print(f"    GAM join possible: {'yes' if 'ACID' in dtd_set else 'not until we see an account key'}", flush=True)

            print(f"\n[4] Sample {SAMPLE_LIMIT} DTD rows (FETCH FIRST, no COUNT)", flush=True)
            cursor.execute(f"SELECT * FROM {table} FETCH FIRST {SAMPLE_LIMIT} ROWS ONLY")
            sample_cols = [d[0] for d in cursor.description]
            print("    " + " | ".join(sample_cols), flush=True)
            acid = None
            n = 0
            for row in cursor:
                n += 1
                as_dict = {sample_cols[i].upper(): row[i] for i in range(len(sample_cols))}
                if acid is None:
                    acid = as_dict.get("ACID")
                print("    " + " | ".join(_fmt(v) for v in row), flush=True)
            print(f"    (showed {n} row(s))", flush=True)

            if acid:
                print(f"\n[5] One GAM lookup for sample ACID={acid!r}", flush=True)
                cursor.execute(
                    f"""
                    SELECT FORACID, ACCT_NAME
                    FROM {schema}.GAM
                    WHERE ACID = :acid
                      AND NVL(DEL_FLG, 'N') = 'N'
                    FETCH FIRST 1 ROW ONLY
                    """,
                    acid=acid,
                )
                gam = cursor.fetchone()
                if gam:
                    print(f"    FORACID={gam[0]!r}  ACCT_NAME={gam[1]!r}", flush=True)
                else:
                    print("    no GAM row for that ACID", flush=True)
            else:
                print("\n[5] Skip GAM — no ACID on the sample (or DTD has no ACID column)", flush=True)

    print("\nDone. Paste this whole output back. Do not start a 30-min job yet.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
