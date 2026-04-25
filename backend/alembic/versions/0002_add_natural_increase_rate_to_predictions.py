"""add natural increase rate to predictions

Revision ID: 0002_add_natural_increase_rate_to_predictions
Revises: 0001_initial_schema
Create Date: 2026-04-25 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0002_add_natural_increase_rate_to_predictions'
down_revision: str | None = '0001_initial_schema'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'municipality_predictions',
        sa.Column('predicted_natural_increase_rate', sa.Numeric(precision=8, scale=4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('municipality_predictions', 'predicted_natural_increase_rate')
