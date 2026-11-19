from sqlalchemy import inspect, select, text, update

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.core.security import hash_password
from app.core.permissions import SYSTEM_ROLE_DEFAULTS
from app.models.entities import Role, User, UserRole


async def ensure_schema() -> None:
    async with engine.begin() as conn:
        def migrate(sync_conn):
            inspector = inspect(sync_conn)
            if inspector.has_table("users"):
                columns = {col["name"] for col in inspector.get_columns("users")}
                if "password_hash" not in columns:
                    sync_conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"))

        await conn.run_sync(migrate)


async def ensure_system_roles() -> None:
    """Create the built-in roles if missing, and give every user without a role the one matching their old
    fixed role. Never overwrites a role an administrator has edited."""
    async with AsyncSessionLocal() as db:
        existing = {r.system_key: r for r in (await db.execute(select(Role).where(Role.system_key.is_not(None)))).scalars()}
        taken_names = {name for (name,) in (await db.execute(select(Role.name))).all()}
        for key, spec in SYSTEM_ROLE_DEFAULTS.items():
            if key in existing:
                continue
            name = spec["name"]
            if name in taken_names:  # an admin already made a custom role with this name
                name = f"{name} (built-in)"
            role = Role(
                name=name,
                description=spec["description"],
                permissions=list(spec["permissions"]),
                system_key=key,
                all_permissions=spec["all_permissions"],
            )
            db.add(role)
            existing[key] = role
        await db.flush()

        unassigned = (await db.execute(select(User).where(User.role_id.is_(None)))).scalars().all()
        for user in unassigned:
            legacy = user.role.value if user.role else "viewer"
            user.role_id = existing.get(legacy, existing["viewer"]).id
        await db.commit()


async def seed_database() -> None:
    await ensure_schema()
    await _seed_users()
    await ensure_system_roles()


async def _seed_users() -> None:

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == settings.admin_email))
        admin = result.scalar_one_or_none()

        if not admin:
            db.add(
                User(
                    email=settings.admin_email,
                    full_name="Amaka Okafor",
                    role=UserRole.ADMIN,
                    password_hash=hash_password(settings.admin_password),
                    is_active=True,
                )
            )
            db.add_all(
                [
                    User(
                        email="approver@novabank.ng",
                        full_name="Tunde Bakare",
                        role=UserRole.APPROVER,
                        password_hash=hash_password("Approver@Nova2026"),
                    ),
                    User(
                        email="analyst@novabank.ng",
                        full_name="Ngozi Eze",
                        role=UserRole.ANALYST,
                        password_hash=hash_password("Analyst@Nova2026"),
                    ),
                    User(
                        email="viewer@novabank.ng",
                        full_name="David Okoro",
                        role=UserRole.VIEWER,
                        password_hash=hash_password("Viewer@Nova2026"),
                    ),
                ]
            )
            await db.commit()
            print(f"\nSeeded admin login -> {settings.admin_email} / {settings.admin_password}\n")
            return

        if not admin.password_hash:
            await db.execute(
                update(User)
                .where(User.email == settings.admin_email)
                .values(password_hash=hash_password(settings.admin_password))
            )
            await db.commit()
            print(f"\nUpdated admin password -> {settings.admin_email} / {settings.admin_password}\n")
