import { useState, useMemo, useEffect } from 'react';
import { FiltersBar, FilterState } from '../components/FiltersBar';
import { MunicipalityTable } from '../components/MunicipalityTable';
import { DynamicsChart } from '../components/DynamicsChart';
import { HeatMap } from '../components/HeatMap';
import { useDemographyData } from '../data/DemographyProvider';
import { MetricUnitMode } from '../data/types';

export function Dashboard() {
  const {
    allData,
    regions,
    minYear,
    maxYear,
    isLoading,
    error,
  } = useDemographyData();

  const [filters, setFilters] = useState<FilterState>({
    region: 'all',
    type: 'all',
    yearFrom: minYear,
    yearTo: maxYear,
  });
  const [unitMode, setUnitMode] = useState<MetricUnitMode>('per_thousand');

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      yearFrom: minYear,
      yearTo: maxYear,
      region: prev.region === 'all' || regions.includes(prev.region) ? prev.region : 'all',
    }));
  }, [minYear, maxYear, regions]);

  const filteredData = useMemo(() => {
    return allData.filter((d) => {
      if (filters.region !== 'all' && d.region !== filters.region) return false;
      if (filters.type !== 'all' && d.type !== filters.type) return false;
      if (d.year < filters.yearFrom || d.year > filters.yearTo) return false;
      return true;
    });
  }, [filters]);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">
      {/* Filters */}
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        regions={regions}
        minYear={minYear}
        maxYear={maxYear}
      />

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

      {/* Table + Chart Row */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Единицы для рождаемости, смертности и миграции
        </p>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setUnitMode('per_thousand')}
            className={`px-3 py-1.5 text-sm ${
              unitMode === 'per_thousand' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            ‰ на 1000
          </button>
          <button
            onClick={() => setUnitMode('absolute')}
            className={`px-3 py-1.5 text-sm border-l border-gray-200 ${
              unitMode === 'absolute' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            чел.
          </button>
        </div>
      </div>

      {/* Table + Chart Row */}
      <div className="grid grid-cols-1 xl:grid-cols-[45%_1fr] gap-5" style={{ height: '460px' }}>
        <MunicipalityTable data={filteredData} unitMode={unitMode} />
        <DynamicsChart data={filteredData} unitMode={unitMode} />
      </div>

      {/* Heat Map */}
      <HeatMap data={filteredData} />
    </div>
  );
}
