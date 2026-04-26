import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchDemographyDataset } from '../api/demography';
import { DemographyDataset, MunicipalityRecord } from './types';

interface DemographyContextValue extends DemographyDataset {
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const emptyDataset: DemographyDataset = {
  allData: [],
  regions: [],
  years: [],
  minYear: new Date().getFullYear(),
  maxYear: new Date().getFullYear(),
  municipalityCount: 0,
};

const DemographyContext = createContext<DemographyContextValue | null>(null);

export function DemographyProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<DemographyDataset>(emptyDataset);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextDataset = await fetchDemographyDataset();
      setDataset(nextDataset);
    } catch (err) {
      setDataset(emptyDataset);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<DemographyContextValue>(
    () => ({
      ...dataset,
      isLoading,
      error,
      refresh: load,
    }),
    [dataset, isLoading, error, load],
  );

  return <DemographyContext.Provider value={value}>{children}</DemographyContext.Provider>;
}

export function useDemographyData(): DemographyContextValue {
  const context = useContext(DemographyContext);
  if (!context) {
    throw new Error('useDemographyData must be used within DemographyProvider');
  }
  return context;
}

export function useFilteredData(filters: {
  region: string;
  type: string;
  yearFrom: number;
  yearTo: number;
}): MunicipalityRecord[] {
  const { allData } = useDemographyData();

  return useMemo(() => {
    return allData.filter((record) => {
      if (filters.region !== 'all' && record.region !== filters.region) return false;
      if (filters.type !== 'all' && record.type !== filters.type) return false;
      if (record.year < filters.yearFrom || record.year > filters.yearTo) return false;
      return true;
    });
  }, [allData, filters.region, filters.type, filters.yearFrom, filters.yearTo]);
}
