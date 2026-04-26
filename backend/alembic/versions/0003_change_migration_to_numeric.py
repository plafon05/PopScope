"""change municipality_data.migration to numeric

Revision ID: 0003_migration_numeric
Revises: 0002_add_nat_inc_rate
Create Date: 2026-04-26 16:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0003_migration_numeric'
down_revision: str | None = '0002_add_nat_inc_rate'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        'municipality_data',
        'migration',
        existing_type=sa.Integer(),
        type_=sa.Numeric(precision=10, scale=6),
        postgresql_using='migration::numeric',
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'municipality_data',
        'migration',
        existing_type=sa.Numeric(precision=10, scale=6),
        type_=sa.Integer(),
        postgresql_using='round(migration)::integer',
        existing_nullable=True,
    )
