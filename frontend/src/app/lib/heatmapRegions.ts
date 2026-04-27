import { MunicipalityRecord } from '../data/types';

export type RegionEntry = {
  region: string;
  density: number;
  normalized: string;
  tokens: Set<string>;
};

const MATCH_MIN_SCORE = 0.5;
const MATCH_MIN_MARGIN = 0.15;

const REGION_NAME_ALIASES: Record<string, string> = {
  'дагестан': 'дагестан',
  'республика дагестан': 'дагестан',
  'dagestan': 'дагестан',
  'daghestan': 'дагестан',
  'republic of dagestan': 'дагестан',
  'чувашия': 'чувашская республика',
  'chuvashia': 'чувашская республика',
  'chuvash republic': 'чувашская республика',
  'санкт петербург': 'санкт петербург',
  'saint petersburg': 'санкт петербург',
  'st petersburg': 'санкт петербург',
  'sankt peterburg': 'санкт петербург',
  'yakutia': 'якутия',
  'republic of sakha': 'якутия',
  'sakha yakutia': 'якутия',
  'moscow city': 'москва',
  'moscow oblast': 'московская область',
  'chukotka': 'чукотский автономный округ',
  'chukotsky autonomous okrug': 'чукотский автономный округ',
  'khanty mansiysk autonomous okrug': 'ханты мансийский автономный округ югра',
  'yamalo nenets autonomous okrug': 'ямало ненецкий автономный округ',
};

const REGION_FRAGMENT_ALIASES: Array<[string, string]> = [
  ['дагестан', 'дагестан'],
  ['dagestan', 'дагестан'],
  ['daghestan', 'дагестан'],
  ['чуваш', 'чувашская республика'],
  ['chuvash', 'чувашская республика'],
  ['saint petersburg', 'санкт петербург'],
  ['st petersburg', 'санкт петербург'],
  ['yakutia', 'якутия'],
  ['sakha', 'якутия'],
  ['chukot', 'чукотский автономный округ'],
];

const STOP_TOKENS = new Set([
  'республика',
  'область',
  'край',
  'автономный',
  'автономная',
  'округ',
  'федерального',
  'значения',
  'город',
  'г',
  'имени',
]);

function normalizeRegionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[().,"'`«»]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalRegionName(name: string): string {
  const normalized = normalizeRegionName(name);
  if (REGION_NAME_ALIASES[normalized]) return REGION_NAME_ALIASES[normalized];
  for (const [fragment, canonical] of REGION_FRAGMENT_ALIASES) {
    if (normalized.includes(fragment)) return canonical;
  }
  return normalized;
}

function regionTokens(name: string): Set<string> {
  const tokens = canonicalRegionName(name)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token && !STOP_TOKENS.has(token));
  return new Set(tokens);
}

function tokenSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const tokenRoot = (token: string): string => (token.length <= 6 ? token : token.slice(0, 6));
  const aRoots = new Set(Array.from(a).map(tokenRoot));
  const bRoots = new Set(Array.from(b).map(tokenRoot));
  let intersection = 0;
  aRoots.forEach((root) => {
    if (bRoots.has(root)) intersection += 1;
  });
  const union = aRoots.size + bRoots.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function buildRegionEntriesFromData(data: MunicipalityRecord[]): RegionEntry[] {
  const latestYearByRegion = new Map<string, number>();
  data.forEach((row) => {
    if (row.population <= 0 || row.area <= 0) return;
    const current = latestYearByRegion.get(row.region) ?? 0;
    if (row.year > current) latestYearByRegion.set(row.region, row.year);
  });

  const regionPopulation = new Map<string, number>();
  const regionArea = new Map<string, number>();

  data.forEach((row) => {
    const latestRegionYear = latestYearByRegion.get(row.region);
    if (!latestRegionYear || row.year !== latestRegionYear) return;
    if (row.population <= 0 || row.area <= 0) return;
    regionPopulation.set(row.region, (regionPopulation.get(row.region) ?? 0) + row.population);
    regionArea.set(row.region, (regionArea.get(row.region) ?? 0) + row.area);
  });

  const entries: RegionEntry[] = [];
  regionPopulation.forEach((population, region) => {
    const area = regionArea.get(region) ?? 0;
    if (area <= 0) return;
    entries.push({
      region,
      density: population / area,
      normalized: canonicalRegionName(region),
      tokens: regionTokens(region),
    });
  });
  return entries;
}

export function resolveRegionDensityByName(
  featureName: string,
  entries: RegionEntry[],
): number | null {
  if (!featureName) return null;
  const normalizedFeature = canonicalRegionName(featureName);
  const featureTokens = regionTokens(featureName);
  const byName = new Map(entries.map((entry) => [entry.normalized, entry.density] as const));

  const direct = byName.get(normalizedFeature);
  if (typeof direct === 'number') return direct;

  let best: RegionEntry | null = null;
  let bestScore = 0;
  let secondScore = 0;
  for (const entry of entries) {
    const score = tokenSimilarity(entry.tokens, featureTokens);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = entry;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  const isReliable = best !== null && bestScore >= MATCH_MIN_SCORE && (bestScore - secondScore) >= MATCH_MIN_MARGIN;
  return isReliable && best ? best.density : null;
}
