"""Quick Oracle connectivity check for the VPN laptop (thick mode for Finacle 10G verifiers)."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.services.etl.oracle_client import get_oracledb


def main() -> int:
    if not settings.finacle_oracle_dsn:
        print("Set FINACLE_ORACLE_DSN (and USER/PASSWORD) in backend/.env")
        return 1

    oracledb = get_oracledb()
    mode = "thick" if settings.finacle_oracle_thick_mode else "thin"
    print(f"Connecting ({mode} mode) to {settings.finacle_oracle_dsn} as {settings.finacle_oracle_user!r}...")

    with oracledb.connect(
        user=settings.finacle_oracle_user,
        password=settings.finacle_oracle_password,
        dsn=settings.finacle_oracle_dsn,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM TBAADM.HTD")
            count = cur.fetchone()[0]
            print(f"OK — TBAADM.HTD rows: {count:,}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
