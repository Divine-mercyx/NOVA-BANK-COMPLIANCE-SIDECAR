#!/usr/bin/env python3
"""Diagnose Oracle connectivity in stages (VPN laptop).

Does NOT run COUNT(*) on TBAADM.HTD — that scan can hang for hours over VPN.

Usage (from backend/, with .env loaded):
  cd backend
  .venv\\Scripts\\python.exe scripts\\test_oracle_connection.py

  Optional:
  python scripts/test_oracle_connection.py --port 1521
  python scripts/test_oracle_connection.py --from-date 2023-02-01 --to-date 2023-02-03
"""

from __future__ import annotations

import argparse
import os
import socket
import sys
import time
from datetime import datetime, timedelta, time as dt_time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TCP_TIMEOUT = 12


def _step(n: int, title: str) -> None:
    print(f"\n[{n}] {title}", flush=True)


def _ok(msg: str, elapsed: float | None = None) -> None:
    extra = f" ({elapsed:.1f}s)" if elapsed is not None else ""
    print(f"    OK{extra}  {msg}", flush=True)


def _fail(msg: str) -> int:
    print(f"    FAIL  {msg}", flush=True)
    return 1


def parse_dsn_host_port(dsn: str) -> tuple[str, int]:
    """Parse host:port/service (Easy Connect)."""
    host_port, _, _svc = dsn.partition("/")
    if ":" not in host_port:
        return host_port, 1521
    host, port_s = host_port.rsplit(":", 1)
    return host, int(port_s)


def tcp_check(host: str, port: int, timeout: float = TCP_TIMEOUT) -> tuple[bool, str, float]:
    started = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            elapsed = time.perf_counter() - started
            return True, f"TCP {host}:{port} open", elapsed
    except TimeoutError:
        elapsed = time.perf_counter() - started
        return False, f"TCP timeout after {timeout}s — VPN off, wrong host, or firewall", elapsed
    except OSError as exc:
        elapsed = time.perf_counter() - started
        return False, f"TCP {host}:{port} failed: {exc}", elapsed


def main() -> int:
    parser = argparse.ArgumentParser(description="Nova Finacle Oracle connection check")
    parser.add_argument("--port", type=int, default=None, help="Override DSN port for TCP test only")
    parser.add_argument("--from-date", default="2023-02-01", help="Inclusive start YYYY-MM-DD (default 2023-02-01)")
    parser.add_argument("--to-date", default="2023-02-03", help="Inclusive end YYYY-MM-DD (default 2023-02-03)")
    parser.add_argument("--htd-probe", default=None, help="Deprecated: use --from-date / --to-date")
    args = parser.parse_args()

    from app.core.config import settings

    print("=== Nova Oracle connectivity check ===", flush=True)
    print(f"    FINACLE_MODE               = {settings.finacle_mode}", flush=True)
    print(f"    FINACLE_ORACLE_DSN         = {settings.finacle_oracle_dsn or '(empty)'}", flush=True)
    print(f"    FINACLE_ORACLE_USER        = {settings.finacle_oracle_user or '(empty)'}", flush=True)
    print(f"    FINACLE_ORACLE_THICK_MODE  = {settings.finacle_oracle_thick_mode}", flush=True)
    print(f"    INSTANT CLIENT DIR         = {settings.finacle_oracle_client_lib_dir or '(not set)'}", flush=True)
    print(f"    TIMEZONE                   = {settings.finacle_timezone}", flush=True)
    print("    (timezone does not affect connect speed)", flush=True)

    if settings.finacle_mode.lower() != "oracle":
        print("\n    NOTE: FINACLE_MODE is not oracle — the portal will not use this connection.", flush=True)

    if not settings.finacle_oracle_dsn or not settings.finacle_oracle_user:
        return _fail("Set FINACLE_ORACLE_DSN, USER, and PASSWORD in backend/.env")

    host, dsn_port = parse_dsn_host_port(settings.finacle_oracle_dsn)
    tcp_port = args.port or dsn_port

    _step(1, "Instant Client (thick mode)")
    if settings.finacle_oracle_thick_mode:
        lib = settings.finacle_oracle_client_lib_dir
        if not lib:
            print("    WARN  FINACLE_ORACLE_CLIENT_LIB_DIR empty — oracledb will search PATH", flush=True)
        else:
            p = Path(lib)
            if not p.is_dir():
                return _fail(f"Folder does not exist: {lib}")
            print(f"    Found directory: {lib}", flush=True)
    else:
        print("    Thick mode is OFF — Finacle 10G password verifiers usually need it ON", flush=True)

    _step(2, f"TCP reachability {host}:{tcp_port} (timeout {TCP_TIMEOUT}s)")
    ok, msg, elapsed = tcp_check(host, tcp_port)
    if not ok:
        _fail(msg)
        if tcp_port == 1625:
            print("    Hint: try the same host on 1521 (common listener port).", flush=True)
        print("    Hint: connect bank VPN first, then re-run this script.", flush=True)
        return 1
    _ok(msg, elapsed)

    _step(3, "Load python-oracledb + Instant Client")
    started = time.perf_counter()
    try:
        from app.services.etl.oracle_client import connect_oracle, get_oracledb

        oracledb = get_oracledb()
    except Exception as exc:
        return _fail(f"init_oracle_client failed: {exc}")
    _ok("Client initialized", time.perf_counter() - started)

    _step(4, "Oracle login + SELECT 1 FROM DUAL")
    started = time.perf_counter()
    try:
        conn = connect_oracle(oracledb)
    except Exception as exc:
        _fail(str(exc))
        print("    Hint: wrong user/password, SID/service (NOVAPRD), or Instant Client version.", flush=True)
        print("    Hint: DPY-3015 = enable FINACLE_ORACLE_THICK_MODE=true and Instant Client.", flush=True)
        return 1

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM DUAL")
            row = cur.fetchone()
            if not row or row[0] != 1:
                return _fail("DUAL returned unexpected result")
        _ok(f"Logged in as {settings.finacle_oracle_user!r}", time.perf_counter() - started)

        _step(5, "Can we see TBAADM.HTD? (one row only, no full-table COUNT)")
        started = time.perf_counter()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT TRAN_ID FROM {settings.finacle_admin_schema}.HTD FETCH FIRST 1 ROW ONLY"
                )
                sample = cur.fetchone()
            elapsed = time.perf_counter() - started
            if sample:
                _ok(f"HTD readable — sample TRAN_ID={sample[0]!r}", elapsed)
            else:
                _ok("HTD readable but empty", elapsed)
        except Exception as exc:
            elapsed = time.perf_counter() - started
            return _fail(f"HTD select failed ({elapsed:.1f}s): {exc}")

        from_d = datetime.strptime(args.from_date, "%Y-%m-%d")
        to_d = datetime.strptime(args.to_date, "%Y-%m-%d")
        schema = settings.finacle_admin_schema
        sql_one = f"""
            SELECT TRAN_ID, NVL(PSTD_DATE, TRAN_DATE) AS TX_DATE, TRAN_AMT, PART_TRAN_TYPE
            FROM {schema}.HTD
            WHERE (
                    (PSTD_DATE >= :date_from AND PSTD_DATE < :date_to_exclusive)
                 OR (PSTD_DATE IS NULL AND TRAN_DATE >= :date_from AND TRAN_DATE < :date_to_exclusive)
                  )
            FETCH FIRST 1 ROW ONLY
        """
        sql_day = f"""
            SELECT TRAN_ID, TRAN_DATE, PSTD_DATE, TRAN_AMT, PART_TRAN_TYPE, ACID
            FROM {schema}.HTD
            WHERE (
                    (PSTD_DATE >= :date_from AND PSTD_DATE < :date_to_exclusive)
                 OR (PSTD_DATE IS NULL AND TRAN_DATE >= :date_from AND TRAN_DATE < :date_to_exclusive)
                  )
        """
        _step(6, f"HTD extract {args.from_date} → {args.to_date} (one day at a time)")
        print("    FETCH FIRST 1 is fast (Oracle stops after one row).", flush=True)
        print("    A full-day fetch waits on fetchmany — that is the VPN bottleneck, not login.", flush=True)

        grand = 0
        day = from_d
        try:
            while day.date() <= to_d.date():
                start = datetime.combine(day.date(), dt_time.min)
                end = start + timedelta(days=1)
                label = day.date().isoformat()
                print(f"\n    --- {label} ---", flush=True)

                t0 = time.perf_counter()
                with conn.cursor() as cur:
                    cur.execute(sql_one, date_from=start, date_to_exclusive=end)
                    probe = cur.fetchone()
                print(f"    FETCH FIRST 1: {time.perf_counter() - t0:.1f}s  {probe}", flush=True)
                if not probe:
                    print("    No HTD legs this day — skipping full fetch.", flush=True)
                    day += timedelta(days=1)
                    continue

                t1 = time.perf_counter()
                day_total = 0
                print("    Full-day fetch (20 rows at a time)…", flush=True)
                with conn.cursor() as cur:
                    cur.arraysize = 20
                    if hasattr(cur, "prefetchrows"):
                        cur.prefetchrows = 20
                    cur.execute(sql_day, date_from=start, date_to_exclusive=end)
                    cols = [d[0].lower() for d in cur.description]
                    first = True
                    while True:
                        chunk = cur.fetchmany(20)
                        if not chunk:
                            break
                        if first:
                            sample = dict(zip(cols, chunk[0]))
                            print(
                                f"    First full-fetch row in {time.perf_counter() - t1:.1f}s  TRAN_ID={sample.get('tran_id')!r}",
                                flush=True,
                            )
                            first = False
                        day_total += len(chunk)
                        grand += len(chunk)
                        print(f"    {label}: {day_total} legs ({time.perf_counter() - t1:.1f}s)", flush=True)
                print(f"    {label} done: {day_total} legs", flush=True)
                day += timedelta(days=1)
        except Exception as exc:
            return _fail(f"HTD range fetch died after {grand} legs: {exc}")
        _ok(f"{grand} HTD legs {args.from_date} → {args.to_date}")
    finally:
        conn.close()

    print("\n=== SUCCESS — Oracle session works ===", flush=True)
    print("If FETCH FIRST 1 is fast but full-day fetch stalls, VPN cannot carry HTD volume.", flush=True)
    print("Use CSV mode for demos until DBA indexes / replica are in place.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
