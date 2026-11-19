"""Role-based access control: roles table, users.role_id and per-staff permission lists.

Fresh installs get these from create_all at startup; this brings existing databases up to date. System roles
and each user's role_id are filled in by the startup seed (app/seed/bootstrap.py), from the old fixed role.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "009_rbac"
down_revision = "008_staging_institution"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("roles"):
        op.create_table(
            "roles",
            sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
            sa.Column("name", sa.String(80), nullable=False, unique=True),
            sa.Column("description", sa.String(255), nullable=True),
            sa.Column("permissions", postgresql.JSONB(), nullable=False, server_default="[]"),
            sa.Column("system_key", sa.String(20), nullable=True, unique=True),
            sa.Column("all_permissions", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not inspector.has_table("users"):
        return
    cols = {c["name"] for c in inspector.get_columns("users")}
    if "role_id" not in cols:
        op.add_column("users", sa.Column("role_id", postgresql.UUID(as_uuid=False), nullable=True))
        op.create_foreign_key("fk_users_role_id_roles", "users", "roles", ["role_id"], ["id"])
        op.create_index("ix_users_role_id", "users", ["role_id"])
    if "extra_permissions" not in cols:
        op.add_column("users", sa.Column("extra_permissions", postgresql.JSONB(), nullable=False, server_default="[]"))
    if "revoked_permissions" not in cols:
        op.add_column("users", sa.Column("revoked_permissions", postgresql.JSONB(), nullable=False, server_default="[]"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("users"):
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "role_id" in cols:
            op.drop_constraint("fk_users_role_id_roles", "users", type_="foreignkey")
            op.drop_index("ix_users_role_id", table_name="users")
            op.drop_column("users", "role_id")
        for name in ("extra_permissions", "revoked_permissions"):
            if name in cols:
                op.drop_column("users", name)
    if inspector.has_table("roles"):
        op.drop_table("roles")
