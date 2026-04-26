import { Filter, X } from 'lucide-react';

export interface FilterState {
  region: string;
  type: string;
  yearFrom: number;
  yearTo: number;
}

interface FiltersBarProps {
  filters: FilterState;
  regions: string[];
  minYear: number;
  maxYear: number;
  onChange: (filters: FilterState) => void;
}

export function FiltersBar({ filters, regions, minYear, maxYear, onChange }: FiltersBarProps) {
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const handleReset = () => {
    onChange({ region: 'all', type: 'all', yearFrom: minYear, yearTo: maxYear });
  };

  const hasActiveFilters =
    filters.region !== 'all' || filters.type !== 'all' ||
    filters.yearFrom !== minYear || filters.yearTo !== maxYear;

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex flex-wrap items-center gap-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500 shrink-0">
        <Filter size={16} />
        <span className="text-sm text-gray-500">Фильтры</span>
      </div>

      {/* Region */}
      <div className="flex flex-col gap-1 min-w-[200px]">
        <label className="text-xs text-gray-500">Регион</label>
        <select
          value={filters.region}
          onChange={(e) => onChange({ ...filters, region: e.target.value })}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
        >
          <option value="all">Все регионы</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Type */}
      <div className="flex flex-col gap-1 min-w-[200px]">
        <label className="text-xs text-gray-500">Тип МО</label>
        <select
          value={filters.type}
          onChange={(e) => onChange({ ...filters, type: e.target.value })}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
        >
          <option value="all">Все типы</option>
          <option value="city">Городской округ</option>
          <option value="municipality">Муниципальный район</option>
        </select>
      </div>

      {/* Year Range */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Период</label>
        <div className="flex items-center gap-2">
          <select
            value={filters.yearFrom}
            onChange={(e) => onChange({ ...filters, yearFrom: Number(e.target.value) })}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} disabled={y > filters.yearTo}>{y}</option>
            ))}
          </select>
          <span className="text-gray-400 text-sm">—</span>
          <select
            value={filters.yearTo}
            onChange={(e) => onChange({ ...filters, yearTo: Number(e.target.value) })}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} disabled={y < filters.yearFrom}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Reset */}
      {hasActiveFilters && (
        <button
          onClick={handleReset}
          className="mt-4 flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <X size={14} />
          Сбросить
        </button>
      )}

      {/* Active filter badges */}
      <div className="ml-auto flex items-center gap-2 flex-wrap">
        {filters.region !== 'all' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">
            {filters.region}
            <button onClick={() => onChange({ ...filters, region: 'all' })}>
              <X size={11} />
            </button>
          </span>
        )}
        {filters.type !== 'all' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs">
            {filters.type === 'city' ? 'Городской округ' : 'Муниципальный район'}
            <button onClick={() => onChange({ ...filters, type: 'all' })}>
              <X size={11} />
            </button>
          </span>
        )}
        {(filters.yearFrom !== minYear || filters.yearTo !== maxYear) && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-xs">
            {filters.yearFrom}–{filters.yearTo}
            <button onClick={() => onChange({ ...filters, yearFrom: minYear, yearTo: maxYear })}>
              <X size={11} />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
