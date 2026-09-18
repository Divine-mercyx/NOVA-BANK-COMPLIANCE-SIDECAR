"""Allow null DTD institution when Finacle BANK_CODE is blank."""

from alembic import op
import sqlalchemy as sa

revision = "007_dtd_institution_nullable"
down_revision = "006_dtd_institution"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("dtd_transactions"):
        return
    cols = {c["name"] for c in inspector.get_columns("dtd_transactions")}
    for name, length in (
        ("source_institution_code", 20),
        ("source_institution_name", 255),
        ("dest_institution_code", 20),
        ("dest_institution_name", 255),
    ):
        if name not in cols:
            continue
        op.alter_column(
            "dtd_transactions",
            name,
            existing_type=sa.String(length=length),
            nullable=True,
            server_default=None,
        )


def downgrade() -> None:
    pass
