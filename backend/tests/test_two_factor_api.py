"""Two-factor sign-in end to end, through the real API and a real PostgreSQL database.

Runs only when NOVA_TEST_DATABASE_URL points at a scratch database (see tests/conftest.py); it drops and
recreates every table there.
"""

import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("NOVA_TEST_DATABASE_URL"), reason="set NOVA_TEST_DATABASE_URL to a scratch PostgreSQL database"
)

if os.environ.get("NOVA_TEST_DATABASE_URL"):
    import httpx
    from sqlalchemy import select, text

    from app.api.routes import auth as auth_routes
    from app.core import totp
    from app.core.config import settings
    from app.core.database import AsyncSessionLocal, Base, engine
    from app.core.secret_box import open_sealed
    from app.db.migrate import run_migrations
    from app.main import app
    from app.models.entities import AuditEvent, OtpSession, User
    from app.seed.bootstrap import seed_database

ADMIN = ("admin@novabank.ng", "Admin@Nova2026")
START = 1_800_000_000.0  # a fixed "now"; the tests move it forward by 30-second steps


class Clock:
    def __init__(self):
        self.now = START

    def advance(self, seconds: float):
        self.now += seconds


@pytest.fixture(autouse=True)
async def fresh_db(monkeypatch):
    await engine.dispose()
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.run_sync(Base.metadata.create_all)
    run_migrations()
    await seed_database()
    yield
    await engine.dispose()


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(auth_routes, "_now", lambda: c.now)
    return c


def new_client() -> "httpx.AsyncClient":
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://portal.test")


async def sign_in(client, email=ADMIN[0], password=ADMIN[1]):
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


async def enrol(client, clock, email=ADMIN[0], password=ADMIN[1]):
    """First sign-in: password, setup, confirm with a code. Returns (secret, recovery_codes)."""
    login = (await sign_in(client, email, password)).json()
    assert login["two_factor"] == "setup"
    setup = await client.post("/api/v1/auth/2fa/setup", json={"otp_session_id": login["otp_session_id"]})
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    code = totp.code_at(secret, totp.step_at(clock.now))
    done = await client.post("/api/v1/auth/2fa/enable", json={"otp_session_id": login["otp_session_id"], "code": code})
    assert done.status_code == 200, done.text
    return secret, done.json()["recovery_codes"]


async def user(email=ADMIN[0]) -> "User":
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(User).where(User.email == email))).unique().scalar_one()


async def actions() -> list[str]:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(AuditEvent.action).order_by(AuditEvent.created_at))).scalars().all()
    return list(rows)


async def test_first_sign_in_sets_up_the_authenticator_app_then_signs_in(clock):
    async with new_client() as client:
        login = (await sign_in(client)).json()
        assert login["two_factor"] == "setup"
        # Nothing but a challenge: no session yet.
        assert settings.session_cookie_name not in client.cookies
        assert (await client.get("/api/v1/auth/me")).status_code == 401

        setup = (await client.post("/api/v1/auth/2fa/setup", json={"otp_session_id": login["otp_session_id"]})).json()
        assert setup["otpauth_url"].startswith("otpauth://totp/") and setup["account"] == ADMIN[0]
        # Asking again (a reload, a second tab) gives the same key.
        again = (await client.post("/api/v1/auth/2fa/setup", json={"otp_session_id": login["otp_session_id"]})).json()
        assert again["secret"] == setup["secret"]

        # A wrong code does not enable it.
        wrong = await client.post("/api/v1/auth/2fa/enable", json={"otp_session_id": login["otp_session_id"], "code": "000000"})
        assert wrong.status_code == 400
        assert not (await user()).totp_enabled

        code = totp.code_at(setup["secret"], totp.step_at(clock.now))
        done = await client.post("/api/v1/auth/2fa/enable", json={"otp_session_id": login["otp_session_id"], "code": code})
        assert done.status_code == 200
        body = done.json()
        assert body["user"]["two_factor_enabled"] is True
        assert len(body["recovery_codes"]) == 10 and len(set(body["recovery_codes"])) == 10
        # Signed in: cookies set and /me works.
        assert (await client.get("/api/v1/auth/me")).status_code == 200

    stored = await user()
    assert stored.totp_enabled and stored.totp_pending_secret is None
    # The key is sealed in the database, and the recovery codes are not stored as typed.
    assert setup["secret"] not in stored.totp_secret and open_sealed(stored.totp_secret) == setup["secret"]
    assert all(c not in str(stored.recovery_code_hashes) for c in body["recovery_codes"])
    assert "TWO_FACTOR_ENABLED" in await actions()


async def test_later_sign_ins_need_the_code_and_a_code_works_once(clock):
    async with new_client() as client:
        secret, _ = await enrol(client, clock)

    clock.advance(30)  # the code used to enrol belongs to the previous step
    async with new_client() as client:
        login = (await sign_in(client)).json()
        assert login["two_factor"] == "verify"
        code = totp.code_at(secret, totp.step_at(clock.now))
        ok = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "code": code})
        assert ok.status_code == 200 and ok.json()["user"]["email"] == ADMIN[0]
        assert (await client.get("/api/v1/auth/me")).status_code == 200

    # The same code, typed again by someone who watched: refused, even with a fresh challenge and password.
    async with new_client() as other:
        login = (await sign_in(other)).json()
        replay = await other.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "code": code})
        assert replay.status_code == 400 and replay.json()["detail"] == "Invalid code"
        assert (await other.get("/api/v1/auth/me")).status_code == 401


async def test_a_code_from_the_enrolment_step_cannot_be_reused_right_after(clock):
    async with new_client() as client:
        secret, _ = await enrol(client, clock)
        used = totp.code_at(secret, totp.step_at(clock.now))
    async with new_client() as client:
        login = (await sign_in(client)).json()
        r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "code": used})
        assert r.status_code == 400


async def test_a_challenge_ends_after_too_many_wrong_codes_even_if_the_next_one_is_right(clock):
    async with new_client() as client:
        secret, _ = await enrol(client, clock)
    clock.advance(30)
    async with new_client() as client:
        login = (await sign_in(client)).json()
        sid = login["otp_session_id"]
        for _ in range(settings.two_factor_max_attempts):
            r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": sid, "code": "000000"})
            assert r.status_code == 400
        good = totp.code_at(secret, totp.step_at(clock.now))
        r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": sid, "code": good})
        assert r.status_code == 400
        assert (await client.get("/api/v1/auth/me")).status_code == 401
        # A new sign-in (password again) works.
        again = (await sign_in(client)).json()
        r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": again["otp_session_id"], "code": good})
        assert r.status_code == 200
    assert "TWO_FACTOR_LOCKED_OUT" in await actions()


async def test_an_expired_challenge_is_refused(clock):
    async with new_client() as client:
        secret, _ = await enrol(client, clock)
    clock.advance(30)
    async with new_client() as client:
        login = (await sign_in(client)).json()
        async with AsyncSessionLocal() as db:
            session = (await db.execute(select(OtpSession).where(OtpSession.id == login["otp_session_id"]))).scalar_one()
            from datetime import datetime, timedelta, timezone

            session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await db.commit()
        code = totp.code_at(secret, totp.step_at(clock.now))
        r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "code": code})
        assert r.status_code == 400 and "expired" in r.json()["detail"]


async def test_the_two_kinds_of_challenge_are_not_interchangeable(clock):
    async with new_client() as client:
        login = (await sign_in(client)).json()
        assert login["two_factor"] == "setup"
        # A first-sign-in challenge cannot be used to skip setup by sending any code.
        r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "code": "123456"})
        assert r.status_code == 400
        secret, _ = await enrol(client, clock)
    clock.advance(30)
    async with new_client() as client:
        verify_challenge = (await sign_in(client)).json()
        # And a "verify" challenge cannot be used to start setup again.
        r = await client.post("/api/v1/auth/2fa/setup", json={"otp_session_id": verify_challenge["otp_session_id"]})
        assert r.status_code == 400


async def test_a_recovery_code_signs_in_once(clock):
    async with new_client() as client:
        _, codes = await enrol(client, clock)
    async with new_client() as client:
        login = (await sign_in(client)).json()
        r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "recovery_code": codes[0].lower()})
        assert r.status_code == 200
        status = (await client.get("/api/v1/auth/2fa")).json()
        assert status == {**status, "enabled": True, "recovery_codes_left": 9}
    async with new_client() as client:
        login = (await sign_in(client)).json()
        r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "recovery_code": codes[0]})
        assert r.status_code == 400
        r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "recovery_code": codes[1]})
        assert r.status_code == 200
    assert "TWO_FACTOR_RECOVERY_USED" in await actions()


async def test_the_request_must_carry_exactly_one_kind_of_code(clock):
    async with new_client() as client:
        login = (await sign_in(client)).json()
        sid = login["otp_session_id"]
        assert (await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": sid})).status_code == 422
        both = {"otp_session_id": sid, "code": "123456", "recovery_code": "AAAAA-BBBBB-CCCCC"}
        assert (await client.post("/api/v1/auth/verify-otp", json=both)).status_code == 422


async def test_new_recovery_codes_need_a_current_code_and_replace_the_old_ones(clock):
    async with new_client() as client:
        secret, old_codes = await enrol(client, clock)
    clock.advance(30)
    async with new_client() as client:
        login = (await sign_in(client)).json()
        code = totp.code_at(secret, totp.step_at(clock.now))
        await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "code": code})
        clock.advance(30)
        csrf = {"x-csrf-token": client.cookies.get(settings.csrf_cookie_name)}
        # A signed-in POST without the CSRF header is refused before anything else.
        assert (await client.post("/api/v1/auth/2fa/recovery-codes", json={"code": "000000"})).status_code == 403
        assert (await client.post("/api/v1/auth/2fa/recovery-codes", json={"code": "000000"}, headers=csrf)).status_code == 400
        fresh = (
            await client.post(
                "/api/v1/auth/2fa/recovery-codes",
                json={"code": totp.code_at(secret, totp.step_at(clock.now))},
                headers=csrf,
            )
        ).json()
        assert len(fresh["recovery_codes"]) == 10 and not set(fresh["recovery_codes"]) & set(old_codes)
    async with new_client() as client:
        login = (await sign_in(client)).json()
        r = await client.post("/api/v1/auth/verify-otp", json={"otp_session_id": login["otp_session_id"], "recovery_code": old_codes[0]})
        assert r.status_code == 400
    assert "TWO_FACTOR_RECOVERY_CODES_REPLACED" in await actions()


async def test_a_wrong_password_never_reaches_the_code_step(clock):
    async with new_client() as client:
        r = await sign_in(client, password="wrong-password")
        assert r.status_code == 401 and r.json()["detail"] == "Invalid email or password"


async def test_an_administrator_can_reset_a_lost_phone_and_the_person_sets_up_again(clock):
    # The admin enrols and signs in; a second staff member is created and enrols too.
    async with new_client() as admin:
        await enrol(admin, clock)
        roles = (await admin.get("/api/v1/access/roles")).json()
        viewer = next(r for r in roles if r["name"] == "Viewer")
        created = await admin.post(
            "/api/v1/auth/staff",
            json={"email": "ada@novabank.ng", "password": "Passw0rd!x", "full_name": "Ada", "role_id": viewer["id"]},
            headers={"x-csrf-token": admin.cookies.get(settings.csrf_cookie_name)},
        )
        assert created.status_code == 200, created.text
        ada_id = created.json()["id"]
        assert created.json()["two_factor_enabled"] is False

        async with new_client() as ada:
            await enrol(ada, clock, "ada@novabank.ng", "Passw0rd!x")
        assert (await user("ada@novabank.ng")).totp_enabled

        csrf = {"x-csrf-token": admin.cookies.get(settings.csrf_cookie_name)}
        # Not your own.
        own = await admin.post(f"/api/v1/auth/staff/{(await user()).id}/two-factor-reset", headers=csrf)
        assert own.status_code == 400
        reset = await admin.post(f"/api/v1/auth/staff/{ada_id}/two-factor-reset", headers=csrf)
        assert reset.status_code == 200 and reset.json()["two_factor_enabled"] is False

    stored = await user("ada@novabank.ng")
    assert not stored.totp_enabled and stored.totp_secret is None and stored.recovery_code_hashes == []
    async with new_client() as ada:
        assert (await sign_in(ada, "ada@novabank.ng", "Passw0rd!x")).json()["two_factor"] == "setup"
    assert "TWO_FACTOR_RESET" in await actions()


async def test_only_someone_who_manages_the_team_can_reset(clock):
    async with new_client() as admin:
        await enrol(admin, clock)
        roles = (await admin.get("/api/v1/access/roles")).json()
        viewer = next(r for r in roles if r["name"] == "Viewer")
        csrf = {"x-csrf-token": admin.cookies.get(settings.csrf_cookie_name)}
        for email in ("ada@novabank.ng", "bayo@novabank.ng"):
            r = await admin.post(
                "/api/v1/auth/staff",
                json={"email": email, "password": "Passw0rd!x", "full_name": email, "role_id": viewer["id"]},
                headers=csrf,
            )
            assert r.status_code == 200
        bayo_id = (await user("bayo@novabank.ng")).id
    async with new_client() as ada:
        await enrol(ada, clock, "ada@novabank.ng", "Passw0rd!x")
        r = await ada.post(
            f"/api/v1/auth/staff/{bayo_id}/two-factor-reset", headers={"x-csrf-token": ada.cookies.get(settings.csrf_cookie_name)}
        )
        assert r.status_code == 403


async def test_a_key_that_cannot_be_read_asks_for_a_reset_instead_of_failing(clock, monkeypatch):
    async with new_client() as client:
        secret, _ = await enrol(client, clock)
    clock.advance(30)
    monkeypatch.setattr(settings, "two_factor_key", "ab" * 32)  # the key was changed after people enrolled
    async with new_client() as client:
        login = (await sign_in(client)).json()
        r = await client.post(
            "/api/v1/auth/verify-otp",
            json={"otp_session_id": login["otp_session_id"], "code": totp.code_at(secret, totp.step_at(clock.now))},
        )
        assert r.status_code == 400 and "administrator" in r.json()["detail"]
