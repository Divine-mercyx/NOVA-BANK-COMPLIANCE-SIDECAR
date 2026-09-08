"""Add reportable_str column to staging_transactions."""

from alembic import op
import sqlalchemy as sa

revision = "002_reportable_str"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("staging_transactions"):
        return
    columns = {col["name"] for col in inspector.get_columns("staging_transactions")}
    if "reportable_str" not in columns:
        op.add_column(
            "staging_transactions",
            sa.Column("reportable_str", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    op.drop_column("staging_transactions", "reportable_str")
