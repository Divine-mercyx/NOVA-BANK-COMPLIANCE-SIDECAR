#!/usr/bin/env python3
"""Module 4 smoke test: API key → ingest → screening → verify staging/alerts.

Usage:
  cd backend && PYTHONPATH=. python scripts/smoke_module4.py

Requires backend running on http://localhost:8000 with Postgres up.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = "http://localhost:8000"
ADMIN_EMAIL = "admin@novabank.ng"
ADMIN_PASSWORD = "Admin@Nova2026"
BATCH_ID = f"SMOKE-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"


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
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"{method} {path} -> {exc.code}: {detail}") from exc


def login_admin() -> str:
    login = request("POST", "/api/v1/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    session_id = login["otp_session_id"]
    print("Check backend console for OTP, or re-run after reading OTP from server logs.")
    otp = os.environ.get("SMOKE_OTP") or input("Enter OTP from backend console: ").strip()
    auth = request("POST", "/api/v1/auth/verify-otp", {"otp_session_id": session_id, "code": otp})
    token = auth["access_token"]
    print("✓ Admin authenticated")
    return token


def main() -> int:
    print(f"Nova Module 4 smoke test → {BASE}\n")

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
        {"name": "Smoke Test Key", "description": "Automated Module 4 smoke test"},
        auth_headers,
    )
    api_key = key_resp["api_key"]
    print(f"✓ API key created (prefix {key_resp['key_prefix']}…)")

    partner_headers = {"X-API-Key": api_key}
    ingest_body = {
        "batch_id": BATCH_ID,
        "transactions": [
            {
                "finacle_ref": f"SMOKE-NIP-{BATCH_ID}",
                "channel": "NIP",
                "transaction_date": datetime.now(timezone.utc).isoformat(),
                "amount": 1_500_000,
                "currency": "NGN",
                "sender_name": "Hassan Ibrahim",
                "sender_account": "0123456789",
                "receiver_name": "Jane Smith",
                "receiver_account": "9876543210",
                "narration": "Smoke test transfer",
            }
        ],
    }
    ingest = request("POST", "/api/v1/ingest/transactions", ingest_body, partner_headers)
    print(f"✓ Ingest: accepted={ingest['accepted']} rejected={ingest['rejected']} run_id={ingest['run_id']}")
    assert ingest["accepted"] >= 1, "Expected at least one accepted record"

    screening = request(
        "POST",
        "/api/v1/screening/check",
        {
            "finacle_ref": f"SMOKE-SCR-{BATCH_ID}",
            "sender_name": "Hassan Ibrahim",
            "receiver_name": "Jane Smith",
            "amount": 1_500_000,
            "currency": "NGN",
            "channel": "NIP",
        },
        partner_headers,
    )
    print(f"✓ Screening: decision={screening['decision']} matches={len(screening['matches'])} alert_id={screening.get('alert_id')}")
    assert screening["decision"] == "review", "Expected review decision for sanctions keyword name"

    staging = request("GET", f"/api/v1/staging/transactions?limit=10", headers=auth_headers)
    smoke_tx = [t for t in staging if t.get("finacle_ref", "").startswith("SMOKE-NIP")]
    print(f"✓ Staging: found {len(smoke_tx)} smoke transaction(s)")
    assert smoke_tx, "Ingested transaction not found in staging"

    alerts = request("GET", "/api/v1/screening/alerts", headers=auth_headers)
    smoke_alerts = [a for a in alerts if a.get("finacle_ref", "").startswith("SMOKE-SCR")]
    print(f"✓ Alerts: found {len(smoke_alerts)} smoke alert(s)")
    assert smoke_alerts, "Screening alert not found in queue"

    batch_status = request("GET", f"/api/v1/ingest/batches/{BATCH_ID}", headers=partner_headers)
    print(f"✓ Batch status: {batch_status['status']}")

    print("\n✅ Module 4 smoke test PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
