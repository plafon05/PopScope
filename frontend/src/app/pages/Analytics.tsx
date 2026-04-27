import { useState, useMemo, useRef, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LabelList, LineChart, Line, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter, ZAxis,
  ComposedChart, Area, ReferenceLine,
} from 'recharts';
import { MunicipalityRecord } from '../data/types';
import {
  Users, TrendingUp, TrendingDown, Heart, Skull,
  ChevronDown, ArrowUp, ArrowDown, FileText, Printer,
} from 'lucide-react';
import { useDemographyData } from '../data/DemographyProvider';
import { linearRegression } from '../lib/regression';
import { fetchAnalyticsReport } from '../api/reports';

// ── Aggregate helpers ─────────────────────────────────────────────────────────
function avgArr(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function aggregateMunicipalities(data: MunicipalityRecord[]) {
  const map = new Map<string, MunicipalityRecord[]>();
  data.forEach((r) => {
    const key = r.id.split('_')[0];
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  return Array.from(map.entries()).map(([id, records]) => {
    const last = records[records.length - 1];
    return {
      id, name: last.name, region: last.region, type: last.type,
      population:           Math.round(avgArr(records.map((r) => r.population))),
      birthRate:            Math.round(avgArr(records.map((r) => r.birthRate)) * 10) / 10,
      deathRate:            Math.round(avgArr(records.map((r) => r.deathRate)) * 10) / 10,
      naturalGrowthPercent: Math.round(avgArr(records.map((r) => r.naturalGrowthPercent)) * 100) / 100,
      density:              Math.round(avgArr(records.map((r) => r.density))),
      migration:            Math.round(avgArr(records.map((r) => r.migration))),
    };
  });
}

function fmtPop(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} млн`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)} тыс`;
  return String(n);
}
function fmtMig(n: number) {
  const s = n >= 0 ? '+' : '−';
  const a = Math.abs(n);
  return a >= 1000 ? `${s}${(a / 1000).toFixed(1)}K` : `${s}${a}`;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, colorClass, bgClass }: {
  label: string; value: string; sub: string;
  icon: React.ElementType; colorClass: string; bgClass: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${bgClass}`}>
        <Icon size={20} className={colorClass} />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-gray-900 mt-0.5">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

const REGION_COLORS: Record<string, string> = {
  'Московская область':    '#3b82f6',
  'Краснодарский край':    '#10b981',
  'Свердловская область':  '#f59e0b',
  'Новосибирская область': '#8b5cf6',
  'Республика Татарстан':  '#ef4444',
  'Ростовская область':    '#f97316',
  'Самарская область':     '#06b6d4',
};

const YEARS_HIST = [2019, 2020, 2021, 2022, 2023];
const YEARS_FC   = [2024, 2025, 2026];
const ALL_YEARS_CHART = [...YEARS_HIST, ...YEARS_FC];

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

type RegionDataItem = {
  region: string;
  fullRegion: string;
  birthRate: number;
  deathRate: number;
  naturalGrowthPercent: number;
  population: number;
  moCount: number;
};

type YearDynamicsItem = {
  year: string;
  birthRate: number;
  deathRate: number;
  naturalGrowthRate: number;
};

function renderReportMarkdown(text: string): JSX.Element[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: JSX.Element[] = [];
  let i = 0;
  let key = 0;
  let firstContentRendered = false;

  const SECTION_TITLES = new Set([
    'краткое резюме',
    'ключевые тенденции',
    'риски',
    'рекомендации',
    'заключение',
  ]);

  const renderInline = (value: string): (string | JSX.Element)[] => {
    const chunks = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return chunks.map((chunk, idx) => {
      if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
        return <strong key={idx}>{chunk.slice(2, -2)}</strong>;
      }
      return chunk;
    });
  };

  const isSpecialLine = (line: string): boolean => (
    /^#{1,3}\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^-{3,}$/.test(line)
  );

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      i += 1;
      continue;
    }

    if (!firstContentRendered && !/^#{1,3}\s+/.test(line)) {
      blocks.push(
        <h1 key={`h0-${key++}`} className="text-lg font-semibold text-gray-900">
          {renderInline(line)}
        </h1>,
      );
      firstContentRendered = true;
      i += 1;
      continue;
    }

    if (SECTION_TITLES.has(line.toLowerCase())) {
      blocks.push(
        <h2 key={`hs-${key++}`} className="text-base font-semibold text-gray-800 mt-3">
          {renderInline(line)}
        </h2>,
      );
      i += 1;
      continue;
    }

    if (/^---+$/.test(line)) {
      blocks.push(<hr key={`hr-${key++}`} className="my-3 border-gray-200" />);
      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      blocks.push(
        <h3 key={`h3-${key++}`} className="text-sm font-semibold text-gray-800 mt-3">
          {renderInline(line.replace(/^###\s+/, ''))}
        </h3>,
      );
      i += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      blocks.push(
        <h2 key={`h2-${key++}`} className="text-base font-semibold text-gray-800 mt-3">
          {renderInline(line.replace(/^##\s+/, ''))}
        </h2>,
      );
      i += 1;
      continue;
    }

    if (/^#\s+/.test(line)) {
      blocks.push(
        <h1 key={`h1-${key++}`} className="text-lg font-semibold text-gray-900 mt-3">
          {renderInline(line.replace(/^#\s+/, ''))}
        </h1>,
      );
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i].trim();
        if (!/^[-*]\s+/.test(current)) break;
        items.push(current.replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${key++}`} className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          {items.map((item, idx) => <li key={idx}>{renderInline(item)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i].trim();
        if (!/^\d+\.\s+/.test(current)) break;
        items.push(current.replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${key++}`} className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
          {items.map((item, idx) => <li key={idx}>{renderInline(item)}</li>)}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const current = lines[i].trim();
      if (!current || isSpecialLine(current)) break;
      paragraphLines.push(current);
      i += 1;
    }
    blocks.push(
      <p key={`p-${key++}`} className="text-sm leading-relaxed text-gray-700">
        {renderInline(paragraphLines.join(' '))}
      </p>,
    );
  }

  return blocks;
}

// ── Analytical Report Component ───────────────────────────────────────────────
function AnalyticalReport({
  filteredData,
  municipalities,
  regions,
  typeOptions,
  selectedRegion,
  selectedType,
  onRegionChange,
  onTypeChange,
  totalPop,
  avgBirth,
  avgDeath,
  avgGrowth,
  avgMigration,
  positiveCount,
  negativeCount,
}: {
  filteredData: MunicipalityRecord[];
  municipalities: ReturnType<typeof aggregateMunicipalities>;
  regions: string[];
  typeOptions: string[];
  selectedRegion: string;
  selectedType: string;
  onRegionChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  totalPop: number;
  avgBirth: number;
  avgDeath: number;
  avgGrowth: number;
  avgMigration: number;
  positiveCount: number;
  negativeCount: number;
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [reportText, setReportText] = useState<string | null>(null);
  const [reportProvider, setReportProvider] = useState<string>('stub');
  const [reportModelName, setReportModelName] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const useLlmNarrative = Boolean(reportText) && reportProvider !== 'stub';
  const trendsForecastLayoutClass = useLlmNarrative
    ? 'flex justify-center'
    : reportProvider === 'stub'
      ? 'grid grid-cols-1 xl:grid-cols-[1fr_560px] gap-5'
      : 'grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5';

  // Population dynamics 2019→2023
  const pop2019 = useMemo(() => filteredData.filter((d) => d.year === 2019).reduce((s, d) => s + d.population, 0), [filteredData]);
  const pop2023 = useMemo(() => filteredData.filter((d) => d.year === 2023).reduce((s, d) => s + d.population, 0), [filteredData]);
  const popDynPct = pop2019 ? Math.round(((pop2023 - pop2019) / pop2019) * 1000) / 10 : 0;

  // Birth/death trends
  const birth2019 = useMemo(() => avgArr(filteredData.filter((d) => d.year === 2019).map((d) => d.birthRate)), [filteredData]);
  const birth2023 = useMemo(() => avgArr(filteredData.filter((d) => d.year === 2023).map((d) => d.birthRate)), [filteredData]);
  const death2019 = useMemo(() => avgArr(filteredData.filter((d) => d.year === 2019).map((d) => d.deathRate)), [filteredData]);
  const death2023 = useMemo(() => avgArr(filteredData.filter((d) => d.year === 2023).map((d) => d.deathRate)), [filteredData]);

  // Forecast natural growth to 2026
  const ngYs   = YEARS_HIST.map((y) => avgArr(filteredData.filter((d) => d.year === y).map((d) => d.naturalGrowthPercent)));
  const predict = linearRegression(YEARS_HIST, ngYs);
  const ngForecast2026 = Math.round(predict(2026) * 100) / 100;

  // Mini chart data
  const miniChartData = useMemo(() => {
    const residuals = YEARS_HIST.map((year, idx) => ngYs[idx] - predict(year));
    const rmse = Math.sqrt(avgArr(residuals.map((v) => v * v)));
    const baseSigma = Number.isFinite(rmse) && rmse > 0 ? rmse : 0.08;

    return ALL_YEARS_CHART.map((year) => {
      const isFc = year > 2023;
      const hist = avgArr(filteredData.filter((d) => d.year === year).map((d) => d.naturalGrowthPercent));
      const fc = Math.round(predict(year) * 100) / 100;
      if (!isFc) {
        return {
          year: String(year),
          actual: Math.round(hist * 100) / 100,
          forecast: undefined,
          lower: undefined,
          upper: undefined,
          band: undefined,
        };
      }

      // Keep interval growth smooth by horizon (without abrupt jumps).
      const horizon = Math.max(1, year - 2023);
      const width = baseSigma * Math.sqrt(horizon);
      const lower = fc - width;
      const upper = fc + width;

      return {
        year: String(year),
        actual: undefined,
        forecast: fc,
        lower,
        upper,
        band: upper - lower,
      };
    });
  }, [filteredData, ngYs, predict]);

  const miniYAxisDomain = useMemo<[number, number]>(() => {
    const values = miniChartData.flatMap((row) =>
      [row.actual, row.forecast, row.lower, row.upper].filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
    );
    if (values.length === 0) return [-1.2, -0.4];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.04, (max - min) * 0.12);
    return [Math.round((min - pad) * 100) / 100, Math.round((max + pad) * 100) / 100];
  }, [miniChartData]);

  // Trend text helpers
  const trendText = (v2019: number, v2023: number, label: string, unit: string, inverse = false) => {
    const delta = v2023 - v2019;
    const pct   = v2019 ? Math.round((delta / Math.abs(v2019)) * 1000) / 10 : 0;
    const dir   = delta > 0 ? 'вырос' : 'снизился';
    const assessment = inverse
      ? (delta > 0 ? 'негативная тенденция' : 'позитивная тенденция')
      : (delta > 0 ? 'позитивная тенденция' : 'негативная тенденция');
    return `${label} ${dir} с ${v2019.toFixed(1)} до ${v2023.toFixed(1)} ${unit} (${pct > 0 ? '+' : ''}${pct}%) — ${assessment}.`;
  };

  const migTrend = avgMigration >= 0
    ? `Среднее сальдо миграции положительное (+${Math.round(avgMigration).toLocaleString('ru')} чел./год) — регион привлекателен для переезда.`
    : `Среднее сальдо миграции отрицательное (${Math.round(avgMigration).toLocaleString('ru')} чел./год) — наблюдается отток населения.`;

  const summary = popDynPct >= 0
    ? `За анализируемый период численность населения увеличилась на ${popDynPct}%. Рост обеспечен ${avgGrowth >= 0 ? 'положительным естественным приростом' : 'миграционным притоком'} и ${avgMigration >= 0 ? 'устойчивым миграционным сальдо' : 'частичной компенсацией убыли'}.`
    : `За анализируемый период численность населения сократилась на ${Math.abs(popDynPct)}%. Основные факторы: естественная убыль населения и ${avgMigration < 0 ? 'отрицательное миграционное сальдо' : 'недостаточный миграционный прирост для компенсации убыли'}.`;

  const recommendations = avgGrowth >= 0
    ? [
        'Поддерживать действующие демографические программы, обеспечивающие положительный естественный прирост.',
        'Усилить жилищную и инфраструктурную поддержку для закрепления мигрантов.',
        'Расширить меры поддержки молодых семей для сохранения рождаемости на текущем уровне.',
      ]
    : [
        'Разработать адресные программы демографического стимулирования в муниципалитетах с наибольшей убылью.',
        'Создать условия для привлечения и удержания трудоспособного населения (жильё, рабочие места).',
        'Организовать дополнительное финансирование системы здравоохранения для снижения смертности.',
        'Рассмотреть программы привлечения внутренней миграции из других регионов.',
      ];

  useEffect(() => {
    let cancelled = false;
    async function loadReport() {
      setReportLoading(true);
      setReportError(null);
      try {
        const municipalityType = selectedType === 'all' ? null : selectedType;
        const response = await fetchAnalyticsReport({
          region: selectedRegion === 'all' ? null : selectedRegion,
          type: municipalityType,
          year_from: 2019,
          year_to: 2023,
        });
        if (cancelled) return;
        setReportText(response.report_text);
        setReportProvider(response.provider);
        setReportModelName(response.model_name);
      } catch (error) {
        if (cancelled) return;
        setReportError(error instanceof Error ? error.message : 'Не удалось загрузить отчёт');
        setReportText(null);
        setReportProvider('stub');
        setReportModelName(null);
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    }
    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [selectedRegion, selectedType]);

  const handlePrint = () => {
    const printContent = reportRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Аналитическая справка</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #111827; font-size: 13px; }
            h1 { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
            h2 { font-size: 14px; font-weight: 600; margin: 18px 0 6px; color: #1e40af; }
            h3 { font-size: 13px; font-weight: 600; margin: 0 0 4px; }
            p  { margin: 0 0 6px; line-height: 1.6; }
            ul { margin: 4px 0 8px 20px; }
            li { margin-bottom: 3px; line-height: 1.5; }
            .meta { color: #6b7280; font-size: 12px; }
            .summary { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; margin: 10px 0; }
            .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
            .badge-pos { color: #059669; font-weight: 600; }
            .badge-neg { color: #dc2626; font-weight: 600; }
            .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px; }
            .no-print-chart { display: none; }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center shrink-0">
            <FileText size={16} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-gray-800">Аналитическая справка по демографической ситуации</h3>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
              <span><strong className="text-gray-600">Период анализа:</strong> 2019–2023</span>
              <span><strong className="text-gray-600">МО в выборке:</strong> {municipalities.length}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs text-gray-500">Регион</label>
            <div className="relative">
              <select
                value={selectedRegion}
                onChange={(e) => onRegionChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8 text-gray-700"
              >
                <option value="all">Все регионы</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs text-gray-500">Тип МО</label>
            <div className="relative">
              <select
                value={selectedType}
                onChange={(e) => onTypeChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8 text-gray-700"
              >
                <option value="all">Все типы</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors shadow-sm"
          >
            <Printer size={15} />
            Экспорт PDF
          </button>
        </div>
      </div>
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <KpiCard label="Суммарное население" value={fmtPop(totalPop)} sub={`${municipalities.length} МО`} icon={Users} colorClass="text-blue-600" bgClass="bg-blue-50" />
          <KpiCard label="Ср. рождаемость"     value={`${avgBirth} ‰`}  sub="на 1000 жителей"               icon={Heart} colorClass="text-emerald-600" bgClass="bg-emerald-50" />
          <KpiCard label="Ср. смертность"      value={`${avgDeath} ‰`}  sub="на 1000 жителей"               icon={Skull} colorClass="text-red-500" bgClass="bg-red-50" />
          <KpiCard label="Ср. ест. прирост"    value={`${avgGrowth > 0 ? '+' : ''}${avgGrowth}%`} sub={`${positiveCount} с приростом`}
            icon={avgGrowth >= 0 ? TrendingUp : TrendingDown}
            colorClass={avgGrowth >= 0 ? 'text-emerald-600' : 'text-red-500'}
            bgClass={avgGrowth >= 0 ? 'bg-emerald-50' : 'bg-red-50'} />
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm col-span-2 lg:col-span-1">
            <p className="text-xs text-gray-400 mb-2">Прирост / Убыль</p>
            <div className="flex gap-2 items-center mb-1.5">
              <div className="h-2 rounded-full bg-emerald-400" style={{ flex: positiveCount }} />
              <div className="h-2 rounded-full bg-red-400"     style={{ flex: negativeCount }} />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-emerald-600">{positiveCount} прирост ({municipalities.length ? Math.round(positiveCount / municipalities.length * 100) : 0}%)</span>
              <span className="text-red-500">{negativeCount} убыль</span>
            </div>
          </div>
        </div>
      </div>

      {/* Report body */}
      <div ref={reportRef} className="px-6 py-5 space-y-5 text-sm text-gray-700">
        {/* Summary */}
        <div>
          <h2 className="text-blue-700 mb-2" style={{ fontSize: 13, fontWeight: 600 }}>
            {useLlmNarrative ? 'Текст аналитической справки' : 'Краткое резюме'}
          </h2>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-gray-700 leading-relaxed">
            {reportLoading && (
              <p className="text-sm text-gray-500">Генерируем текст отчёта...</p>
            )}
            {!reportLoading && useLlmNarrative && reportText && (
              <div className="space-y-2">{renderReportMarkdown(reportText)}</div>
            )}
            {!reportLoading && !useLlmNarrative && (
              <p className="text-sm leading-relaxed">{summary}</p>
            )}
            {reportError && (
              <p className="text-xs text-amber-600 mt-2">
                LLM недоступен, показан локальный текст. Детали: {reportError}
              </p>
            )}
          </div>
        </div>

        {/* Trends + Forecast */}
        <div className={trendsForecastLayoutClass}>
          {/* Trends */}
          {!useLlmNarrative && <div>
            <h2 className="text-blue-700 mb-3" style={{ fontSize: 13, fontWeight: 600 }}>Основные тенденции</h2>
            <div className="space-y-2">
              {[
                { title: 'Рождаемость',           text: trendText(birth2019, birth2023, 'Рождаемость', '‰') },
                { title: 'Смертность',             text: trendText(death2019, death2023, 'Смертность', '‰', true) },
                { title: 'Миграция',               text: migTrend },
                { title: 'Естественный прирост',   text: `Средний естественный прирост за период: ${avgGrowth > 0 ? '+' : ''}${avgGrowth}% в год. ${avgGrowth >= 0 ? 'Воспроизводство населения поддерживается.' : 'Наблюдается устойчивая депопуляция.'}` },
              ].map((t) => (
                <div key={t.title} className="flex gap-3 border border-gray-100 rounded-xl px-4 py-3">
                  <div className="w-1 rounded-full bg-blue-400 shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 text-xs mb-0.5">{t.title}</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{t.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>}

          {/* Forecast block */}
          <div className={useLlmNarrative ? 'w-full max-w-[880px]' : ''}>
            <h2 className="text-blue-700 mb-3" style={{ fontSize: 13, fontWeight: 600 }}>Прогнозная оценка</h2>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs text-gray-500">
                  По линейному тренду ожидается прирост ест. прироста до{' '}
                  <span className={`font-semibold ${ngForecast2026 >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {ngForecast2026 > 0 ? '+' : ''}{ngForecast2026}%
                  </span>{' '}
                  к 2026 году. {ngForecast2026 >= 0
                    ? 'Тенденция стабилизации или роста.'
                    : 'Без мер поддержки убыль продолжится.'}
                </p>
              </div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={miniChartData} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v.toFixed(1)}%`}
                      domain={miniYAxisDomain}
                    />
                    <ReferenceLine x="2023" stroke="#9ca3af" strokeDasharray="3 3" />
                    <Tooltip
                      formatter={(v: number) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}%`]}
                      contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid #e5e7eb' }}
                    />
                    <Area
                      type="linear"
                      dataKey="lower"
                      stackId="mini_ci"
                      stroke="none"
                      fill="transparent"
                      isAnimationActive={false}
                      legendType="none"
                      connectNulls={false}
                    />
                    <Area
                      type="linear"
                      dataKey="band"
                      stackId="mini_ci"
                      stroke="none"
                      fill="#8b5cf6"
                      fillOpacity={0.14}
                      isAnimationActive={false}
                      legendType="none"
                      connectNulls={false}
                    />
                    <Line
                      type="linear"
                      dataKey="lower"
                      stroke="#8b5cf6"
                      strokeOpacity={0.32}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      dot={false}
                      isAnimationActive={false}
                      legendType="none"
                      connectNulls={false}
                    />
                    <Line
                      type="linear"
                      dataKey="upper"
                      stroke="#8b5cf6"
                      strokeOpacity={0.32}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      dot={false}
                      isAnimationActive={false}
                      legendType="none"
                      connectNulls={false}
                    />
                    <Line type="linear" dataKey="actual"   stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: '#8b5cf6' }} legendType="none" connectNulls={false} />
                    <Line type="linear" dataKey="forecast" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 4" dot={false} legendType="none" connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {!useLlmNarrative && <div>
          <h2 className="text-blue-700 mb-3" style={{ fontSize: 13, fontWeight: 600 }}>Рекомендации</h2>
          <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-3">
            <ul className="grid grid-cols-1 gap-2">
              {recommendations.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-700 leading-relaxed px-2 py-2">
                  <span className="mt-0.5 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold">{i + 1}</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>}

        {/* Footer */}
        <div className="border-t border-gray-100 pt-4 text-xs text-gray-400">
          Отчёт сформирован автоматически на основе статистических данных и прогнозной модели линейной регрессии.
          {reportProvider !== 'stub' && (
            <div className="mt-1">
              Автоматически сформированный отчёт на основе текущих данных · источник: {reportProvider}
              {reportModelName ? ` (${reportModelName})` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function Analytics() {
  const { allData, regions, isLoading, error } = useDemographyData();
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedType,   setSelectedType]   = useState('all');
  const [regionRatesView, setRegionRatesView] = useState<'20' | '40' | 'all'>('20');
  const [naturalGrowthView, setNaturalGrowthView] = useState<'20' | '40' | 'all'>('20');
  const [regionTopBy, setRegionTopBy] = useState<'population' | 'birthRate' | 'deathRate' | 'naturalGrowthPercent'>('population');
  const [naturalGrowthTopBy, setNaturalGrowthTopBy] = useState<'population' | 'birthRate' | 'deathRate' | 'naturalGrowthPercent'>('naturalGrowthPercent');
  const [topMetric, setTopMetric] = useState<'naturalGrowthPercent' | 'population' | 'birthRate' | 'deathRate'>('naturalGrowthPercent');
  const [topDir,    setTopDir]    = useState<'top' | 'bottom'>('top');
  const typeOptions = useMemo(
    () => [...new Set(allData.map((d) => d.type))].sort((a, b) => a.localeCompare(b, 'ru')),
    [allData],
  );

  const filteredData = useMemo(() => allData.filter((d) => {
    if (selectedRegion !== 'all' && d.region !== selectedRegion) return false;
    if (selectedType   !== 'all' && d.type   !== selectedType)   return false;
    if (d.year < YEARS_HIST[0] || d.year > YEARS_HIST[YEARS_HIST.length - 1]) return false;
    return true;
  }), [allData, selectedRegion, selectedType]);

  const municipalities = useMemo(() => aggregateMunicipalities(filteredData), [filteredData]);

  const totalPop    = useMemo(() => municipalities.reduce((s, m) => s + m.population, 0), [municipalities]);
  const avgBirth    = useMemo(() => Math.round(avgArr(municipalities.map((m) => m.birthRate)) * 10) / 10, [municipalities]);
  const avgDeath    = useMemo(() => Math.round(avgArr(municipalities.map((m) => m.deathRate)) * 10) / 10, [municipalities]);
  const avgGrowth   = useMemo(() => Math.round(avgArr(municipalities.map((m) => m.naturalGrowthPercent)) * 100) / 100, [municipalities]);
  const avgMigration= useMemo(() => Math.round(avgArr(municipalities.map((m) => m.migration))), [municipalities]);
  const positiveCount = useMemo(() => municipalities.filter((m) => m.naturalGrowthPercent > 0).length, [municipalities]);
  const negativeCount = municipalities.length - positiveCount;

  const regionData = useMemo<RegionDataItem[]>(() => {
    const regionSet = selectedRegion !== 'all' ? [selectedRegion] : regions;
    return regionSet.map((region): RegionDataItem | null => {
      const mos = municipalities.filter((m) => m.region === region);
      if (!mos.length) return null;
      return {
        region: region.replace('область', 'обл.').replace('Республика ', 'Респ. ').replace('Краснодарский край', 'Краснодарский кр.'),
        fullRegion: region,
        birthRate:            Math.round(avgArr(mos.map((m) => m.birthRate)) * 10) / 10,
        deathRate:            Math.round(avgArr(mos.map((m) => m.deathRate)) * 10) / 10,
        naturalGrowthPercent: Math.round(avgArr(mos.map((m) => m.naturalGrowthPercent)) * 100) / 100,
        population:           Math.round(avgArr(mos.map((m) => m.population))),
        moCount: mos.length,
      };
    }).filter((item): item is RegionDataItem => item !== null);
  }, [municipalities, selectedRegion]);

  const yearDynamics = useMemo<YearDynamicsItem[]>(() => YEARS_HIST.map((year): YearDynamicsItem | null => {
    const yd = filteredData.filter((d) => d.year === year);
    if (!yd.length) return null;
    return {
      year: String(year),
      birthRate:         Math.round(avgArr(yd.map((d) => d.birthRate)) * 10) / 10,
      deathRate:         Math.round(avgArr(yd.map((d) => d.deathRate)) * 10) / 10,
      naturalGrowthRate: Math.round(avgArr(yd.map((d) => d.naturalGrowthRate ?? (d.birthRate - d.deathRate))) * 10) / 10,
    };
  }).filter((item): item is YearDynamicsItem => item !== null), [filteredData]);

  const regionRatesData = useMemo(() => {
    const sortedByCriterion = [...regionData].sort((a, b) => (b[regionTopBy] as number) - (a[regionTopBy] as number));
    const limited = regionRatesView === 'all'
      ? sortedByCriterion
      : sortedByCriterion.slice(0, Number(regionRatesView));
    return limited;
  }, [regionData, regionRatesView, regionTopBy]);

  const naturalGrowthData = useMemo(() => {
    // 1) Select top regions by chosen criterion. 2) Display them ranked by natural growth.
    const topByCriterion = [...regionData].sort((a, b) => (b[naturalGrowthTopBy] as number) - (a[naturalGrowthTopBy] as number));
    const limited = naturalGrowthView === 'all'
      ? topByCriterion
      : topByCriterion.slice(0, Number(naturalGrowthView));
    return [...limited].sort((a, b) => b.naturalGrowthPercent - a.naturalGrowthPercent);
  }, [regionData, naturalGrowthView, naturalGrowthTopBy]);

  const isSingleRegionMode = regionData.length === 1;

  const topList = useMemo(() => {
    const sorted = [...municipalities].sort((a, b) =>
      topDir === 'top'
        ? (b[topMetric] as number) - (a[topMetric] as number)
        : (a[topMetric] as number) - (b[topMetric] as number)
    );
    return sorted.slice(0, 10);
  }, [municipalities, topMetric, topDir]);

  const scatterData = useMemo(() => municipalities.map((m) => ({
    x: m.birthRate, y: m.deathRate,
    z: Math.max(10, m.population / 30000),
    name: m.name, region: m.region, growth: m.naturalGrowthPercent,
  })), [municipalities]);

  const radarData = useMemo(() => {
    const cities = municipalities.filter((m) => isUrbanType(m.type));
    const munis  = municipalities.filter((m) => !isUrbanType(m.type));
    if (!cities.length || !munis.length) return [];
    const norm = (v: number, min: number, max: number) => max === min ? 50 : ((v - min) / (max - min)) * 100;
    return [
      { metric: 'Население',  city: norm(avgArr(cities.map((m) => m.population)), 0, 1_600_000), municipality: norm(avgArr(munis.map((m) => m.population)), 0, 1_600_000) },
      { metric: 'Плотность',  city: norm(avgArr(cities.map((m) => m.density)), 0, 4000),         municipality: norm(avgArr(munis.map((m) => m.density)), 0, 4000) },
      { metric: 'Рождаемость',city: norm(avgArr(cities.map((m) => m.birthRate)), 8, 14),          municipality: norm(avgArr(munis.map((m) => m.birthRate)), 8, 14) },
      { metric: 'Смертность', city: norm(avgArr(cities.map((m) => m.deathRate)), 8, 16),          municipality: norm(avgArr(munis.map((m) => m.deathRate)), 8, 16) },
      { metric: 'Прирост',    city: norm(avgArr(cities.map((m) => m.naturalGrowthPercent)), -0.9, 0.5), municipality: norm(avgArr(munis.map((m) => m.naturalGrowthPercent)), -0.9, 0.5) },
    ];
  }, [municipalities]);

  const topMetricLabel: Record<typeof topMetric, string> = {
    naturalGrowthPercent: 'Ест. прирост, %', population: 'Население',
    birthRate: 'Рождаемость ‰', deathRate: 'Смертность ‰',
  };

  const CustomTooltipBar = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
        <p className="text-gray-600 mb-1.5">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex justify-between gap-6 py-0.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="text-gray-500">{p.name}</span>
            </span>
            <span className="font-medium text-gray-800">{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">
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

      {/* ── Analytical Report ── */}
      <AnalyticalReport
        filteredData={filteredData}
        municipalities={municipalities}
        regions={regions}
        typeOptions={typeOptions}
        selectedRegion={selectedRegion}
        selectedType={selectedType}
        onRegionChange={setSelectedRegion}
        onTypeChange={setSelectedType}
        totalPop={totalPop}
        avgBirth={avgBirth}
        avgDeath={avgDeath}
        avgGrowth={avgGrowth}
        avgMigration={avgMigration}
        positiveCount={positiveCount}
        negativeCount={negativeCount}
      />

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div className="pr-3">
                <h3 className="text-gray-800">Рождаемость и смертность по регионам</h3>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Рождаемость
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Смертность
                  </span>
                  <span className="relative inline-flex items-center group">
                    <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700 cursor-pointer transition-colors group-hover:bg-blue-100">
                      <span>Ед.: ‰</span>
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-blue-300 text-[10px] leading-none">i</span>
                    </span>
                    <span
                      className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 opacity-0 shadow-sm transition-opacity duration-75 group-hover:opacity-100 group-focus-within:opacity-100"
                      role="tooltip"
                    >
                      ‰ — значение на 1000 жителей
                    </span>
                  </span>
                </div>
              </div>
              {!isSingleRegionMode && (
                <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                  <label className="text-xs text-gray-500">Показать</label>
                  <select
                    value={regionRatesView}
                    onChange={(e) => setRegionRatesView(e.target.value as '20' | '40' | 'all')}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                  >
                    <option value="20">Топ-20</option>
                    <option value="40">Топ-40</option>
                    <option value="all">Все</option>
                  </select>
                  <label className="text-xs text-gray-500">Топ по</label>
                  <select
                    value={regionTopBy}
                    onChange={(e) => setRegionTopBy(e.target.value as 'population' | 'birthRate' | 'deathRate' | 'naturalGrowthPercent')}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                  >
                    <option value="population">Населению</option>
                    <option value="birthRate">Рождаемости</option>
                    <option value="deathRate">Смертности</option>
                    <option value="naturalGrowthPercent">Ест. приросту</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="px-4 py-4" style={{ height: 320 }}>
            {regionRatesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">Нет данных</div>
            ) : (
              <div className={isSingleRegionMode ? 'h-full flex items-center' : 'h-full overflow-y-auto pr-1'}>
                <div style={{ height: isSingleRegionMode ? 180 : Math.max(280, regionRatesData.length * 24), width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionRatesData} margin={{ top: 8, right: 44, left: 0, bottom: 8 }} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, 'auto']}
                      />
                      <YAxis
                        type="category"
                        dataKey="region"
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        axisLine={false}
                        tickLine={false}
                        width={130}
                        interval={0}
                      />
                      <Tooltip content={<CustomTooltipBar />} />
                      <Bar dataKey="birthRate" name="Рождаемость" fill="#10b981" radius={[0, 4, 4, 0]} barSize={isSingleRegionMode ? 28 : undefined}>
                        <LabelList
                          dataKey="birthRate"
                          position="right"
                          formatter={(value: number | string) => typeof value === 'number' ? value.toFixed(1) : value}
                          fill="#059669"
                          fontSize={10}
                        />
                      </Bar>
                      <Bar dataKey="deathRate" name="Смертность" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={isSingleRegionMode ? 28 : undefined}>
                        <LabelList
                          dataKey="deathRate"
                          position="right"
                          formatter={(value: number | string) => typeof value === 'number' ? value.toFixed(1) : value}
                          fill="#dc2626"
                          fontSize={10}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-gray-800">Динамика по годам</h3>
            <p className="text-xs text-gray-400 mt-0.5">Средние значения по выборке · включая COVID-период</p>
          </div>
          <div className="px-4 py-4" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={yearDynamics} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltipBar />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="birthRate"         name="Рождаемость"    stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="deathRate"         name="Смертность"     stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="naturalGrowthRate" name="Ест. прирост (‰)" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div className="pr-3">
                <h3 className="text-gray-800">Естественный прирост по регионам</h3>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <span className="relative inline-flex items-center group">
                    <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700 cursor-pointer transition-colors group-hover:bg-blue-100">
                      <span>Ед.: %</span>
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-blue-300 text-[10px] leading-none">i</span>
                    </span>
                    <span
                      className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 opacity-0 shadow-sm transition-opacity duration-75 group-hover:opacity-100 group-focus-within:opacity-100"
                      role="tooltip"
                    >
                      % — относительное изменение
                    </span>
                  </span>
                </div>
              </div>
              {!isSingleRegionMode && (
                <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                  <label className="text-xs text-gray-500">Показать</label>
                  <select
                    value={naturalGrowthView}
                    onChange={(e) => setNaturalGrowthView(e.target.value as '20' | '40' | 'all')}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                  >
                    <option value="20">Топ-20</option>
                    <option value="40">Топ-40</option>
                    <option value="all">Все</option>
                  </select>
                  <label className="text-xs text-gray-500">Топ по</label>
                  <select
                    value={naturalGrowthTopBy}
                    onChange={(e) => setNaturalGrowthTopBy(e.target.value as 'population' | 'birthRate' | 'deathRate' | 'naturalGrowthPercent')}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                  >
                    <option value="population">Населению</option>
                    <option value="birthRate">Рождаемости</option>
                    <option value="deathRate">Смертности</option>
                    <option value="naturalGrowthPercent">Ест. приросту</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="px-4 py-4" style={{ height: 320 }}>
            {naturalGrowthData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">Нет данных</div>
            ) : isSingleRegionMode ? (
              <div className="h-full flex flex-col items-center justify-center">
                <p className="text-xs text-gray-400 mb-3">{naturalGrowthData[0].fullRegion}</p>
                <p className={`text-3xl font-semibold ${naturalGrowthData[0].naturalGrowthPercent >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {naturalGrowthData[0].naturalGrowthPercent > 0 ? '+' : ''}
                  {naturalGrowthData[0].naturalGrowthPercent.toFixed(2)}%
                </p>
                <div className="relative mt-6 w-full max-w-[360px] h-3 rounded-full bg-gray-100 overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
                  <div
                    className={`absolute inset-y-0 ${naturalGrowthData[0].naturalGrowthPercent >= 0 ? 'left-1/2 bg-emerald-500' : 'right-1/2 bg-red-500'}`}
                    style={{ width: `${Math.min(50, Math.abs(naturalGrowthData[0].naturalGrowthPercent) * 25)}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-2">0% в центре, значение региона выделено цветом</p>
              </div>
            ) : (
              <div className="h-full overflow-y-auto pr-1">
                <div style={{ height: Math.max(260, naturalGrowthData.length * 22), width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={naturalGrowthData}
                      margin={{ top: 8, right: 44, left: 0, bottom: 8 }}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}
                      />
                      <YAxis
                        type="category"
                        dataKey="region"
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        axisLine={false}
                        tickLine={false}
                        width={130}
                        interval={0}
                      />
                      <Tooltip formatter={(val: number) => [`${val > 0 ? '+' : ''}${val.toFixed(2)}%`, 'Прирост']} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                      <Bar dataKey="naturalGrowthPercent" name="Ест. прирост" radius={[0, 4, 4, 0]}>
                        <LabelList
                          dataKey="naturalGrowthPercent"
                          position="right"
                          formatter={(value: number | string) =>
                            typeof value === 'number' ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : value
                          }
                          fill="#6b7280"
                          fontSize={10}
                        />
                        {naturalGrowthData.map((entry, i) => (
                          <Cell key={`cell-${i}`} fill={entry.naturalGrowthPercent >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-gray-800">Рождаемость vs Смертность (МО)</h3>
            <p className="text-xs text-gray-400 mt-0.5">Размер точки — население · зелёный = прирост</p>
          </div>
          <div className="px-4 py-4" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" dataKey="x" name="Рождаемость" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false}
                  label={{ value: 'Рождаемость ‰', position: 'insideBottom', offset: -4, fontSize: 10, fill: '#9ca3af' }} />
                <YAxis type="number" dataKey="y" name="Смертность" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  label={{ value: 'Смертность ‰', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9ca3af' }} />
                <ZAxis type="number" dataKey="z" range={[40, 400]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  if (!d) return null;
                  return (
                    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
                      <p className="font-medium text-gray-800 mb-1">{d.name}</p>
                      <p className="text-gray-400">{d.region}</p>
                      <p className="text-gray-600 mt-1">Рождаемость: {d.x.toFixed(1)} ‰</p>
                      <p className="text-gray-600">Смертность: {d.y.toFixed(1)} ‰</p>
                      <p className={`mt-1 font-medium ${d.growth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        Прирост: {d.growth > 0 ? '+' : ''}{d.growth.toFixed(2)}%
                      </p>
                    </div>
                  );
                }} />
                <Scatter data={scatterData} fill="#8b5cf6">
                  {scatterData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.growth > 0 ? '#10b981' : '#ef4444'} fillOpacity={0.7} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Radar + top list */}
      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-gray-800">Городские округа vs Районы</h3>
            <p className="text-xs text-gray-400 mt-0.5">Нормализованные показатели</p>
          </div>
          <div className="px-4 py-4" style={{ height: 280 }}>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#f0f0f0" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <PolarRadiusAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} domain={[0, 100]} />
                  <Radar name="Городские округа"    dataKey="city"         stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                  <Radar name="Муниципальные районы" dataKey="municipality" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center">
                <p className="text-gray-500 text-sm -mt-6 text-center">
                  Для сравнения нужны оба типа МО: городские округа и муниципальные районы.
                </p>
                <p className="text-gray-400 text-xs mt-1 text-center">
                  {selectedType !== 'all'
                    ? 'Сейчас выбран один тип. В фильтре «Тип МО» выберите «Все типы».'
                    : 'В текущей выборке одного из типов МО недостаточно.'}
                </p>
                <img
                  src="/images/empty-radar1.gif"
                  alt="Нет данных"
                  className="mt-3 w-[22vw] h-[22vw] min-w-20 min-h-20 max-w-36 max-h-36 object-contain opacity-90"
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-gray-800">Рейтинг муниципалитетов</h3>
              <p className="text-xs text-gray-400 mt-0.5">Топ-10 по выбранному показателю</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <select value={topMetric} onChange={(e) => setTopMetric(e.target.value as typeof topMetric)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8 text-gray-700">
                  <option value="naturalGrowthPercent">Ест. прирост</option>
                  <option value="population">Население</option>
                  <option value="birthRate">Рождаемость</option>
                  <option value="deathRate">Смертность</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                <button onClick={() => setTopDir('top')}
                  className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${topDir === 'top' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                  <ArrowDown size={13} />Топ
                </button>
                <button onClick={() => setTopDir('bottom')}
                  className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${topDir === 'bottom' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                  <ArrowUp size={13} />Низ
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">МО</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Регион</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Тип</th>
                  <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium whitespace-nowrap">{topMetricLabel[topMetric]}</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Визуализация</th>
                </tr>
              </thead>
              <tbody>
                {topList.map((m, i) => {
                  const val = m[topMetric] as number;
                  const maxVal   = Math.max(...topList.map((x) => Math.abs(x[topMetric] as number)));
                  const barWidth = maxVal > 0 ? Math.abs(val) / maxVal * 100 : 0;
                  const isNatGrowth = topMetric === 'naturalGrowthPercent';
                  const barColor = isNatGrowth
                    ? val >= 0 ? '#10b981' : '#ef4444'
                    : topMetric === 'deathRate' ? '#ef4444' : '#3b82f6';
                  let displayVal = '';
                  if      (topMetric === 'population')           displayVal = fmtPop(val);
                  else if (topMetric === 'naturalGrowthPercent') displayVal = `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
                  else                                           displayVal = `${val.toFixed(1)} ‰`;
                  return (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 text-gray-800 whitespace-nowrap">{m.name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{m.region}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isUrbanType(m.type) ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          {shortTypeLabel(m.type)}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs font-medium whitespace-nowrap ${isNatGrowth ? val >= 0 ? 'text-emerald-600' : 'text-red-500' : 'text-gray-700'}`}>
                        {displayVal}
                      </td>
                      <td className="px-4 py-2.5 min-w-[100px]">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-full max-w-[120px]">
                          <div className="h-full rounded-full" style={{ width: `${barWidth}%`, background: barColor }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
