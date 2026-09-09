#!/usr/bin/env python3
"""Export API smoke test: API key → verify → summary → pull transactions.

Usage:
  cd backend && PYTHONPATH=. python scripts/smoke_module4.py

Requires backend running on http://localhost:8000 with staged data in Postgres.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = "http://localhost:8000"
ADMIN_EMAIL = "admin@novabank.ng"
ADMIN_PASSWORD = "Admin@Nova2026"


def request(method: str, path: str, body: dict | None = None, headers: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"{method} {path} -> {exc.code}: {detail}") from exc


def partner_get(path: str, api_key: str, params: dict | None = None) -> dict:
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    req = urllib.request.Request(
        f"{BASE}{path}{query}",
        method="GET",
        headers={"X-API-Key": api_key},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def login_admin() -> str:
    login = request("POST", "/api/v1/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    otp = os.environ.get("SMOKE_OTP") or input("Enter OTP from backend console: ").strip()
    auth = request("POST", "/api/v1/auth/verify-otp", {"otp_session_id": login["otp_session_id"], "code": otp})
    print("✓ Admin authenticated")
    return auth["access_token"]


def main() -> int:
    print(f"Nova Export API smoke test → {BASE}\n")

    try:
        health = request("GET", "/health")
        print(f"✓ Health: {health}")
    except Exception as exc:
        print(f"✗ Backend not reachable: {exc}")
        return 1

    token = login_admin()
    auth_headers = {"Authorization": f"Bearer {token}"}

    key_resp = request(
        "POST",
        "/api/v1/integration/keys",
        {"name": "Export Smoke Key", "description": "Automated export API smoke test"},
        auth_headers,
    )
    api_key = key_resp["api_key"]
    assert api_key.startswith("nova_"), "API key format invalid"
    print(f"✓ API key created (prefix {key_resp['key_prefix']}…)")

    verify = partner_get("/api/v1/export/verify", api_key)
    print(f"✓ Verify: {verify['client_name']} — {verify['message']}")

    period_start = os.environ.get("SMOKE_PERIOD_START", "2023-02-02T00:00:00+01:00")
    period_end = os.environ.get("SMOKE_PERIOD_END", "2023-02-04T23:59:59+01:00")

    summary = partner_get(
        "/api/v1/export/summary",
        api_key,
        {"period_start": period_start, "period_end": period_end},
    )
    print(f"✓ Summary: {summary['total_valid']} valid, {summary['ctr_eligible']} CTR")

    txns = partner_get(
        "/api/v1/export/transactions",
        api_key,
        {
            "period_start": period_start,
            "period_end": period_end,
            "report_type": "CTR",
            "limit": 5,
        },
    )
    count = len(txns.get("transactions", []))
    print(f"✓ Pulled {count} CTR transactions (total matching {txns['meta']['total_matching']})")
    if count:
        sample = txns["transactions"][0]
        assert "nfiu_payload" in sample, "Missing nfiu_payload on export"
        print(f"  Sample ref: {sample['finacle_ref']}")

    reports = partner_get("/api/v1/export/reports", api_key, {"limit": 5})
    print(f"✓ Reports listed: {reports['returned']}")

    print("\nAll export API checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
