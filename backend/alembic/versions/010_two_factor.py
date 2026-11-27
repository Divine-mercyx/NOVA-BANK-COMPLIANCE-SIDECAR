"""Two-factor sign-in with an authenticator app.

Users get sealed authenticator keys, a used-step counter and hashed recovery codes. The sign-in challenge table
(otp_sessions) stops storing a code (the code now comes from the person's phone) and counts wrong tries.
Fresh installs get these from create_all at startup; this brings existing databases up to date. Every step checks
before it changes anything, so it is safe to run twice.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "010_two_factor"
down_revision = "009_rbac"
branch_labels = None
depends_on = None


def _columns(inspector, table: str) -> set[str]:
    return {c["name"] for c in inspector.get_columns(table)} if inspector.has_table(table) else set()


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    users = _columns(inspector, "users")
    if users:
        if "totp_secret" not in users:
            op.add_column("users", sa.Column("totp_secret", sa.Text(), nullable=True))
        if "totp_pending_secret" not in users:
            op.add_column("users", sa.Column("totp_pending_secret", sa.Text(), nullable=True))
        if "totp_enabled" not in users:
            op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "totp_enabled_at" not in users:
            op.add_column("users", sa.Column("totp_enabled_at", sa.DateTime(timezone=True), nullable=True))
        if "totp_last_step" not in users:
            op.add_column("users", sa.Column("totp_last_step", sa.BigInteger(), nullable=True))
        if "recovery_code_hashes" not in users:
            op.add_column("users", sa.Column("recovery_code_hashes", postgresql.JSONB(), nullable=False, server_default="[]"))

    otp = _columns(inspector, "otp_sessions")
    if otp:
        if "purpose" not in otp:
            op.add_column("otp_sessions", sa.Column("purpose", sa.String(10), nullable=False, server_default="verify"))
        if "attempts" not in otp:
            op.add_column("otp_sessions", sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))
        op.alter_column("otp_sessions", "code", existing_type=sa.String(6), nullable=True)
        # Challenges issued before this change carried an emailed code that no longer exists: end them.
        op.execute("UPDATE otp_sessions SET used = true WHERE used = false")


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    otp = _columns(inspector, "otp_sessions")
    if otp:
        op.execute("UPDATE otp_sessions SET code = '000000' WHERE code IS NULL")
        op.alter_column("otp_sessions", "code", existing_type=sa.String(6), nullable=False)
        for name in ("attempts", "purpose"):
            if name in otp:
                op.drop_column("otp_sessions", name)
    users = _columns(inspector, "users")
    for name in ("recovery_code_hashes", "totp_last_step", "totp_enabled_at", "totp_enabled", "totp_pending_secret", "totp_secret"):
        if name in users:
            op.drop_column("users", name)
