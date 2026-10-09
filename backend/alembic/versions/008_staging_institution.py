"""Institution codes on HTD staging_transactions (NIP flow enrichment)."""

from alembic import op
import sqlalchemy as sa

revision = "008_staging_institution"
down_revision = "007_dtd_institution_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("staging_transactions"):
        return
    cols = {c["name"] for c in inspector.get_columns("staging_transactions")}
    for name, length in (
        ("source_institution_code", 20),
        ("source_institution_name", 255),
        ("dest_institution_code", 20),
        ("dest_institution_name", 255),
    ):
        if name in cols:
            continue
        op.add_column(
            "staging_transactions",
            sa.Column(name, sa.String(length=length), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("staging_transactions"):
        return
    cols = {c["name"] for c in inspector.get_columns("staging_transactions")}
    for name in (
        "dest_institution_name",
        "dest_institution_code",
        "source_institution_name",
        "source_institution_code",
    ):
        if name in cols:
            op.drop_column("staging_transactions", name)
