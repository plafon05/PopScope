import { useState, useMemo } from 'react';
import { MetricUnitMode, MunicipalityRecord } from '../data/types';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import {
  aggregateMunicipalities,
  average,
  formatPopulation,
  round,
} from '../lib/demography';

interface MunicipalityTableProps {
  data: MunicipalityRecord[];
  unitMode: MetricUnitMode;
}

type SortField =
  | 'name'
  | 'region'
  | 'population'
  | 'naturalGrowthPercent'
  | 'birthRate'
  | 'deathRate'
  | 'migration';
type SortDir = 'asc' | 'desc';

function aggregateByMunicipality(data: MunicipalityRecord[], unitMode: MetricUnitMode) {
  return aggregateMunicipalities(data).map(({ id, name, region, type, records }) => {
    const toAbsolute = (ratePerThousand: number, population: number) => (ratePerThousand * population) / 1000;
    const birthValues = records.map((r) =>
      unitMode === 'per_thousand' ? r.birthRate : toAbsolute(r.birthRate, r.population),
    );
    const deathValues = records.map((r) =>
      unitMode === 'per_thousand' ? r.deathRate : toAbsolute(r.deathRate, r.population),
    );
    const migrationValues = records.map((r) =>
      unitMode === 'per_thousand' ? r.migration : toAbsolute(r.migration, r.population),
    );

    return {
      id,
      name,
      region,
      type,
      population: round(average(records.map((r) => r.population))),
      birthRate: unitMode === 'per_thousand' ? round(average(birthValues), 1) : round(average(birthValues)),
      deathRate: unitMode === 'per_thousand' ? round(average(deathValues), 1) : round(average(deathValues)),
      migration: unitMode === 'per_thousand' ? round(average(migrationValues), 1) : round(average(migrationValues)),
      naturalGrowthPercent: round(
        average(records.map((r) => r.naturalGrowthPercent)),
        2,
      ),
    };
  });
}

function getNaturalGrowthStyle(value: number) {
  if (value > 0.1) return { row: 'bg-emerald-50 hover:bg-emerald-100', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200' };
  if (value > -0.05) return { row: 'bg-amber-50 hover:bg-amber-100', badge: 'bg-amber-100 text-amber-700 border border-amber-200' };
  if (value > -0.2) return { row: 'bg-orange-50 hover:bg-orange-100', badge: 'bg-orange-100 text-orange-700 border border-orange-200' };
  return { row: 'bg-red-50 hover:bg-red-100', badge: 'bg-red-100 text-red-700 border border-red-200' };
}

export function MunicipalityTable({ data, unitMode }: MunicipalityTableProps) {
  const [sortField, setSortField] = useState<SortField>('naturalGrowthPercent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const aggregated = useMemo(() => aggregateByMunicipality(data, unitMode), [data, unitMode]);

  const sorted = useMemo(() => {
    return [...aggregated].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal, 'ru') : bVal.localeCompare(aVal, 'ru');
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [aggregated, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={13} className="text-gray-300 ml-1 shrink-0" />;
    return sortDir === 'asc'
      ? <ArrowUp size={13} className="text-blue-500 ml-1 shrink-0" />
      : <ArrowDown size={13} className="text-blue-500 ml-1 shrink-0" />;
  };

  const Th = ({ field, label, className = '' }: { field: SortField; label: string; className?: string }) => (
    <th
      className={`px-3 py-3 text-left text-xs text-gray-500 font-medium cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap ${className}`}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center">
        {label}
        <SortIcon field={field} />
      </span>
    </th>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-gray-800">Муниципальные образования</h2>
          <p className="text-xs text-gray-400 mt-0.5">{sorted.length} объектов · среднее за период</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300 inline-block"></span>
            <span className="text-gray-500">Прирост</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block"></span>
            <span className="text-gray-500">~0</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-300 inline-block"></span>
            <span className="text-gray-500">Убыль</span>
          </span>
        </div>
      </div>

      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
            <tr>
              <Th field="name" label="Название" className="pl-4 min-w-[140px]" />
              <Th field="region" label="Регион" className="min-w-[130px]" />
              <th className="px-3 py-3 text-left text-xs text-gray-500 font-medium whitespace-nowrap">Тип</th>
              <Th field="population" label="Население" />
              <Th field="naturalGrowthPercent" label="Ест. прирост, %" />
              <Th field="birthRate" label={unitMode === 'per_thousand' ? 'Рождаемость, ‰' : 'Рождаемость, чел.'} />
              <Th field="deathRate" label={unitMode === 'per_thousand' ? 'Смертность, ‰' : 'Смертность, чел.'} />
              <Th field="migration" label={unitMode === 'per_thousand' ? 'Миграция, ‰' : 'Миграция, чел.'} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const style = getNaturalGrowthStyle(row.naturalGrowthPercent);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 transition-colors ${style.row} ${i % 2 === 0 ? '' : ''}`}
                >
                  <td className="px-3 py-2.5 pl-4 font-medium text-gray-800 whitespace-nowrap">{row.name}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{row.region}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${row.type === 'city' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                      {row.type === 'city' ? 'ГО' : 'МР'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{formatPopulation(row.population)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${style.badge}`}>
                      {row.naturalGrowthPercent > 0 ? '+' : ''}{row.naturalGrowthPercent.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                    {unitMode === 'per_thousand' ? row.birthRate.toFixed(1) : row.birthRate.toLocaleString('ru')}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                    {unitMode === 'per_thousand' ? row.deathRate.toFixed(1) : row.deathRate.toLocaleString('ru')}
                  </td>
                  <td
                    className={`px-3 py-2.5 whitespace-nowrap font-medium ${
                      row.migration >= 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {row.migration >= 0 ? '+' : ''}
                    {unitMode === 'per_thousand' ? row.migration.toFixed(1) : row.migration.toLocaleString('ru')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
