import { useState, useMemo } from 'react';
import {
  LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { MetricUnitMode, MunicipalityRecord } from '../data/types';
import { Users, Heart, Skull, TrendingUp, TrendingDown } from 'lucide-react';

interface DynamicsChartProps {
  data: MunicipalityRecord[];
  unitMode: MetricUnitMode;
}

type TabKey = 'population' | 'birthRate' | 'deathRate' | 'naturalGrowthRate';

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'population', label: 'Население', icon: <Users size={14} /> },
  { key: 'birthRate', label: 'Рождаемость', icon: <Heart size={14} /> },
  { key: 'deathRate', label: 'Смертность', icon: <Skull size={14} /> },
  { key: 'naturalGrowthRate', label: 'Ест. прирост', icon: <TrendingUp size={14} /> },
];

function formatPopulationTooltip(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)} млн`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)} тыс`;
  return String(value);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

const CustomTooltip = ({ active, payload, label, activeTab, unitMode }: {
  active?: boolean;
  payload?: { color: string; name: string; value: number }[];
  label?: string;
  activeTab: TabKey;
  unitMode: MetricUnitMode;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="text-gray-500 mb-2">{label} год</p>
      {payload
        .filter((p) => ['Среднее', 'Медиана'].includes(p.name))
        .map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }}></span>
            <span className="text-gray-600">{p.name}</span>
          </span>
          <span className="font-medium text-gray-800">
            {activeTab === 'population'
              ? formatPopulationTooltip(p.value)
              : unitMode === 'per_thousand'
                ? `${p.value.toFixed(1)} ‰`
                : `${Math.round(p.value).toLocaleString('ru')} чел.`}
          </span>
        </div>
      ))}
    </div>
  );
};

export function DynamicsChart({ data, unitMode }: DynamicsChartProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('population');
  const years = useMemo(() => [...new Set(data.map((d) => d.year))].sort(), [data]);

  const chartData = useMemo(() => {
    const valueForRecord = (record: MunicipalityRecord): number => {
      if (activeTab === 'population') return record.population;
      if (activeTab === 'birthRate') {
        return unitMode === 'per_thousand'
          ? record.birthRate
          : (record.birthRate * record.population) / 1000;
      }
      if (activeTab === 'deathRate') {
        return unitMode === 'per_thousand'
          ? record.deathRate
          : (record.deathRate * record.population) / 1000;
      }
      return unitMode === 'per_thousand'
        ? record.naturalGrowthRate
        : (record.naturalGrowthRate * record.population) / 1000;
    };

    return years.map((year) => {
      const records = data.filter((d) => d.year === year);
      const values = records.map(valueForRecord);
      if (!values.length) return { year: String(year) };

      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const med = percentile(values, 0.5);
      const p25 = percentile(values, 0.25);
      const p75 = percentile(values, 0.75);

      const roundFn = (v: number) =>
        activeTab === 'population'
          ? Math.round(v)
          : unitMode === 'per_thousand'
            ? Math.round(v * 10) / 10
            : Math.round(v);

      return {
        year: String(year),
        avg: roundFn(avg),
        median: roundFn(med),
        p25: roundFn(p25),
        p75: roundFn(p75),
      };
    });
  }, [data, years, activeTab, unitMode]);

  const yLabel = activeTab === 'population' ? 'Чел.' : unitMode === 'per_thousand' ? 'На 1000 чел.' : 'Чел.';

  const formatYAxis = (val: number) => {
    if (activeTab === 'population') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}М`;
      if (val >= 1000) return `${(val / 1000).toFixed(0)}к`;
      return String(val);
    }
    if (unitMode === 'per_thousand') return val.toFixed(1);
    return Math.round(val).toLocaleString('ru');
  };

  const tabInfo = {
    population: { desc: 'Средняя численность и разброс по муниципалитетам', unit: 'человек' },
    birthRate: { desc: 'Рождаемость: среднее и межквартильный коридор', unit: unitMode === 'per_thousand' ? 'на 1000 чел.' : 'чел.' },
    deathRate: { desc: 'Смертность: среднее и межквартильный коридор', unit: unitMode === 'per_thousand' ? 'на 1000 чел.' : 'чел.' },
    naturalGrowthRate: { desc: 'Естественный прирост: среднее и межквартильный коридор', unit: unitMode === 'per_thousand' ? 'на 1000 чел.' : 'чел.' },
  };

  const populationDynamics = useMemo(() => {
    if (years.length === 0) return null;
    const firstYear = years[0];
    const lastYear = years[years.length - 1];
    const first = data.filter((d) => d.year === firstYear);
    const last = data.filter((d) => d.year === lastYear);
    if (!first.length || !last.length) return null;
    const firstSum = first.reduce((sum, item) => sum + item.population, 0);
    const lastSum = last.reduce((sum, item) => sum + item.population, 0);
    const delta = lastSum - firstSum;
    const percent = firstSum ? (delta / firstSum) * 100 : 0;
    return { firstYear, lastYear, firstSum, lastSum, delta, percent };
  }, [data, years]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-gray-800">Динамика показателей</h2>
            <p className="text-xs text-gray-400 mt-0.5">{tabInfo[activeTab].desc}</p>
          </div>
          {populationDynamics && (
            <div
              className={`rounded-lg px-2.5 py-1.5 text-xs ${
                populationDynamics.delta >= 0
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-red-50 text-red-700 border border-red-100'
              }`}
            >
              <div className="flex items-center gap-1">
                {populationDynamics.delta >= 0 ? (
                  <TrendingUp size={12} />
                ) : (
                  <TrendingDown size={12} />
                )}
                {populationDynamics.firstYear}-{populationDynamics.lastYear}
              </div>
              <div className="font-medium mt-0.5">
                {populationDynamics.delta >= 0 ? '+' : ''}
                {populationDynamics.delta.toLocaleString('ru')} (
                {populationDynamics.percent >= 0 ? '+' : ''}
                {populationDynamics.percent.toFixed(2)}%)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-3 flex gap-2 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="px-2 py-4" style={{ height: 300, minHeight: 300 }}>
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Нет данных для отображения
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
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
                tickFormatter={formatYAxis}
                label={{
                  value: yLabel,
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 10, fill: '#9ca3af' },
                  offset: 10,
                }}
              />
              <Tooltip content={<CustomTooltip activeTab={activeTab} unitMode={unitMode} />} />
              <Area
                type="monotone"
                dataKey="p75"
                stroke="none"
                fill="#93c5fd"
                fillOpacity={0.2}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="p25"
                stroke="none"
                fill="#ffffff"
                fillOpacity={1}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="median"
                name="Медиана"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 2, fill: '#94a3b8' }}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="avg"
                name="Среднее"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 3, fill: '#2563eb' }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
