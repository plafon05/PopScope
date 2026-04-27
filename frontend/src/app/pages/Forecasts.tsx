import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { MunicipalityRecord } from '../data/types';
import { TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';
import { useDemographyData } from '../data/DemographyProvider';
import {
  fetchLatestPredictionRunId,
  fetchPredictionsByRun,
  MlQualityMetric,
  PredictionPoint,
} from '../api/predictions';

type MetricKey = 'population' | 'birthRate' | 'deathRate' | 'naturalGrowthPercent';

const HISTORICAL_YEARS = [2019, 2020, 2021, 2022, 2023];
const FORECAST_START_YEAR = 2024;
const FORECAST_MAX_YEAR = 2038;

function isUrbanType(type: string): boolean {
  return type.trim().toLowerCase().includes('город');
}

function shortTypeLabel(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'городской округ') return 'ГО';
  if (normalized === 'муниципальный район') return 'МР';
  if (normalized === 'муниципальный округ') return 'МО';
  if (normalized === 'город федерального значения') return 'ГФЗ';
  if (normalized === 'административный район') return 'АР';
  if (normalized === 'городской округ с внутригородским делением') return 'ГО-вгд';
  return type;
}

const METRICS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'population',           label: 'Население',   unit: 'чел.',  color: '#3b82f6' },
  { key: 'birthRate',            label: 'Рождаемость', unit: '‰',     color: '#10b981' },
  { key: 'deathRate',            label: 'Смертность',  unit: '‰',     color: '#ef4444' },
  { key: 'naturalGrowthPercent', label: 'Ест. прирост', unit: '%',    color: '#8b5cf6' },
];

// ── Aggregate helpers ─────────────────────────────────────────────────────────
function aggregateMunicipalities(data: MunicipalityRecord[]) {
  const map = new Map<string, MunicipalityRecord[]>();
  data.forEach((r) => {
    const key = r.id.split('_')[0];
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  return Array.from(map.entries()).map(([id, records]) => {
    const last = records[records.length - 1];
    return { id, name: last.name, region: last.region, type: last.type, records };
  });
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtPop(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} млн`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)} тыс`;
  return String(Math.round(n));
}
function fmtValue(v: number, metric: MetricKey) {
  if (metric === 'population')           return fmtPop(v);
  if (metric === 'naturalGrowthPercent') return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
  return `${v.toFixed(1)} ‰`;
}
function fmtYAxis(val: number, metric: MetricKey) {
  if (metric === 'population') {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}М`;
    if (val >= 1_000)     return `${(val / 1_000).toFixed(0)}к`;
    return String(Math.round(val));
  }
  return val.toFixed(1);
}

function predictionKey(municipalityId: number, year: number): string {
  return `${municipalityId}_${year}`;
}

function getRecordMetricValue(record: MunicipalityRecord, metric: MetricKey): number {
  return record[metric] as number;
}

function normalizeForecastValue(metric: MetricKey, value: number): number {
  if (metric === 'naturalGrowthPercent') return value;
  return Math.max(0, value);
}

function metricKeyToApi(metric: MetricKey): string {
  if (metric === 'population') return 'population';
  if (metric === 'birthRate') return 'birth_rate';
  if (metric === 'deathRate') return 'death_rate';
  return 'natural_increase_rate';
}

function getPredictionMetricValue(point: PredictionPoint, metric: MetricKey): number | null {
  if (metric === 'population') return point.population;
  if (metric === 'birthRate') return point.birthRate;
  if (metric === 'deathRate') return point.deathRate;
  return point.naturalGrowthPercent;
}

function getPredictionMetricConfidence(
  point: PredictionPoint,
  metric: MetricKey,
): { lower: number; upper: number } | null {
  if (
    metric === 'population' &&
    point.confidenceLowerPopulation !== null &&
    point.confidenceUpperPopulation !== null
  ) {
    return { lower: point.confidenceLowerPopulation, upper: point.confidenceUpperPopulation };
  }
  if (
    metric === 'birthRate' &&
    point.confidenceLowerBirthRate !== null &&
    point.confidenceUpperBirthRate !== null
  ) {
    return { lower: point.confidenceLowerBirthRate, upper: point.confidenceUpperBirthRate };
  }
  if (
    metric === 'deathRate' &&
    point.confidenceLowerDeathRate !== null &&
    point.confidenceUpperDeathRate !== null
  ) {
    return { lower: point.confidenceLowerDeathRate, upper: point.confidenceUpperDeathRate };
  }
  if (
    metric === 'naturalGrowthPercent' &&
    point.confidenceLowerNaturalGrowthPercent !== null &&
    point.confidenceUpperNaturalGrowthPercent !== null
  ) {
    return {
      lower: point.confidenceLowerNaturalGrowthPercent,
      upper: point.confidenceUpperNaturalGrowthPercent,
    };
  }
  return null;
}

function isObservedForMetric(record: MunicipalityRecord, metric: MetricKey): boolean {
  if (metric === 'population') return record.populationObserved;
  if (metric === 'birthRate') return record.birthRateObserved;
  if (metric === 'deathRate') return record.deathRateObserved;
  return record.birthRateObserved && record.deathRateObserved;
}

// ── TrendCard ─────────────────────────────────────────────────────────────────
function TrendCard({ name, region, type, currentVal, currentYear, forecastVal, metric, forecastYear, source, hasHistory }: {
  name: string; region: string; type: string;
  currentVal: number; currentYear: number; forecastVal: number; metric: MetricKey; forecastYear: number; source: 'ml' | 'none'; hasHistory: boolean;
}) {
  const delta    = forecastVal - currentVal;
  const pct      = currentVal !== 0 ? (delta / Math.abs(currentVal)) * 100 : 0;
  const isPos    = delta > 0;
  const isNeutral= metric === 'naturalGrowthPercent' ? Math.abs(delta) < 0.1 : Math.abs(pct) < 0.5;

  const Icon = isNeutral ? Minus : isPos ? TrendingUp : TrendingDown;
  const colorClass = isNeutral
    ? 'text-amber-500'
    : metric === 'deathRate'
    ? (isPos ? 'text-red-500' : 'text-emerald-500')
    : metric === 'naturalGrowthPercent'
    ? (isPos ? 'text-emerald-500' : 'text-red-500')
    : (isPos ? 'text-emerald-500' : 'text-red-500');

  const bgClass = isNeutral
    ? 'bg-amber-50 border-amber-100'
    : metric === 'deathRate'
    ? (isPos ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100')
    : metric === 'naturalGrowthPercent'
    ? (isPos ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100')
    : (isPos ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100');

  return (
    <div className={`border rounded-xl p-3.5 ${bgClass} flex flex-col gap-1.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-gray-800 truncate">{name}</p>
          <p className="text-[11px] text-gray-400 truncate">{region}</p>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${isUrbanType(type) ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
          {shortTypeLabel(type)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${source === 'ml' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
          {source === 'ml' ? 'ML' : 'нет ML'}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          {hasHistory ? (
            <>
              <p className="text-[10px] text-gray-400">{currentYear} → {forecastYear}</p>
              <p className="text-xs text-gray-600">
                {fmtValue(currentVal, metric)} → <span className={colorClass}>{fmtValue(forecastVal, metric)}</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] text-gray-400">история отсутствует → {forecastYear}</p>
              <p className="text-xs text-gray-600">
                <span className="text-gray-400">нет исторических данных</span> → <span className={colorClass}>{fmtValue(forecastVal, metric)}</span>
              </p>
            </>
          )}
        </div>
        <div className={`flex items-center gap-1 ${colorClass}`}>
          <Icon size={14} />
          <span className="text-xs font-medium">
            {!hasHistory
              ? '—'
              : isNeutral
              ? '≈0'
              : metric === 'naturalGrowthPercent'
                ? `${isPos ? '+' : ''}${delta.toFixed(2)} п.п.`
                : `${isPos ? '+' : ''}${pct.toFixed(1)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, metric }: {
  active?: boolean;
  payload?: { color: string; name: string; value: number; dataKey: string }[];
  label?: string;
  metric: MetricKey;
}) => {
  if (!active || !payload?.length) return null;
  const isForecastYear = Number(label) > 2023;
  const relevantPayload = payload.filter(
    (p) =>
      !p.dataKey.endsWith('_upper') &&
      !p.dataKey.endsWith('_lower') &&
      !p.dataKey.endsWith('_band') &&
      !p.dataKey.endsWith('_forecast_hitbox')
  );
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <p className="text-gray-500 mb-1.5 flex items-center gap-1.5">
        {label} год
        {isForecastYear && (
          <span className="px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded text-[10px]">прогноз</span>
        )}
      </p>
      {relevantPayload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-gray-500">{p.name}</span>
          </span>
          <span className="font-medium text-gray-800">{fmtValue(p.value, metric)}</span>
        </div>
      ))}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#f97316','#06b6d4','#84cc16','#ec4899','#6366f1'];

export function Forecasts() {
  const { allData, regions, isLoading, error } = useDemographyData();
  const [selectedRegion,     setSelectedRegion]     = useState('all');
  const [selectedType,       setSelectedType]       = useState('all');
  const [metric,             setMetric]             = useState<MetricKey>('naturalGrowthPercent');
  const [selectedMunicipality, setSelectedMunicipality] = useState('all');
  const [tableSearch, setTableSearch] = useState('');
  const [forecastHorizon,    setForecastHorizon]    = useState(5); // years from 2023
  const [predictionIndex, setPredictionIndex] = useState<Map<string, PredictionPoint>>(new Map());
  const [predictionRunId, setPredictionRunId] = useState<string | null>(null);
  const [runQualityMetrics, setRunQualityMetrics] = useState<Record<string, MlQualityMetric>>({});
  const [isPredictionsLoading, setIsPredictionsLoading] = useState(true);
  const [predictionsError, setPredictionsError] = useState<string | null>(null);
  const [hoveredForecastMunicipalityId, setHoveredForecastMunicipalityId] = useState<string | null>(null);

  const forecastYears   = useMemo(
    () => Array.from({ length: forecastHorizon }, (_, i) => FORECAST_START_YEAR + i),
    [forecastHorizon],
  );
  const forecastEndYear = 2023 + forecastHorizon;
  const allYears        = useMemo(() => [...HISTORICAL_YEARS, ...forecastYears], [forecastYears]);

  const municipalities = useMemo(() => aggregateMunicipalities(allData), [allData]);
  const typeOptions = useMemo(
    () => [...new Set(municipalities.map((m) => m.type))].sort((a, b) => a.localeCompare(b, 'ru')),
    [municipalities],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPredictions() {
      setIsPredictionsLoading(true);
      setPredictionsError(null);

      try {
        const runId = await fetchLatestPredictionRunId();
        if (!runId) {
          if (!cancelled) {
            setPredictionRunId(null);
            setPredictionIndex(new Map());
          }
          return;
        }

        const runData = await fetchPredictionsByRun(runId, FORECAST_START_YEAR, FORECAST_MAX_YEAR);
        if (cancelled) return;

        const nextIndex = new Map<string, PredictionPoint>();
        runData.points.forEach((point) => {
          nextIndex.set(predictionKey(point.municipalityId, point.year), point);
        });

        setPredictionRunId(runId);
        setPredictionIndex(nextIndex);
        setRunQualityMetrics(runData.overallQualityMetrics);
      } catch (loadError) {
        if (cancelled) return;
        setPredictionsError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить прогнозы ML');
        setPredictionRunId(null);
        setPredictionIndex(new Map());
        setRunQualityMetrics({});
      } finally {
        if (!cancelled) setIsPredictionsLoading(false);
      }
    }

    void loadPredictions();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => municipalities.filter((m) => {
    if (selectedRegion !== 'all' && m.region !== selectedRegion) return false;
    if (selectedType   !== 'all' && m.type   !== selectedType)   return false;
    return true;
  }), [municipalities, selectedRegion, selectedType]);

  const filteredBy2023Population = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const bPop = b.records.find((r) => r.year === 2023)?.population ?? 0;
        const aPop = a.records.find((r) => r.year === 2023)?.population ?? 0;
        return bPop - aPop;
      }),
    [filtered],
  );

  const tableFiltered = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    if (!query) return filtered;
    return filtered.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.region.toLowerCase().includes(query),
    );
  }, [filtered, tableSearch]);

  const selectedMunicipalities = useMemo(() => {
    if (selectedMunicipality !== 'all') {
      return filteredBy2023Population.filter((m) => m.id === selectedMunicipality);
    }
    return filteredBy2023Population.slice(0, 5);
  }, [filteredBy2023Population, selectedMunicipality]);

  function getObservedHistoryCount(
    municipality: (typeof municipalities)[number],
    selectedMetric: MetricKey,
  ): number {
    return municipality.records.filter((record) => isObservedForMetric(record, selectedMetric)).length;
  }

  const selectedMunicipalitiesWithoutHistory = useMemo(
    () =>
      selectedMunicipalities.filter(
        (municipality) => getObservedHistoryCount(municipality, metric) < 2,
      ),
    [selectedMunicipalities, metric],
  );

  function getForecastValue(
    municipality: (typeof municipalities)[number],
    year: number,
    selectedMetric: MetricKey,
  ): { value?: number; source: 'ml' | 'none'; confidenceLower?: number; confidenceUpper?: number } {
    if (getObservedHistoryCount(municipality, selectedMetric) < 2) {
      return { source: 'none' };
    }

    const prediction = predictionIndex.get(predictionKey(municipality.records[0]?.municipalityId ?? 0, year));
    const predictionValue = prediction ? getPredictionMetricValue(prediction, selectedMetric) : null;
    if (predictionValue !== null) {
      const normalizedMlValue = normalizeForecastValue(selectedMetric, predictionValue);
      const confidenceBand = getPredictionMetricConfidence(prediction, selectedMetric);
      if (confidenceBand !== null) {
        return {
          value: normalizedMlValue,
          source: 'ml',
          confidenceLower: confidenceBand.lower,
          confidenceUpper: confidenceBand.upper,
        };
      }
      return { value: normalizedMlValue, source: 'ml' };
    }
    return { source: 'none' };
  }

  function getLatestHistoricalPoint(
    municipality: (typeof municipalities)[number],
    selectedMetric: MetricKey,
  ): { year: number; value: number } | null {
    const orderedYears = [...HISTORICAL_YEARS].sort((a, b) => b - a);
    for (const year of orderedYears) {
      const record = municipality.records.find((r) => r.year === year);
      if (!record) continue;
      if (!isObservedForMetric(record, selectedMetric)) continue;
      const value = getRecordMetricValue(record, selectedMetric);
      return { year, value };
    }
    return null;
  }

  // Chart data with confidence bands
  const chartData = useMemo(() => {
    if (!selectedMunicipalities.length) return [];
    return allYears.map((year) => {
      const isForecast = year > 2023;
      const row: Record<string, string | number | undefined> = {
        year: String(year),
        isForecast: isForecast ? 1 : 0,
      };
      selectedMunicipalities.forEach((m) => {
        if (isForecast) {
          const forecastPoint = getForecastValue(m, year, metric);
          row[`${m.id}_forecast`] = forecastPoint.value;
          row[`${m.id}_forecast_hitbox`] = forecastPoint.value;
          if (
            typeof forecastPoint.confidenceLower === 'number' &&
            typeof forecastPoint.confidenceUpper === 'number'
          ) {
            const lower = Math.min(forecastPoint.confidenceLower, forecastPoint.confidenceUpper);
            const upper = Math.max(forecastPoint.confidenceLower, forecastPoint.confidenceUpper);
            row[`${m.id}_lower`] = lower;
            row[`${m.id}_upper`] = upper;
            row[`${m.id}_band`] = upper - lower;
          }
        } else {
          const histRec = m.records.find((r) => r.year === year);
          row[`${m.id}_actual`] =
            histRec && isObservedForMetric(histRec, metric)
              ? getRecordMetricValue(histRec, metric)
              : undefined;
        }
      });
      return row;
    });
  }, [selectedMunicipalities, metric, allYears, predictionIndex]);

  const yAxisDomain = useMemo<[number, number] | undefined>(() => {
    const values: number[] = [];

    chartData.forEach((row) => {
      selectedMunicipalities.forEach((municipality) => {
        const keys = [
          `${municipality.id}_actual`,
          `${municipality.id}_forecast`,
        ];
        keys.forEach((key) => {
          const value = row[key];
          if (typeof value === 'number' && Number.isFinite(value)) {
            values.push(value);
          }
        });
      });
    });

    if (!values.length) return undefined;

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
      const delta = Math.abs(min) * 0.15 || 1;
      return [min - delta, max + delta];
    }

    const span = max - min;
    const padding = span * 0.2;
    min -= padding;
    max += padding;

    if (metric !== 'naturalGrowthPercent') {
      min = Math.max(0, min);
    }

    return [min, max];
  }, [chartData, selectedMunicipalities, metric]);

  // ML quality metrics for active metric from run metadata
  const modelMetrics = useMemo(() => {
    const apiKey = metricKeyToApi(metric);
    const raw = runQualityMetrics[apiKey];
    if (!raw) return null;

    if (metric === 'population') {
      return {
        mape: raw.mape * 100,
        rmse: raw.rmse,
        mae: raw.mae,
      };
    }
    if (metric === 'naturalGrowthPercent') {
      return {
        mape: raw.mape * 100,
        rmse: raw.rmse * 100,
        mae: raw.mae * 100,
      };
    }
    return {
      mape: raw.mape * 100,
      rmse: raw.rmse * 1000,
      mae: raw.mae * 1000,
    };
  }, [metric, runQualityMetrics]);

  // Forecast summary cards
  const forecastCards = useMemo(() => filtered.map((m) => {
    const currentPoint = getLatestHistoricalPoint(m, metric);
    const forecastPoint = getForecastValue(m, forecastEndYear, metric);
    return {
      ...m,
      currentVal: currentPoint?.value ?? 0,
      currentYear: currentPoint?.year ?? 2023,
      hasHistory: currentPoint !== null,
      forecastVal: forecastPoint.value,
      source: forecastPoint.source,
    };
  }).filter((item) => typeof item.forecastVal === 'number'), [filtered, metric, forecastEndYear, predictionIndex]);

  const metricInfo = METRICS.find((m) => m.key === metric)!;
  const metricFmtUnit = metric === 'population' ? 'чел.' : metric === 'naturalGrowthPercent' ? '%' : '‰';
  const hasMlPredictions = predictionIndex.size > 0;
  const getSeriesOpacity = (municipalityId: string): number => (
    hoveredForecastMunicipalityId && hoveredForecastMunicipalityId !== municipalityId ? 0.16 : 1
  );

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-5 space-y-4">
      {/* Header + Filters */}
      <div className="space-y-3">
        <h2 className="text-gray-900">Прогнозы демографических показателей</h2>

        <div className="flex items-stretch gap-4">
          <div className="w-fit max-w-full bg-white border border-gray-200 rounded-xl px-4 pt-2 pb-2.5 shadow-sm">
            <div className="flex items-end gap-3 overflow-x-auto">
            {/* Region */}
            <div className="flex flex-col gap-1 w-[180px] shrink-0">
              <label className="text-xs text-gray-500">Регион</label>
              <div className="relative">
                <select
                  value={selectedRegion}
                  onChange={(e) => { setSelectedRegion(e.target.value); setSelectedMunicipality('all'); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-0 focus:border-gray-200 appearance-none pr-8 text-gray-700"
                >
                  <option value="all">Все регионы</option>
                  {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Type */}
            <div className="flex flex-col gap-1 w-[180px] shrink-0">
              <label className="text-xs text-gray-500">Тип МО</label>
              <div className="relative">
                <select
                  value={selectedType}
                  onChange={(e) => { setSelectedType(e.target.value); setSelectedMunicipality('all'); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-0 focus:border-gray-200 appearance-none pr-8 text-gray-700"
                >
                  <option value="all">Все типы</option>
                  {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Municipality */}
            <div className="flex flex-col gap-1 w-[180px] shrink-0">
              <label className="text-xs text-gray-500">МО (для графика)</label>
              <div className="relative">
                <select
                  value={selectedMunicipality}
                  onChange={(e) => setSelectedMunicipality(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-0 focus:border-gray-200 appearance-none pr-8 text-gray-700"
                >
                  <option value="all">Топ-5 из выборки</option>
                  {filteredBy2023Population.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Horizon */}
            <div className="flex flex-col gap-1.5 w-[220px] shrink-0">
              <label className="text-xs text-gray-500">
                Горизонт: <span className="font-medium text-gray-700">{forecastHorizon} лет</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">5</span>
                <input
                  type="range"
                  min={5}
                  max={15}
                  value={forecastHorizon}
                  onChange={(e) => setForecastHorizon(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-xs text-gray-400">15</span>
              </div>
            </div>

            {/* Metric buttons */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <label className="text-xs text-gray-500">Показатель</label>
              <div className="flex gap-2 flex-nowrap">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all border whitespace-nowrap ${
                      metric === m.key
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >{m.label}</button>
                ))}
              </div>
            </div>
            </div>
          </div>

          <div className="hidden xl:flex flex-1 items-center justify-center overflow-hidden">
            <img
              src="/images/empty-radar.gif"
              alt="Иллюстрация прогноза"
              className="h-21 w-auto object-contain opacity-90"
            />
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500">
          Загрузка данных...
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          Ошибка загрузки данных: {error}
        </div>
      )}
      {isPredictionsLoading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          Загружаем ML-прогнозы...
        </div>
      )}
      {predictionsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          ML-прогнозы недоступны: {predictionsError}
        </div>
      )}

      {/* Chart + Cards */}
      <div className="grid grid-cols-[1fr_340px] h-[620px] gap-5">
        {/* Chart */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden h-full min-h-0">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-gray-800">{metricInfo.label} — исторические данные и прогноз</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Сплошная линия — факт · пунктир — прогноз · {metricInfo.unit}
            </p>
            {selectedMunicipalitiesWithoutHistory.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-2 inline-block">
                Нет достаточной истории для прогноза: {selectedMunicipalitiesWithoutHistory.map((m) => m.name).join(', ')}.
                Прогноз для них скрыт.
              </p>
            )}
          </div>

          {selectedMunicipalities.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-20">Нет МО в выборке</div>
          ) : (
            <div className="px-4 py-5" style={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 28, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => fmtYAxis(v, metric)}
                    domain={yAxisDomain ?? ['auto', 'auto']}
                    allowDataOverflow
                  />
                  <ReferenceLine
                    x="2023"
                    stroke="#6b7280"
                    strokeDasharray="4 4"
                    label={{ value: 'факт / прогноз', position: 'top', fontSize: 10, fill: '#9ca3af', dy: -6 }}
                  />
                  <Tooltip
                    content={<CustomTooltip metric={metric} />}
                    position={{ x: 560, y: -80 }}
                  />

                  {/* Confidence intervals are always mounted; only opacity changes on hover. */}
                  {selectedMunicipalities.map((m, i) => {
                    const color = COLORS[i % COLORS.length];
                    const isActive = hoveredForecastMunicipalityId === m.id;
                    return (
                      <Fragment key={`${m.id}_ci`}>
                        <Area
                          type="monotone"
                          dataKey={`${m.id}_lower`}
                          stackId={`ci_${m.id}`}
                          stroke="none"
                          fill="transparent"
                          activeDot={false}
                          isAnimationActive={false}
                          legendType="none"
                          connectNulls={false}
                        />
                        <Area
                          type="monotone"
                          dataKey={`${m.id}_band`}
                          stackId={`ci_${m.id}`}
                          name={`${m.name} (интервал)`}
                          stroke="none"
                          fill={color}
                          fillOpacity={isActive ? 0.16 : 0}
                          activeDot={false}
                          isAnimationActive={false}
                          legendType="none"
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey={`${m.id}_lower`}
                          stroke={color}
                          strokeOpacity={isActive ? 0.65 : 0}
                          strokeWidth={1.2}
                          strokeDasharray="3 3"
                          dot={false}
                          activeDot={false}
                          legendType="none"
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey={`${m.id}_upper`}
                          stroke={color}
                          strokeOpacity={isActive ? 0.65 : 0}
                          strokeWidth={1.2}
                          strokeDasharray="3 3"
                          dot={false}
                          activeDot={false}
                          legendType="none"
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </Fragment>
                    );
                  })}

                  {/* Historical actual lines */}
                  {selectedMunicipalities.map((m, i) => {
                    const color = COLORS[i % COLORS.length];
                    return (
                      <Line
                        key={`${m.id}_actual`}
                        type="monotone"
                        dataKey={`${m.id}_actual`}
                        name={m.name}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ r: 3, fill: color }}
                        activeDot={{ r: 5 }}
                        strokeOpacity={getSeriesOpacity(m.id)}
                        fillOpacity={getSeriesOpacity(m.id)}
                        connectNulls={false}
                        legendType="circle"
                        isAnimationActive={false}
                      />
                    );
                  })}

                  {/* Forecast dashed lines */}
                  {selectedMunicipalities.map((m, i) => {
                    const color = COLORS[i % COLORS.length];
                    return (
                      <Fragment key={`${m.id}_forecast_group`}>
                        {/* Invisible wide hitbox for easier hover over forecast line */}
                        <Line
                          type="monotone"
                          dataKey={`${m.id}_forecast_hitbox`}
                          stroke="transparent"
                          strokeWidth={14}
                          dot={false}
                          activeDot={false}
                          connectNulls={false}
                          legendType="none"
                          isAnimationActive={false}
                          onMouseEnter={() => setHoveredForecastMunicipalityId(m.id)}
                          onMouseLeave={() => setHoveredForecastMunicipalityId(null)}
                        />
                        <Line
                          type="monotone"
                          dataKey={`${m.id}_forecast`}
                          name={`${m.name} (прогноз)`}
                          stroke={color}
                          strokeWidth={2}
                          strokeOpacity={getSeriesOpacity(m.id)}
                          strokeDasharray="6 4"
                          dot={false}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                          legendType="none"
                          isAnimationActive={false}
                          onMouseEnter={() => setHoveredForecastMunicipalityId(m.id)}
                          onMouseLeave={() => setHoveredForecastMunicipalityId(null)}
                        />
                      </Fragment>
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Model quality metrics */}
          {modelMetrics && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400 mb-2">Метрики качества ML-модели (по run)</p>
              <div className="flex flex-wrap gap-4">
                {[
                  { label: 'MAPE', value: `${modelMetrics.mape.toFixed(2)}%`,  desc: 'Средняя абс. % ошибка' },
                  { label: 'RMSE', value: `${modelMetrics.rmse.toFixed(3)} ${metricFmtUnit}`, desc: 'Корень из СКО' },
                  { label: 'MAE',  value: `${modelMetrics.mae.toFixed(3)} ${metricFmtUnit}`,  desc: 'Средняя абс. ошибка' },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs font-mono font-semibold text-gray-700">{m.label}</span>
                    <span className="text-sm font-medium text-gray-800">{m.value}</span>
                    <span className="text-xs text-gray-400">{m.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Forecast cards */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden h-full min-h-0">
          {/* Card header */}
          <div className="px-4 py-4 border-b border-gray-100 shrink-0">
            <h3 className="text-gray-800">Прогноз на {forecastEndYear}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {filtered.length} МО в выборке · «{metricInfo.label}» · источник: {hasMlPredictions ? 'ML' : 'нет данных ML'}
            </p>
            {/* Legend */}
            <div className="mt-2.5 flex flex-wrap gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                <span className="text-gray-500">Позитивная динамика</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />
                <span className="text-gray-500">Убыль / рост смертности</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block" />
                <span className="text-gray-500">Около нуля (±0.5%)</span>
              </span>
            </div>
          </div>

          {/* Scrollable cards list */}
          <div className="overflow-y-auto flex-1 min-h-0 p-3 space-y-2">
            {forecastCards.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Нет данных</p>
            ) : (
              [...forecastCards]
                .sort((a, b) => (b.forecastVal - b.currentVal) - (a.forecastVal - a.currentVal))
                .map((m) => (
                  <TrendCard
                    key={m.id}
                    name={m.name}
                    region={m.region}
                    type={m.type}
                    currentVal={m.currentVal}
                    currentYear={m.currentYear}
                    hasHistory={m.hasHistory}
                    forecastVal={m.forecastVal}
                    metric={metric}
                    forecastYear={forecastEndYear}
                    source={m.source}
                  />
                ))
            )}
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-gray-800">Таблица прогнозных значений</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Все 4 показателя · прогноз на {forecastYears.join(', ')} · только ML
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Поиск: МО или регион"
              className="w-[240px] max-w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-0 focus:border-gray-200 text-gray-700"
            />
            <div className="text-xs text-gray-400 whitespace-nowrap">
              Найдено: {tableFiltered.length}
            </div>
          </div>
          <div className="flex gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="text-gray-500">Прирост (зелёный)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              <span className="text-gray-500">Убыль (красный)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
              <span className="text-gray-500">Прочие прогнозы (серый)</span>
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium whitespace-nowrap">МО</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium whitespace-nowrap">Регион</th>
                <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium whitespace-nowrap" colSpan={forecastYears.length}>Население (тыс)</th>
                <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium whitespace-nowrap" colSpan={forecastYears.length}>Рождаемость ‰</th>
                <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium whitespace-nowrap" colSpan={forecastYears.length}>Смертность ‰</th>
                <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium whitespace-nowrap" colSpan={forecastYears.length}>Ест. прирост %</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th /><th />
                {[...forecastYears,...forecastYears,...forecastYears,...forecastYears].map((y, i) => (
                  <th key={`sub-${i}`} className="px-3 py-2 text-center text-[11px] text-gray-400 font-normal">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableFiltered.map((m, idx) => {
                const valueAt = (key: MetricKey, year: number) => getForecastValue(m, year, key).value;
                const formatRateCell = (value: number | undefined) =>
                  value === undefined ? '—' : Math.max(0, value).toFixed(1);
                return (
                  <tr key={m.id} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                    <td className="px-4 py-2.5 text-gray-800 whitespace-nowrap font-medium">{m.name}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{m.region}</td>
                    {forecastYears.map((y) => (
                      <td key={`pop-${y}`} className="px-3 py-2.5 text-center text-xs text-gray-500 whitespace-nowrap">
                        {valueAt('population', y) === undefined
                          ? '—'
                          : (Math.max(0, valueAt('population', y) as number) / 1000).toFixed(1)}
                      </td>
                    ))}
                    {forecastYears.map((y) => (
                      <td key={`br-${y}`} className="px-3 py-2.5 text-center text-xs text-gray-500 whitespace-nowrap">
                        {formatRateCell(valueAt('birthRate', y))}
                      </td>
                    ))}
                    {forecastYears.map((y) => (
                      <td key={`dr-${y}`} className="px-3 py-2.5 text-center text-xs text-gray-500 whitespace-nowrap">
                        {formatRateCell(valueAt('deathRate', y))}
                      </td>
                    ))}
                    {forecastYears.map((y) => {
                      const val = valueAt('naturalGrowthPercent', y);
                      if (val === undefined) {
                        return (
                          <td key={`ng-${y}`} className="px-3 py-2.5 text-center text-xs whitespace-nowrap text-gray-400">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={`ng-${y}`} className="px-3 py-2.5 text-center text-xs whitespace-nowrap">
                          <span className={`font-medium ${val > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {val > 0 ? '+' : ''}{val.toFixed(2)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
