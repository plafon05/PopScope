import { apiGet } from './client';

interface PredictionItem {
  municipality_id: number;
  target_year: number;
  model_run_id: string;
  predicted_population: number | null;
  predicted_birth_rate: number | null;
  predicted_death_rate: number | null;
  predicted_natural_increase_rate: number | null;
  confidence: {
    natural_increase_rate?: {
      lower?: number;
      upper?: number;
    };
  } | null;
  metadata?: {
    overall_quality_metrics?: Record<string, { mae?: number; rmse?: number; mape?: number }>;
  } | null;
}

interface PredictionListResponse {
  items: PredictionItem[];
  total: number;
  limit: number;
  offset: number;
}

const PREDICTIONS_PAGE_SIZE = 2000;

export interface PredictionPoint {
  municipalityId: number;
  year: number;
  modelRunId: string;
  population: number | null;
  birthRate: number | null;
  deathRate: number | null;
  naturalGrowthPercent: number | null;
  confidenceLowerNaturalGrowthPercent: number | null;
  confidenceUpperNaturalGrowthPercent: number | null;
}

export interface MlQualityMetric {
  mae: number;
  rmse: number;
  mape: number;
}

export interface PredictionsRunData {
  points: PredictionPoint[];
  overallQualityMetrics: Record<string, MlQualityMetric>;
}

function toNaturalGrowthPercent(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 100 * 100) / 100;
}

function toPerThousand(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 1000 * 10) / 10;
}

function mapPredictionItem(item: PredictionItem): PredictionPoint {
  return {
    municipalityId: item.municipality_id,
    year: item.target_year,
    modelRunId: item.model_run_id,
    population: item.predicted_population,
    birthRate: toPerThousand(item.predicted_birth_rate),
    deathRate: toPerThousand(item.predicted_death_rate),
    naturalGrowthPercent: toNaturalGrowthPercent(item.predicted_natural_increase_rate),
    confidenceLowerNaturalGrowthPercent: toNaturalGrowthPercent(
      item.confidence?.natural_increase_rate?.lower ?? null,
    ),
    confidenceUpperNaturalGrowthPercent: toNaturalGrowthPercent(
      item.confidence?.natural_increase_rate?.upper ?? null,
    ),
  };
}

export async function fetchLatestPredictionRunId(): Promise<string | null> {
  const firstPage = await apiGet<PredictionListResponse>('/api/v1/predictions', {
    limit: 1,
    offset: 0,
  });
  return firstPage.items[0]?.model_run_id ?? null;
}

export async function fetchPredictionsByRun(
  modelRunId: string,
  yearFrom: number,
  yearTo: number,
): Promise<PredictionsRunData> {
  const firstPage = await apiGet<PredictionListResponse>('/api/v1/predictions', {
    model_run_id: modelRunId,
    year_from: yearFrom,
    year_to: yearTo,
    limit: PREDICTIONS_PAGE_SIZE,
    offset: 0,
  });

  const items = [...firstPage.items];
  for (let offset = firstPage.limit; offset < firstPage.total; offset += firstPage.limit) {
    const page = await apiGet<PredictionListResponse>('/api/v1/predictions', {
      model_run_id: modelRunId,
      year_from: yearFrom,
      year_to: yearTo,
      limit: firstPage.limit,
      offset,
    });
    items.push(...page.items);
  }

  const firstWithMetrics = items.find((item) => item.metadata?.overall_quality_metrics);
  const overallQualityMetrics = firstWithMetrics?.metadata?.overall_quality_metrics ?? {};

  return {
    points: items.map(mapPredictionItem),
    overallQualityMetrics: Object.fromEntries(
      Object.entries(overallQualityMetrics).map(([key, value]) => [
        key,
        {
          mae: Number(value.mae ?? 0),
          rmse: Number(value.rmse ?? 0),
          mape: Number(value.mape ?? 0),
        },
      ]),
    ),
  };
}
