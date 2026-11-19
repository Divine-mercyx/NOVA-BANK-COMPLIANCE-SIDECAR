"""Same-day DTD for every channel: the feed stores all channels, /export/dtd stays NIP-only,
/export/dtd/all-channels returns the rest, and the portal status counts them per channel.

Runs only when NOVA_TEST_DATABASE_URL points at a scratch database (see tests/conftest.py); it drops and
recreates every table there. Oracle is replaced by a stand-in that returns fixed DTD legs.
"""

import os
from datetime import date

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("NOVA_TEST_DATABASE_URL"), reason="set NOVA_TEST_DATABASE_URL to a scratch PostgreSQL database"
)

if os.environ.get("NOVA_TEST_DATABASE_URL"):
    import httpx
    from sqlalchemy import select, text

    from app.core.config import settings
    from app.core.database import AsyncSessionLocal, Base, engine
    from app.core.security import create_access_token, generate_api_key
    from app.db.migrate import run_migrations
    from app.main import app
    from app.models.entities import ApiKey, DtdTransaction, User
    from app.seed.bootstrap import seed_database
    from app.services.etl import dtd_pipeline as dtd_pipeline_module
    from app.services.etl.dtd_pipeline import DtdPipeline
    from app.services.etl.oracle_source import HtdDayCursor

DAY = date(2026, 3, 3)


def _legs(tran_id, particular, amount, debit_acct, credit_acct):
    base = {
        "tran_id": tran_id,
        "tran_amt": amount,
        "bank_code": "",
        "tran_particular": particular,
        "tran_type": "T",
        "tran_sub_type": "CI",
        "pstd_date": "2026-03-03",
        "sol_id": "001",
    }
    return [
        {**base, "part_tran_type": "D", "foracid": debit_acct, "acct_name": "ADA OBI"},
        {**base, "part_tran_type": "C", "foracid": credit_acct, "acct_name": "EZE MOTORS LTD"},
    ]


DTD_LEGS = (
    _legs("M00000101", "NIP TRANSFER OUT TO EZE", 250000, "1001010201", "1001010202")
    + _legs("M00000102", "RTGS PAYMENT EZE MOTORS", 90000000, "1001010203", "1001010204")
    + _legs("M00000103", "SWIFT OUTWARD USD", 15000, "1001010205", "1001010206")
    + _legs("M00000104", "CASH DEPOSIT BY ADA", 6000000, "1001010207", "1001010208")
)


class FakeOracleSource:
    """Stands in for TBAADM/APIUSER: one page of fixed DTD legs, no bank or NIP lookups."""

    def fetch_bank_directory(self, oracledb, admin_schema):
        return {}

    def fetch_nip_institution_names(self, oracledb, nip_schema):
        return {}

    def fetch_nip_flow_lookup(self, oracledb, nip_schema, tran_ids, names):
        return None

    def fetch_dtd_flush_page(self, oracledb, admin_schema, day_start, day_end, cursor, since):
        return list(DTD_LEGS), HtdDayCursor(done=True, legs_fetched=len(DTD_LEGS))


@pytest.fixture(autouse=True)
async def env(monkeypatch):
    await engine.dispose()
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.run_sync(Base.metadata.create_all)
    run_migrations()
    await seed_database()
    monkeypatch.setattr(dtd_pipeline_module, "OracleFinacleSource", FakeOracleSource)
    monkeypatch.setattr(dtd_pipeline_module, "get_oracledb", lambda: None)
    monkeypatch.setattr(dtd_pipeline_module, "HTD_BETWEEN_PAGES_SEC", 0)

    async with AsyncSessionLocal() as db:
        run = await DtdPipeline(db).pull_day(DAY)
        assert run.status.value == "success", run.error_summary
        full_key, prefix, key_hash = generate_api_key()
        db.add(ApiKey(name="Vendor", key_prefix=prefix, key_hash=key_hash, is_active=True))
        admin = (await db.execute(select(User).where(User.email == settings.admin_email))).unique().scalar_one()
        await db.commit()
    partner = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test", headers={"X-API-Key": full_key})
    token = create_access_token(admin.id, admin.email, admin.role.value, "csrf-x")
    staff = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://portal.test",
        cookies={settings.session_cookie_name: token}, headers={"x-csrf-token": "csrf-x"},
    )
    yield partner, staff
    await partner.aclose()
    await staff.aclose()
    await engine.dispose()


async def test_the_feed_stores_every_channel(env):
    async with AsyncSessionLocal() as db:
        channels = sorted(c.value for c in (await db.execute(select(DtdTransaction.channel))).scalars())
    assert channels == ["CASH_DEPOSIT", "NIP", "RTGS", "SWIFT"]


async def test_nip_vendor_pull_is_unchanged(env):
    partner, _ = env
    body = (await partner.get("/api/v1/export/dtd", params={"date": DAY.isoformat()})).json()
    assert [t["t_trans_number"] for t in body["transactions"]] and all("M00000101" in t["t_trans_number"] for t in body["transactions"])
    assert body["meta"]["channel"] == "NIP" and body["meta"]["total_matching"] == 1


async def test_all_channels_pull(env):
    partner, _ = env
    r = await partner.get("/api/v1/export/dtd/all-channels", params={"date": DAY.isoformat()})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["meta"]["channel"] == "ALL" and body["meta"]["scope"] == "dtd_all_channels"
    assert body["meta"]["total_matching"] == 4
    refs = " ".join(t["t_trans_number"] for t in body["transactions"])
    for tran_id in ("M00000101", "M00000102", "M00000103", "M00000104"):
        assert tran_id in refs
    # same NFIU columns as the NIP pull
    nip_row = (await partner.get("/api/v1/export/dtd", params={"date": DAY.isoformat()})).json()["transactions"][0]
    assert set(body["transactions"][0]) == set(nip_row)


async def test_all_channels_filter_and_errors(env):
    partner, _ = env
    r = await partner.get("/api/v1/export/dtd/all-channels", params={"date": DAY.isoformat(), "channels": "rtgs,swift"})
    assert r.json()["meta"]["total_matching"] == 2 and r.json()["meta"]["channel"] == "RTGS,SWIFT"
    r = await partner.get("/api/v1/export/dtd/all-channels", params={"date": DAY.isoformat(), "channels": "CHEQUE"})
    assert r.status_code == 400 and "CHEQUE" in r.text
    other_day = await partner.get("/api/v1/export/dtd/all-channels", params={"date": "2026-03-04"})
    assert other_day.json()["meta"]["total_matching"] == 0
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test") as anon:
        assert (await anon.get("/api/v1/export/dtd/all-channels")).status_code == 401


async def test_portal_status_counts_and_filters_by_channel(env, monkeypatch):
    from app.services.etl import dtd_control

    monkeypatch.setattr(dtd_control, "_today", lambda: DAY)
    _, staff = env
    body = (await staff.get("/api/v1/dtd/status")).json()
    assert body["by_channel"] == {"NIP": 1, "RTGS": 1, "SWIFT": 1, "CASH_DEPOSIT": 1}
    assert len(body["transactions"]) == 4 and body["channel_filter"] is None
    only = (await staff.get("/api/v1/dtd/status", params={"channel": "RTGS"})).json()
    assert [t["channel"] for t in only["transactions"]] == ["RTGS"]
    assert only["by_channel"]["NIP"] == 1  # counts stay whole-day
    assert (await staff.get("/api/v1/dtd/status", params={"channel": "BOGUS"})).status_code == 422
