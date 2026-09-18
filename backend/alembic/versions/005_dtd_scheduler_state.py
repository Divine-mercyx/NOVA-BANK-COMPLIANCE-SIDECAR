"""DTD scheduler state and pull-run telemetry."""

from alembic import op
import sqlalchemy as sa

revision = "005_dtd_scheduler_state"
down_revision = "004_dtd_transactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("dtd_pull_runs"):
        cols = {c["name"] for c in inspector.get_columns("dtd_pull_runs")}
        if "posted_since" not in cols:
            op.add_column("dtd_pull_runs", sa.Column("posted_since", sa.DateTime(timezone=True), nullable=True))
        if "legs_fetched" not in cols:
            op.add_column("dtd_pull_runs", sa.Column("legs_fetched", sa.Integer(), nullable=False, server_default="0"))
    if not inspector.has_table("dtd_scheduler_state"):
        op.create_table(
            "dtd_scheduler_state",
            sa.Column("id", sa.String(length=20), primary_key=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("interval_minutes", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("started_by", sa.String(length=255), nullable=True),
            sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("stopped_by", sa.String(length=255), nullable=True),
            sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("last_run_id", sa.String(length=36), nullable=True),
            sa.Column("watermark_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("watermark_day", sa.String(length=10), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("dtd_scheduler_state")
    op.drop_column("dtd_pull_runs", "legs_fetched")
    op.drop_column("dtd_pull_runs", "posted_since")
