import pytest

from app.schemas.report import AnalyticsReportRequest
from app.services.llm import LLMResult
from app.services.reports import AnalyticsReportService


class FakeReportRepository:
    async def get_aggregated_stats(self, **_: object) -> dict[str, float]:
        return {
            'municipality_count': 43,
            'avg_birth_rate': 10.2,
            'avg_death_rate': 12.1,
            'avg_migration': -4.0,
            'avg_population': 120000.0,
            'total_population_year_from': 5_200_000.0,
            'total_population_year_to': 5_000_000.0,
        }


class FakeLLMClient:
    async def generate(self, prompt: str) -> LLMResult:
        return LLMResult(provider='stub', model_name='fake', text=f'LLM: {prompt[:20]}')


class FailingLLMClient:
    async def generate(self, prompt: str) -> LLMResult:
        raise RuntimeError('boom')


@pytest.mark.asyncio
async def test_generate_report_with_llm() -> None:
    repo = FakeReportRepository()
    service = AnalyticsReportService(repository=repo, llm_client=FakeLLMClient())

    response = await service.generate_report(
        AnalyticsReportRequest(region='Московская область', year_from=2019, year_to=2023),
    )

    assert response.provider == 'stub'
    assert response.model_name == 'fake'
    assert response.region == 'Московская область'
    assert 'LLM:' in response.report_text


@pytest.mark.asyncio
async def test_generate_report_fallback_when_llm_fails() -> None:
    repo = FakeReportRepository()
    service = AnalyticsReportService(repository=repo, llm_client=FailingLLMClient())

    response = await service.generate_report(
        AnalyticsReportRequest(year_from=2019, year_to=2023),
    )

    assert response.provider == 'stub'
    assert 'fallback' in response.report_text
