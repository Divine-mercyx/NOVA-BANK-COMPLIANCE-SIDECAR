from sqlalchemy import inspect, select, text, update

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.core.security import hash_password
from app.models.entities import User, UserRole


async def ensure_schema() -> None:
    async with engine.begin() as conn:
        def migrate(sync_conn):
            inspector = inspect(sync_conn)
            if inspector.has_table("users"):
                columns = {col["name"] for col in inspector.get_columns("users")}
                if "password_hash" not in columns:
                    sync_conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"))

        await conn.run_sync(migrate)


async def seed_database() -> None:
    await ensure_schema()

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
