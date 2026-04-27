from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any

from app.repositories.reports import ReportRepository
from app.schemas.report import AnalyticsReportRequest, AnalyticsReportResponse
from app.services.llm import LLMClient

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AnalyticsReportService:
    repository: ReportRepository
    llm_client: LLMClient

    async def generate_report(
        self,
        request: AnalyticsReportRequest,
    ) -> AnalyticsReportResponse:
        stats = await self.repository.get_aggregated_stats(
            region=request.region,
            municipality_type=request.municipality_type,
            year_from=request.year_from,
            year_to=request.year_to,
        )
        prompt = self._build_prompt(request, stats)

        provider = 'stub'
        model_name = None
        try:
            llm_result = await self.llm_client.generate(prompt)
            report_text = llm_result.text
            provider = llm_result.provider
            model_name = llm_result.model_name
        except Exception:
            logger.exception('LLM report generation failed, fallback report will be used')
            report_text = self._build_fallback_report(request, stats)

        return AnalyticsReportResponse(
            provider=provider,
            model_name=model_name,
            region=request.region,
            municipality_type=request.municipality_type,
            year_from=request.year_from,
            year_to=request.year_to,
            report_text=report_text,
        )

    @staticmethod
    def _build_prompt(
        request: AnalyticsReportRequest,
        stats: dict[str, Any],
    ) -> str:
        region = request.region or 'Все регионы'
        municipality_type = request.municipality_type or 'Все типы МО'
        total_from = stats['total_population_year_from']
        total_to = stats['total_population_year_to']
        delta_pct = ((total_to - total_from) / total_from * 100) if total_from else 0.0
        return (
            'Сформируй аналитическую справку по демографическим данным. '\
            'Структура: краткое резюме, ключевые тенденции, риски, рекомендации. '\
            'Используй только значения из входных данных, не придумывай новые числа.\\n\\n'
            f'Регион: {region}\\n'
            f'Тип МО: {municipality_type}\\n'
            f'Период: {request.year_from}-{request.year_to}\\n'
            f"Муниципалитетов в выборке: {stats['municipality_count']}\\n"
            f"Средняя рождаемость: {stats['avg_birth_rate']:.2f}‰\\n"
            f"Средняя смертность: {stats['avg_death_rate']:.2f}‰\\n"
            f"Средняя миграция: {stats['avg_migration']:.2f} (на 1000 жителей)\\n"
            f"Средняя численность: {stats['avg_population']:.2f} чел.\\n"
            f"Суммарная численность в {request.year_from}: {total_from:.0f} чел.\\n"
            f"Суммарная численность в {request.year_to}: {total_to:.0f} чел.\\n"
            f"Динамика численности за период: {delta_pct:+.2f}%"
        )

    @staticmethod
    def _build_fallback_report(
        request: AnalyticsReportRequest,
        stats: dict[str, Any],
    ) -> str:
        nat_growth = stats['avg_birth_rate'] - stats['avg_death_rate']
        nat_growth_text = 'положительный' if nat_growth >= 0 else 'отрицательный'
        migration_text = 'приток' if stats['avg_migration'] >= 0 else 'отток'

        return (
            'Аналитическая справка (fallback).\\n\\n'
            f"Период: {request.year_from}-{request.year_to}. "
            f"Муниципалитетов в выборке: {stats['municipality_count']}.\\n"
            f"Средняя рождаемость: {stats['avg_birth_rate']:.2f}‰, "
            f"смертность: {stats['avg_death_rate']:.2f}‰. "
            f"Естественный прирост {nat_growth_text} ({nat_growth:.2f}‰).\\n"
            f"Миграционный баланс: {migration_text} ({stats['avg_migration']:.2f} на 1000 жителей).\\n"
            f"Суммарная численность в {request.year_to}: {stats['total_population_year_to']:.0f} чел.\\n"
            'Рекомендуется сфокусироваться на мерах по снижению смертности, '\
            'стимулированию рождаемости и удержанию населения в территориях риска.'
        )
