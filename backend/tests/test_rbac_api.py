"""Role-based access control end to end, through the real API and a real PostgreSQL database.

Runs only when NOVA_TEST_DATABASE_URL points at a scratch database (see tests/conftest.py); it drops and
recreates every table there:
  NOVA_TEST_DATABASE_URL=postgresql://nova:nova_dev@localhost:5432/nova_test PYTHONPATH=. pytest tests/test_rbac_api.py
"""

import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("NOVA_TEST_DATABASE_URL"), reason="set NOVA_TEST_DATABASE_URL to a scratch PostgreSQL database"
)

if os.environ.get("NOVA_TEST_DATABASE_URL"):
    import httpx
    from sqlalchemy import select, text, update

    from app.core.config import settings
    from app.core.database import AsyncSessionLocal, Base, engine
    from app.core.security import create_access_token
    from app.db.migrate import run_migrations
    from app.main import app
    from app.models.entities import AuditEvent, Role, User
    from app.seed.bootstrap import seed_database


async def _reset_database():
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.run_sync(Base.metadata.create_all)
    run_migrations()
    await seed_database()


async def _user(email: str) -> "User":
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(User).where(User.email == email))).unique().scalar_one()


async def _role_id(name: str) -> str:
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Role.id).where(Role.name == name))).scalar_one()


class Session:
    """A signed-in staff member: the same cookies and CSRF header the portal sends."""

    def __init__(self, user: "User"):
        csrf = f"csrf-{user.id}"
        token = create_access_token(user.id, user.email, user.role.value, csrf)
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://portal.test",
            cookies={settings.session_cookie_name: token},
            headers={"x-csrf-token": csrf},
        )

    async def get(self, path):
        return await self.client.get(path)

    async def post(self, path, json=None):
        return await self.client.post(path, json=json)

    async def patch(self, path, json=None):
        return await self.client.patch(path, json=json)

    async def delete(self, path):
        return await self.client.delete(path)


async def as_(email: str) -> Session:
    return Session(await _user(email))


@pytest.fixture(autouse=True)
async def fresh_db():
    # Each test runs in its own event loop; pooled connections from the previous one cannot be reused.
    await engine.dispose()
    await _reset_database()
    yield
    await engine.dispose()


async def test_builtin_roles_and_existing_users_are_mapped():
    admin = await as_("admin@novabank.ng")
    roles = {r["name"]: r for r in (await admin.get("/api/v1/access/roles")).json()}
    assert set(roles) == {"Admin", "Approver", "Analyst", "Viewer"}
    assert roles["Admin"]["all_permissions"] and roles["Viewer"]["user_count"] == 1
    me = (await (await as_("analyst@novabank.ng")).get("/api/v1/auth/me")).json()
    assert me["role_name"] == "Analyst" and "extraction.run" in me["permissions"] and "team.manage" not in me["permissions"]


async def test_builtin_roles_behave_as_before():
    viewer = await as_("viewer@novabank.ng")
    assert (await viewer.get("/api/v1/dashboard")).status_code == 200
    assert (await viewer.get("/api/v1/audit")).status_code == 200
    assert (await viewer.post("/api/v1/dtd/start")).status_code == 403
    assert (await viewer.get("/api/v1/integration/keys")).status_code == 403
    analyst = await as_("analyst@novabank.ng")
    assert (await analyst.post("/api/v1/screening/alerts/x/escalate", {})).status_code == 403
    assert (await analyst.get("/api/v1/users")).status_code == 403
    admin = await as_("admin@novabank.ng")
    assert (await admin.get("/api/v1/users")).status_code == 200
    assert (await admin.get("/api/v1/integration/keys")).status_code == 200


async def test_custom_role_with_per_staff_changes_and_immediate_effect():
    admin = await as_("admin@novabank.ng")
    r = await admin.post("/api/v1/access/roles", {"name": "Auditor", "description": "Internal audit", "permissions": ["audit.view", "transactions.view"]})
    assert r.status_code == 201, r.text
    auditor_role = r.json()["id"]

    r = await admin.post("/api/v1/auth/staff", {
        "email": "ife@novabank.ng", "password": "Strong@Pass1", "full_name": "Ife Ade", "role_id": auditor_role,
        "extra_permissions": ["quality.view"], "revoked_permissions": ["transactions.view"],
    })
    assert r.status_code == 200, r.text
    assert r.json()["permissions"] == ["quality.view", "audit.view"]
    assert r.json()["role_name"] == "Auditor"

    ife = await as_("ife@novabank.ng")
    assert (await ife.get("/api/v1/audit")).status_code == 200
    assert (await ife.get("/api/v1/analytics/quality")).status_code == 200
    assert (await ife.get("/api/v1/staging/transactions")).status_code == 200  # quality.view needs it for the spot-check
    assert (await ife.get("/api/v1/dashboard")).status_code == 403
    assert (await ife.get("/api/v1/reports")).status_code == 403  # transactions.view was removed for her
    assert (await ife.post("/api/v1/etl/run", {})).status_code == 403

    # take audit away: it applies to her existing session at once
    staff_id = r.json()["id"]
    r = await admin.patch(f"/api/v1/auth/staff/{staff_id}", {"revoked_permissions": ["transactions.view", "audit.view"]})
    assert r.status_code == 200 and "audit.view" not in r.json()["permissions"]
    assert (await ife.get("/api/v1/audit")).status_code == 403

    # changing the role's permissions changes everyone on it
    r = await admin.patch(f"/api/v1/access/roles/{auditor_role}", {"permissions": ["audit.view", "transactions.view", "dashboard.view"]})
    assert r.status_code == 200
    assert (await ife.get("/api/v1/dashboard")).status_code == 200


async def test_bad_input_is_refused():
    admin = await as_("admin@novabank.ng")
    viewer_role = await _role_id("Viewer")
    r = await admin.post("/api/v1/access/roles", {"name": "X", "permissions": ["audit.view", "root.everything"]})
    assert r.status_code == 400 and "root.everything" in r.text
    assert (await admin.post("/api/v1/access/roles", {"name": " viewer ", "permissions": []})).status_code == 400  # name taken
    r = await admin.post("/api/v1/auth/staff", {"email": "a@novabank.ng", "password": "Strong@Pass1", "full_name": "A", "role_id": viewer_role, "extra_permissions": ["nope"]})
    assert r.status_code == 400
    r = await admin.post("/api/v1/auth/staff", {"email": "b@novabank.ng", "password": "Strong@Pass1", "full_name": "B", "role_id": "00000000-0000-0000-0000-000000000000"})
    assert r.status_code == 400


async def test_builtin_roles_are_protected():
    admin = await as_("admin@novabank.ng")
    admin_role, viewer_role = await _role_id("Admin"), await _role_id("Viewer")
    assert (await admin.patch(f"/api/v1/access/roles/{admin_role}", {"permissions": ["audit.view"]})).status_code == 409
    assert (await admin.patch(f"/api/v1/access/roles/{admin_role}", {"name": "Boss"})).status_code == 409
    assert (await admin.delete(f"/api/v1/access/roles/{viewer_role}")).status_code == 409
    # a built-in role other than Admin can be adjusted
    r = await admin.patch(f"/api/v1/access/roles/{viewer_role}", {"permissions": ["dashboard.view"]})
    assert r.status_code == 200 and r.json()["permissions"] == ["dashboard.view"]


async def test_a_role_in_use_cannot_be_deleted():
    admin = await as_("admin@novabank.ng")
    role = (await admin.post("/api/v1/access/roles", {"name": "Temp", "permissions": ["audit.view"]})).json()
    staff = (await admin.post("/api/v1/auth/staff", {"email": "t@novabank.ng", "password": "Strong@Pass1", "full_name": "T", "role_id": role["id"]})).json()
    r = await admin.delete(f"/api/v1/access/roles/{role['id']}")
    assert r.status_code == 409 and "1 staff" in r.text
    await admin.patch(f"/api/v1/auth/staff/{staff['id']}", {"role_id": await _role_id("Viewer")})
    assert (await admin.delete(f"/api/v1/access/roles/{role['id']}")).status_code == 204


async def test_no_escalation_by_a_delegated_team_manager():
    admin = await as_("admin@novabank.ng")
    lead_role = (await admin.post("/api/v1/access/roles", {"name": "Team lead", "permissions": ["team.view", "team.manage", "audit.view"]})).json()
    junior_role = (await admin.post("/api/v1/access/roles", {"name": "Junior", "permissions": ["audit.view"]})).json()
    await admin.post("/api/v1/auth/staff", {"email": "lead@novabank.ng", "password": "Strong@Pass1", "full_name": "Lead", "role_id": lead_role["id"]})
    lead = await as_("lead@novabank.ng")

    # can invite with access they hold
    r = await lead.post("/api/v1/auth/staff", {"email": "j@novabank.ng", "password": "Strong@Pass1", "full_name": "J", "role_id": junior_role["id"]})
    assert r.status_code == 200, r.text
    junior_id = r.json()["id"]
    # cannot hand out Admin, or a single permission they lack, or give it to themselves
    r = await lead.post("/api/v1/auth/staff", {"email": "x@novabank.ng", "password": "Strong@Pass1", "full_name": "X", "role_id": await _role_id("Admin")})
    assert r.status_code == 403
    assert (await lead.patch(f"/api/v1/auth/staff/{junior_id}", {"extra_permissions": ["apikeys.manage"]})).status_code == 403
    lead_id = (await _user("lead@novabank.ng")).id
    assert (await lead.patch(f"/api/v1/auth/staff/{lead_id}", {"extra_permissions": ["roles.manage"]})).status_code == 400
    # cannot touch someone with more access, and cannot manage roles at all
    admin_id = (await _user("admin@novabank.ng")).id
    assert (await lead.patch(f"/api/v1/auth/staff/{admin_id}", {"is_active": False})).status_code == 403
    assert (await lead.delete(f"/api/v1/auth/staff/{admin_id}")).status_code == 403
    assert (await lead.post("/api/v1/access/roles", {"name": "Mine", "permissions": []})).status_code == 403


async def test_nobody_can_lock_everyone_out():
    admin = await as_("admin@novabank.ng")
    admin_id = (await _user("admin@novabank.ng")).id
    # the only access administrator cannot remove or downgrade themselves
    assert (await admin.patch(f"/api/v1/auth/staff/{admin_id}", {"role_id": await _role_id("Viewer")})).status_code == 400
    assert (await admin.delete(f"/api/v1/auth/staff/{admin_id}")).status_code == 400

    # when the last access administrator holds it through a custom role, that role cannot lose it
    access = (await admin.post("/api/v1/access/roles", {"name": "Access", "permissions": ["team.view", "team.manage", "roles.manage"]})).json()
    await admin.post("/api/v1/auth/staff", {"email": "c@novabank.ng", "password": "Strong@Pass1", "full_name": "C", "role_id": access["id"]})
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).where(User.id == admin_id).values(is_active=False))
        await db.commit()
    c = await as_("c@novabank.ng")
    r = await c.patch(f"/api/v1/access/roles/{access['id']}", {"permissions": ["team.view", "team.manage"]})
    assert r.status_code == 409 and "nobody able to manage" in r.text
    roles = {x["name"]: x for x in (await c.get("/api/v1/access/roles")).json()}
    assert roles["Access"]["permissions"] == ["team.view", "team.manage", "roles.manage"]  # unchanged


async def test_changes_are_audited():
    admin = await as_("admin@novabank.ng")
    role = (await admin.post("/api/v1/access/roles", {"name": "Audited", "permissions": ["audit.view"]})).json()
    staff = (await admin.post("/api/v1/auth/staff", {"email": "z@novabank.ng", "password": "Strong@Pass1", "full_name": "Z", "role_id": role["id"]})).json()
    await admin.patch(f"/api/v1/auth/staff/{staff['id']}", {"extra_permissions": ["dashboard.view"]})
    async with AsyncSessionLocal() as db:
        events = (await db.execute(select(AuditEvent).order_by(AuditEvent.created_at))).scalars().all()
    actions = [e.action for e in events]
    assert {"ROLE_CREATED", "STAFF_CREATED", "STAFF_PERMISSIONS_UPDATED"} <= set(actions)
    perm_event = next(e for e in events if e.action == "STAFF_PERMISSIONS_UPDATED")
    assert perm_event.details["before"]["extra_permissions"] == [] and perm_event.details["after"]["extra_permissions"] == ["dashboard.view"]
