"""Initial schema baseline."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Baseline: tables may already exist from create_all in earlier builds.
    # New installs get full schema; existing DBs rely on 002 for additive columns.
    pass


def downgrade() -> None:
    pass
