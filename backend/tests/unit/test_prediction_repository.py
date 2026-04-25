from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.repositories.predictions import PredictionRepository
from app.schemas.prediction import MunicipalityPredictionCreate


class FakeExecuteResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows

    def scalar_one(self):
        return self._rows


@pytest.mark.asyncio
async def test_create_prediction_maps_metadata_to_extra_metadata() -> None:
    session = AsyncMock()
    session.add = Mock()

    async def refresh(entity):
        entity.id = 10
        entity.generated_at = datetime.now(timezone.utc)

    session.refresh = AsyncMock(side_effect=refresh)

    repo = PredictionRepository(session)
    payload = MunicipalityPredictionCreate(
        municipality_id=1,
        target_year=2028,
        model_name='linreg',
        model_version='1.0',
        model_run_id='run-1',
        predicted_natural_increase_rate=-1.6,
        metadata={'source': 'test'},
        confidence={'p90': [100, 120]},
    )

    result = await repo.create_prediction(payload)

    assert result.id == 10
    assert result.extra_metadata == {'source': 'test'}
    assert result.predicted_natural_increase_rate == -1.6
    session.add.assert_called_once()
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_predictions() -> None:
    session = AsyncMock()
    row = SimpleNamespace(id=1, model_run_id='run-1')
    session.execute = AsyncMock(
        side_effect=[
            FakeExecuteResult([row]),
            FakeExecuteResult(1),
        ],
    )

    repo = PredictionRepository(session)
    items, total = await repo.list_predictions(
        municipality_id=1,
        model_run_id='run-1',
        year_from=2024,
        year_to=2028,
        limit=100,
        offset=0,
    )

    assert total == 1
    assert items[0].model_run_id == 'run-1'
    assert session.execute.await_count == 2
