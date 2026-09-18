"""DTD staging tables, separate from HTD staging_transactions."""

from alembic import op
import sqlalchemy as sa

revision = "004_dtd_transactions"
down_revision = "003_extraction_date_range"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("dtd_pull_runs"):
        op.create_table(
            "dtd_pull_runs",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="running"),
            sa.Column("business_date", sa.DateTime(timezone=True), nullable=False),
            sa.Column("records_new", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("records_skipped", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_summary", sa.Text(), nullable=True),
        )
    if not inspector.has_table("dtd_transactions"):
        op.create_table(
            "dtd_transactions",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("pull_run_id", sa.String(length=36), nullable=True),
            sa.Column("business_date", sa.DateTime(timezone=True), nullable=False),
            sa.Column("finacle_ref", sa.String(length=100), nullable=False),
            sa.Column("channel", sa.String(length=32), nullable=False),
            sa.Column("transaction_date", sa.DateTime(timezone=True), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="NGN"),
            sa.Column("sender_name", sa.String(length=255), nullable=False),
            sa.Column("sender_account", sa.String(length=50), nullable=False),
            sa.Column("receiver_name", sa.String(length=255), nullable=False),
            sa.Column("receiver_account", sa.String(length=50), nullable=False),
            sa.Column("branch_code", sa.String(length=20), nullable=False, server_default="001"),
            sa.Column("narration", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["pull_run_id"], ["dtd_pull_runs.id"]),
            sa.UniqueConstraint("business_date", "finacle_ref", name="uq_dtd_day_ref"),
        )
        op.create_index("ix_dtd_transactions_pull_run_id", "dtd_transactions", ["pull_run_id"])
        op.create_index("ix_dtd_transactions_business_date", "dtd_transactions", ["business_date"])
        op.create_index("ix_dtd_transactions_finacle_ref", "dtd_transactions", ["finacle_ref"])


def downgrade() -> None:
    op.drop_table("dtd_transactions")
    op.drop_table("dtd_pull_runs")
