from dataclasses import dataclass
from datetime import datetime, timezone

import pytest

from app.api.deps import get_prediction_repository


@dataclass
class FakePrediction:
    id: int
    municipality_id: int
    target_year: int
    model_name: str
    model_version: str
    model_run_id: str
    predicted_population: int | None
    predicted_birth_rate: float | None
    predicted_death_rate: float | None
    predicted_natural_increase_rate: float | None
    predicted_migration: int | None
    confidence: dict
    extra_metadata: dict
    history_from_year: int | None
    history_to_year: int | None
    generated_at: datetime


class FakePredictionRepo:
    async def create_prediction(self, payload):
        return FakePrediction(
            id=1,
            municipality_id=payload.municipality_id,
            target_year=payload.target_year,
            model_name=payload.model_name,
            model_version=payload.model_version,
            model_run_id=payload.model_run_id,
            predicted_population=payload.predicted_population,
            predicted_birth_rate=payload.predicted_birth_rate,
            predicted_death_rate=payload.predicted_death_rate,
            predicted_natural_increase_rate=payload.predicted_natural_increase_rate,
            predicted_migration=payload.predicted_migration,
            confidence=payload.confidence,
            extra_metadata=payload.extra_metadata,
            history_from_year=payload.history_from_year,
            history_to_year=payload.history_to_year,
            generated_at=datetime.now(timezone.utc),
        )

    async def list_predictions(self, **kwargs):
        return [
            FakePrediction(
                id=1,
                municipality_id=1,
                target_year=2028,
                model_name='linreg',
                model_version='1.0',
                model_run_id='run-1',
                predicted_population=120000,
                predicted_birth_rate=10.2,
                predicted_death_rate=11.8,
                predicted_natural_increase_rate=-1.6,
                predicted_migration=200,
                confidence={},
                extra_metadata={},
                history_from_year=2019,
                history_to_year=2023,
                generated_at=datetime.now(timezone.utc),
            ),
        ], 1


@pytest.mark.asyncio
async def test_create_prediction(client, app) -> None:
    app.dependency_overrides[get_prediction_repository] = lambda: FakePredictionRepo()

    response = await client.post(
        '/api/v1/predictions',
        json={
            'municipality_id': 1,
            'target_year': 2028,
            'model_name': 'linreg',
            'model_version': '1.0',
            'model_run_id': 'run-1',
            'predicted_population': 120000,
            'predicted_birth_rate': 10.2,
            'predicted_death_rate': 11.8,
            'predicted_natural_increase_rate': -1.6,
            'predicted_migration': 200,
            'confidence': {},
            'metadata': {},
            'history_from_year': 2019,
            'history_to_year': 2023,
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()['model_run_id'] == 'run-1'


@pytest.mark.asyncio
async def test_list_predictions(client, app) -> None:
    app.dependency_overrides[get_prediction_repository] = lambda: FakePredictionRepo()

    response = await client.get('/api/v1/predictions?municipality_id=1')
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()['total'] == 1
