import { apiGet } from './client';
import { DemographyDataset, MunicipalityRecord, MunicipalityType } from '../data/types';

interface MunicipalityItem {
  id: number;
  name: string;
  region: string;
  type: string;
  area: number | null;
}

interface MunicipalityListResponse {
  items: MunicipalityItem[];
  total: number;
  limit: number;
  offset: number;
}

interface MunicipalityDataItem {
  id: number;
  municipality_id: number;
  year: number;
  population: number | null;
  birth_rate: number | null;
  death_rate: number | null;
  migration: number | null;
}

interface MunicipalityDataListResponse {
  items: MunicipalityDataItem[];
  total: number;
  limit: number;
  offset: number;
}

const MUNICIPALITIES_PAGE_SIZE = 500;
const MUNICIPALITY_DATA_PAGE_SIZE = 5000;

const LEGACY_ID_BY_NAME: Record<string, string> = {
  'Балашиха': 'm1',
  'Химки': 'm2',
  'Мытищи': 'm3',
  'Люберцы': 'm4',
  'Серпуховский р-н': 'm5',
  'Коломенский р-н': 'm6',
  'Можайский р-н': 'm7',
  'Краснодар': 'k1',
  'Сочи': 'k2',
  'Новороссийск': 'k3',
  'Анапа': 'k4',
  'Тимашевский р-н': 'k5',
  'Каневской р-н': 'k6',
  'Усть-Лабинский р-н': 'k7',
  'Екатеринбург': 's1',
  'Нижний Тагил': 's2',
  'Первоуральск': 's3',
  'Каменск-Уральский': 's4',
  'Сысертский р-н': 's5',
  'Алапаевский р-н': 's6',
  'Новосибирск': 'n1',
  'Бердск': 'n2',
  'Искитим': 'n3',
  'Маслянинский р-н': 'n4',
  'Барабинский р-н': 'n5',
  'Куйбышевский р-н': 'n6',
  'Казань': 't1',
  'Набережные Челны': 't2',
  'Нижнекамск': 't3',
  'Альметьевск': 't4',
  'Лаишевский р-н': 't5',
  'Пестречинский р-н': 't6',
  'Ростов-на-Дону': 'r1',
  'Таганрог': 'r2',
  'Шахты': 'r3',
  'Азовский р-н': 'r4',
  'Аксайский р-н': 'r5',
  'Семикаракорский р-н': 'r6',
  'Самара': 'sa1',
  'Тольятти': 'sa2',
  'Сызрань': 'sa3',
  'Кинельский р-н': 'sa4',
  'Похвистневский р-н': 'sa5',
};

function toUiId(item: MunicipalityItem): string {
  return LEGACY_ID_BY_NAME[item.name] ?? `mo${item.id}`;
}

function normalizeMunicipalityType(rawType: string): MunicipalityType {
  return rawType.trim().replace(/\s+/g, ' ');
}

export async function fetchDemographyDataset(): Promise<DemographyDataset> {
  const [municipalityItems, dataItems] = await Promise.all([
    fetchAllMunicipalities(),
    fetchAllMunicipalityData(),
  ]);

  const municipalityById = new Map<number, MunicipalityItem>();
  municipalityItems.forEach((municipality) => {
    municipalityById.set(municipality.id, municipality);
  });

  const lastKnownByMunicipality = new Map<
    number,
    { population?: number; birthRate?: number; deathRate?: number; migration?: number }
  >();

  const sortedDataItems = [...dataItems].sort(
    (a, b) => (a.municipality_id - b.municipality_id) || (a.year - b.year),
  );

  const records: MunicipalityRecord[] = sortedDataItems
    .map((dataItem) => {
      const municipality = municipalityById.get(dataItem.municipality_id);
      if (!municipality) return null;

      const lastKnown = lastKnownByMunicipality.get(dataItem.municipality_id) ?? {};

      const populationObserved = dataItem.population !== null;
      const birthRateObserved = dataItem.birth_rate !== null;
      const deathRateObserved = dataItem.death_rate !== null;
      const migrationObserved = dataItem.migration !== null;

      const populationRaw = dataItem.population ?? lastKnown.population ?? 0;
      const birthRateRaw = dataItem.birth_rate ?? lastKnown.birthRate ?? 0;
      const deathRateRaw = dataItem.death_rate ?? lastKnown.deathRate ?? 0;
      const migrationRaw = dataItem.migration ?? lastKnown.migration ?? 0;

      lastKnownByMunicipality.set(dataItem.municipality_id, {
        population: populationRaw,
        birthRate: birthRateRaw,
        deathRate: deathRateRaw,
        migration: migrationRaw,
      });

      const population = populationRaw;
      const area = municipality.area && municipality.area > 0 ? municipality.area : 0;
      const birthRate = birthRateRaw * 1000;
      const deathRate = deathRateRaw * 1000;
      const migration = migrationRaw * 1000;
      const naturalGrowthRate = (birthRateRaw - deathRateRaw) * 1000;
      const naturalGrowthPercent = (birthRateRaw - deathRateRaw) * 100;

      return {
        id: `${toUiId(municipality)}_${dataItem.year}`,
        municipalityId: municipality.id,
        name: municipality.name,
        region: municipality.region,
        type: normalizeMunicipalityType(municipality.type),
        year: dataItem.year,
        population,
        area,
        density: area > 0 ? Math.round(population / area) : 0,
        birthRate,
        deathRate,
        migration,
        naturalGrowthRate: Math.round(naturalGrowthRate * 10) / 10,
        naturalGrowthPercent: Math.round(naturalGrowthPercent * 100) / 100,
        populationObserved,
        birthRateObserved,
        deathRateObserved,
        migrationObserved,
      } satisfies MunicipalityRecord;
    })
    .filter((record): record is MunicipalityRecord => record !== null)
    .sort((a, b) => (a.year - b.year) || a.name.localeCompare(b.name, 'ru'));

  const years = [...new Set(records.map((record) => record.year))].sort((a, b) => a - b);
  const regions = [...new Set(records.map((record) => record.region))].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );

  return {
    allData: records,
    regions,
    years,
    minYear: years[0] ?? new Date().getFullYear(),
    maxYear: years[years.length - 1] ?? new Date().getFullYear(),
    municipalityCount: new Set(records.map((record) => record.municipalityId)).size,
  };
}

async function fetchAllMunicipalities(): Promise<MunicipalityItem[]> {
  const firstPage = await apiGet<MunicipalityListResponse>('/api/v1/municipalities', {
    limit: MUNICIPALITIES_PAGE_SIZE,
    offset: 0,
  });
  const items = [...firstPage.items];

  for (
    let offset = firstPage.limit;
    offset < firstPage.total;
    offset += firstPage.limit
  ) {
    const page = await apiGet<MunicipalityListResponse>('/api/v1/municipalities', {
      limit: firstPage.limit,
      offset,
    });
    items.push(...page.items);
  }

  return items;
}

async function fetchAllMunicipalityData(): Promise<MunicipalityDataItem[]> {
  const firstPage = await apiGet<MunicipalityDataListResponse>('/api/v1/municipality-data', {
    limit: MUNICIPALITY_DATA_PAGE_SIZE,
    offset: 0,
  });
  const items = [...firstPage.items];

  for (
    let offset = firstPage.limit;
    offset < firstPage.total;
    offset += firstPage.limit
  ) {
    const page = await apiGet<MunicipalityDataListResponse>('/api/v1/municipality-data', {
      limit: firstPage.limit,
      offset,
    });
    items.push(...page.items);
  }

  return items;
}
