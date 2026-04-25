"""initial schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-04-24 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'municipalities',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('region', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=64), nullable=False),
        sa.Column('area', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_municipalities_region', 'municipalities', ['region'], unique=False)
    op.create_index('idx_municipalities_type', 'municipalities', ['type'], unique=False)

    op.create_table(
        'municipality_data',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('municipality_id', sa.BigInteger(), nullable=False),
        sa.Column('year', sa.SmallInteger(), nullable=False),
        sa.Column('population', sa.Integer(), nullable=True),
        sa.Column('birth_rate', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('death_rate', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('migration', sa.Integer(), nullable=True),
        sa.CheckConstraint('year >= 1900', name='ck_municipality_data_year_min'),
        sa.ForeignKeyConstraint(['municipality_id'], ['municipalities.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('municipality_id', 'year', name='uq_municipality_data_unique_year'),
    )
    op.create_index('idx_municipality_data_municipality_id', 'municipality_data', ['municipality_id'], unique=False)
    op.create_index('idx_municipality_data_year', 'municipality_data', ['year'], unique=False)

    op.create_table(
        'municipality_predictions',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('municipality_id', sa.BigInteger(), nullable=False),
        sa.Column('target_year', sa.SmallInteger(), nullable=False),
        sa.Column('model_name', sa.String(length=100), nullable=False),
        sa.Column('model_version', sa.String(length=50), nullable=False),
        sa.Column('model_run_id', sa.String(length=64), nullable=False),
        sa.Column('predicted_population', sa.Integer(), nullable=True),
        sa.Column('predicted_birth_rate', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('predicted_death_rate', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('predicted_migration', sa.Integer(), nullable=True),
        sa.Column('confidence', sa.JSON(), nullable=False),
        sa.Column('metadata', sa.JSON(), nullable=False),
        sa.Column('history_from_year', sa.SmallInteger(), nullable=True),
        sa.Column('history_to_year', sa.SmallInteger(), nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('target_year >= 1900', name='ck_predictions_target_year_min'),
        sa.ForeignKeyConstraint(['municipality_id'], ['municipalities.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('model_run_id', 'municipality_id', 'target_year', name='uq_prediction_run'),
    )
    op.create_index('idx_predictions_municipality_year', 'municipality_predictions', ['municipality_id', 'target_year'], unique=False)
    op.create_index('idx_predictions_model', 'municipality_predictions', ['model_name', 'model_version'], unique=False)
    op.create_index('idx_predictions_generated_at', 'municipality_predictions', ['generated_at'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_predictions_generated_at', table_name='municipality_predictions')
    op.drop_index('idx_predictions_model', table_name='municipality_predictions')
    op.drop_index('idx_predictions_municipality_year', table_name='municipality_predictions')
    op.drop_table('municipality_predictions')

    op.drop_index('idx_municipality_data_year', table_name='municipality_data')
    op.drop_index('idx_municipality_data_municipality_id', table_name='municipality_data')
    op.drop_table('municipality_data')

    op.drop_index('idx_municipalities_type', table_name='municipalities')
    op.drop_index('idx_municipalities_region', table_name='municipalities')
    op.drop_table('municipalities')
