"""Add reportable_str column to staging_transactions."""

from alembic import op
import sqlalchemy as sa

revision = "002_reportable_str"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE staging_transactions
        ADD COLUMN IF NOT EXISTS reportable_str BOOLEAN NOT NULL DEFAULT false
        """
    )


def downgrade() -> None:
    op.drop_column("staging_transactions", "reportable_str")
