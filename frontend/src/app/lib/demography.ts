import { MunicipalityRecord, MunicipalityType } from '../data/types';

export interface AggregatedMunicipality {
  id: string;
  name: string;
  region: string;
  type: MunicipalityType;
  records: MunicipalityRecord[];
}

export function getMunicipalityId(recordId: string): string {
  return recordId.split('_')[0];
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatPopulation(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} млн`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} тыс`;
  return String(Math.round(value));
}

export function aggregateMunicipalities(
  data: MunicipalityRecord[],
): AggregatedMunicipality[] {
  const grouped = new Map<string, MunicipalityRecord[]>();

  data.forEach((record) => {
    const municipalityId = getMunicipalityId(record.id);
    const bucket = grouped.get(municipalityId);

    if (bucket) {
      bucket.push(record);
      return;
    }

    grouped.set(municipalityId, [record]);
  });

  return Array.from(grouped.entries()).map(([id, records]) => {
    const last = records[records.length - 1];

    return {
      id,
      name: last.name,
      region: last.region,
      type: last.type,
      records,
    };
  });
}
