"""Store source/dest institution on DTD warehouse rows."""

from alembic import op
import sqlalchemy as sa

revision = "006_dtd_institution"
down_revision = "005_dtd_scheduler_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("dtd_transactions"):
        return
    cols = {c["name"] for c in inspector.get_columns("dtd_transactions")}
    extras = [
        ("source_institution_code", sa.String(length=20), "60003"),
        ("source_institution_name", sa.String(length=255), "NOVA BANK"),
        ("dest_institution_code", sa.String(length=20), "60003"),
        ("dest_institution_name", sa.String(length=255), "NOVA BANK"),
    ]
    for name, col_type, default in extras:
        if name not in cols:
            op.add_column(
                "dtd_transactions",
                sa.Column(name, col_type, nullable=False, server_default=default),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("dtd_transactions"):
        return
    cols = {c["name"] for c in inspector.get_columns("dtd_transactions")}
    for name in (
        "dest_institution_name",
        "dest_institution_code",
        "source_institution_name",
        "source_institution_code",
    ):
        if name in cols:
            op.drop_column("dtd_transactions", name)
