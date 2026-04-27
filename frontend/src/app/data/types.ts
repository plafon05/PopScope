export type MunicipalityType = string;
export type MetricUnitMode = 'per_thousand' | 'absolute';

export interface MunicipalityRecord {
  id: string;
  municipalityId: number;
  name: string;
  region: string;
  type: MunicipalityType;
  year: number;
  population: number;
  area: number;
  density: number;
  birthRate: number;
  deathRate: number;
  migration: number;
  naturalGrowthRate: number;
  naturalGrowthPercent: number;
  populationObserved: boolean;
  birthRateObserved: boolean;
  deathRateObserved: boolean;
  migrationObserved: boolean;
}

export interface DemographyDataset {
  allData: MunicipalityRecord[];
  regions: string[];
  years: number[];
  minYear: number;
  maxYear: number;
  municipalityCount: number;
}
