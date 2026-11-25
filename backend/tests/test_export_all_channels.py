"""GET /api/v1/export/transactions/all-channels against a real PostgreSQL database.

Runs only when NOVA_TEST_DATABASE_URL points at a scratch database (see tests/conftest.py); it drops and
recreates every table there.
"""

import os
from datetime import datetime, timezone

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("NOVA_TEST_DATABASE_URL"), reason="set NOVA_TEST_DATABASE_URL to a scratch PostgreSQL database"
)

if os.environ.get("NOVA_TEST_DATABASE_URL"):
    import httpx
    from sqlalchemy import text

    from app.core.database import AsyncSessionLocal, Base, engine
    from app.core.security import generate_api_key
    from app.main import app
    from app.models.entities import ApiKey, ExtractionRun, StagingTransaction, TransactionChannel

LAGOS_NOON = lambda d: datetime(2026, 3, d, 11, 0, tzinfo=timezone.utc)  # noqa: E731

ROWS = [
    # finacle_ref, channel, day, amount, currency, valid
    ("NIP-1", "NIP", 2, 120000.0, "NGN", True),
    ("NIP-2", "NIP", 3, 7500000.0, "NGN", True),
    ("RTGS-1", "RTGS", 3, 90000000.0, "NGN", True),
    ("SWIFT-1", "SWIFT", 4, 15000.0, "USD", True),
    ("CASH-1", "CASH_DEPOSIT", 4, 6000000.0, "NGN", True),
    ("MOB-BAD", "MOBILE", 4, -5.0, "NGN", False),
    ("RTGS-OLD", "RTGS", 20, 100.0, "NGN", True),  # outside the 1-5 March window
]


@pytest.fixture(autouse=True)
async def seeded():
    await engine.dispose()
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        run = ExtractionRun(source="test")
        db.add(run)
        await db.flush()
        for ref, channel, day, amount, currency, valid in ROWS:
            db.add(
                StagingTransaction(
                    extraction_run_id=run.id,
                    finacle_ref=ref,
                    channel=TransactionChannel(channel),
                    transaction_date=LAGOS_NOON(day) if day < 20 else datetime(2026, 3, day, 11, tzinfo=timezone.utc),
                    amount=amount,
                    currency=currency,
                    sender_name="ADA OBI",
                    sender_account="1002000063",
                    receiver_name="EZE MOTORS LTD",
                    receiver_account="1102010043",
                    is_valid=valid,
                )
            )
        full_key, prefix, key_hash = generate_api_key()
        db.add(ApiKey(name="Vendor", key_prefix=prefix, key_hash=key_hash, is_active=True))
        await db.commit()
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test", headers={"X-API-Key": full_key})
    yield client
    await client.aclose()
    await engine.dispose()


WINDOW = {"date_from": "2026-03-01", "date_to": "2026-03-05"}


async def test_returns_every_channel_in_the_nfiu_layout(seeded):
    r = await seeded.get("/api/v1/export/transactions/all-channels", params=WINDOW)
    assert r.status_code == 200, r.text
    body = r.json()
    refs = [t["t_trans_number"] for t in body["transactions"]]
    assert set(refs) == {"NIP-1", "NIP-2", "RTGS-1", "SWIFT-1", "CASH-1", "MOB-BAD"}
    assert "RTGS-OLD" not in refs  # outside the window
    assert body["meta"]["channel"] == "ALL" and body["meta"]["scope"] == "all_channels"
    assert body["meta"]["total_matching"] == 6 and body["meta"]["returned"] == 6
    row = body["transactions"][0]
    assert {"t_account_number", "t_amount_local", "t_source_institution_code", "t_date"} <= set(row)


async def test_nip_endpoint_is_still_nip_only(seeded):
    r = await seeded.get("/api/v1/export/transactions", params=WINDOW)
    assert sorted(t["t_trans_number"] for t in r.json()["transactions"]) == ["NIP-1", "NIP-2"]


async def test_channels_filter(seeded):
    r = await seeded.get("/api/v1/export/transactions/all-channels", params={**WINDOW, "channels": " rtgs, SWIFT ,rtgs"})
    assert r.status_code == 200, r.text
    assert sorted(t["t_trans_number"] for t in r.json()["transactions"]) == ["RTGS-1", "SWIFT-1"]
    assert r.json()["meta"]["channel"] == "RTGS,SWIFT"
    # an empty value means every channel
    r = await seeded.get("/api/v1/export/transactions/all-channels", params={**WINDOW, "channels": ""})
    assert r.json()["meta"]["total_matching"] == 6


async def test_unknown_channel_is_refused_with_the_allowed_list(seeded):
    r = await seeded.get("/api/v1/export/transactions/all-channels", params={**WINDOW, "channels": "RTGS,BITCOIN"})
    assert r.status_code == 400
    assert "BITCOIN" in r.text and "CASH_DEPOSIT" in r.text


async def test_valid_only_and_paging(seeded):
    r = await seeded.get("/api/v1/export/transactions/all-channels", params={**WINDOW, "valid_only": "true"})
    assert "MOB-BAD" not in [t["t_trans_number"] for t in r.json()["transactions"]]
    first = (await seeded.get("/api/v1/export/transactions/all-channels", params={**WINDOW, "limit": 2})).json()
    second = (await seeded.get("/api/v1/export/transactions/all-channels", params={**WINDOW, "limit": 2, "offset": 2})).json()
    assert first["meta"]["returned"] == 2 and first["meta"]["total_matching"] == 6
    assert not {t["t_trans_number"] for t in first["transactions"]} & {t["t_trans_number"] for t in second["transactions"]}


async def test_needs_a_date_range_and_an_api_key(seeded):
    assert (await seeded.get("/api/v1/export/transactions/all-channels")).status_code == 400
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test") as anon:
        assert (await anon.get("/api/v1/export/transactions/all-channels", params=WINDOW)).status_code == 401


async def test_ctr_all_channels_is_naira_over_the_cap_from_every_channel(seeded):
    r = await seeded.get("/api/v1/export/transactions/ctr/all-channels", params=WINDOW)
    assert r.status_code == 200, r.text
    body = r.json()
    # NIP-2 (7.5m), RTGS-1 (90m) and CASH-1 (6m) pass; NIP-1 is under the cap and SWIFT-1 is USD (FTR, not CTR).
    assert sorted(t["t_trans_number"] for t in body["transactions"]) == ["CASH-1", "NIP-2", "RTGS-1"]
    meta = body["meta"]
    assert meta["scope"] == "ctr_all_channels" and meta["report_type"] == "CTR" and meta["channel"] == "ALL"
    assert meta["ctr_threshold_ngn"] == 5_000_000.0 and meta["total_matching"] == 3


async def test_ctr_all_channels_filters_and_keeps_nip_ctr_nip_only(seeded):
    r = await seeded.get("/api/v1/export/transactions/ctr/all-channels", params={**WINDOW, "channels": "rtgs"})
    assert [t["t_trans_number"] for t in r.json()["transactions"]] == ["RTGS-1"]
    assert (await seeded.get("/api/v1/export/transactions/ctr/all-channels", params={**WINDOW, "channels": "BITCOIN"})).status_code == 400
    nip = await seeded.get("/api/v1/export/transactions/ctr", params=WINDOW)
    assert [t["t_trans_number"] for t in nip.json()["transactions"]] == ["NIP-2"]
