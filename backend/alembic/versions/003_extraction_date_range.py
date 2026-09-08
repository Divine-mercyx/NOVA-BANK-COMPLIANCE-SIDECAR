"""Add date range columns to extraction_runs."""

from alembic import op
import sqlalchemy as sa

revision = "003_extraction_date_range"
down_revision = "002_reportable_str"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("extraction_runs"):
        return
    columns = {col["name"] for col in inspector.get_columns("extraction_runs")}
    if "date_from" not in columns:
        op.add_column("extraction_runs", sa.Column("date_from", sa.DateTime(timezone=True), nullable=True))
    if "date_to" not in columns:
        op.add_column("extraction_runs", sa.Column("date_to", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("extraction_runs", "date_to")
    op.drop_column("extraction_runs", "date_from")
