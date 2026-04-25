from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BIGINT,
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Municipality(Base):
    __tablename__ = 'municipalities'

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    region: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    area: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    data_records: Mapped[list['MunicipalityData']] = relationship(
        back_populates='municipality',
        cascade='all, delete-orphan',
    )
    predictions: Mapped[list['MunicipalityPrediction']] = relationship(
        back_populates='municipality',
        cascade='all, delete-orphan',
    )

    __table_args__ = (
        Index('idx_municipalities_region', 'region'),
        Index('idx_municipalities_type', 'type'),
    )


class MunicipalityData(Base):
    __tablename__ = 'municipality_data'

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    municipality_id: Mapped[int] = mapped_column(
        BIGINT,
        ForeignKey('municipalities.id', ondelete='CASCADE'),
        nullable=False,
    )
    year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    birth_rate: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    death_rate: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    migration: Mapped[int | None] = mapped_column(Integer, nullable=True)

    municipality: Mapped[Municipality] = relationship(back_populates='data_records')

    __table_args__ = (
        CheckConstraint('year >= 1900', name='ck_municipality_data_year_min'),
        UniqueConstraint('municipality_id', 'year', name='uq_municipality_data_unique_year'),
        Index('idx_municipality_data_municipality_id', 'municipality_id'),
        Index('idx_municipality_data_year', 'year'),
    )


class MunicipalityPrediction(Base):
    __tablename__ = 'municipality_predictions'

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    municipality_id: Mapped[int] = mapped_column(
        BIGINT,
        ForeignKey('municipalities.id', ondelete='CASCADE'),
        nullable=False,
    )
    target_year: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    model_run_id: Mapped[str] = mapped_column(String(64), nullable=False)

    predicted_population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    predicted_birth_rate: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    predicted_death_rate: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    predicted_natural_increase_rate: Mapped[float | None] = mapped_column(
        Numeric(8, 4),
        nullable=True,
    )
    predicted_migration: Mapped[int | None] = mapped_column(Integer, nullable=True)

    confidence: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    extra_metadata: Mapped[dict] = mapped_column(
        'metadata',
        JSON,
        nullable=False,
        default=dict,
    )

    history_from_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    history_to_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    municipality: Mapped[Municipality] = relationship(back_populates='predictions')

    __table_args__ = (
        CheckConstraint('target_year >= 1900', name='ck_predictions_target_year_min'),
        UniqueConstraint('model_run_id', 'municipality_id', 'target_year', name='uq_prediction_run'),
        Index('idx_predictions_municipality_year', 'municipality_id', 'target_year'),
        Index('idx_predictions_model', 'model_name', 'model_version'),
        Index('idx_predictions_generated_at', 'generated_at'),
    )
