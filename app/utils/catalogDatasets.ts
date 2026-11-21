import { LOCALE_TO_API_MAPPING } from '@/utils/constants';
import { SUPPORTED_LOCALES } from '@/utils/locales';
export const CATALOG_DATASETS = [
  'bootstrap',
  'tasks-core',
  'tasks-objectives',
  'tasks-rewards',
  'hideout',
  'items-lite',
  'items',
  'prestige',
  'editions',
  'map-spawns',
] as const;
export type CatalogDataset = (typeof CATALOG_DATASETS)[number];
// Uncompressed limits leave growth room above the verified 1.183 production release.
const KIB = 1024;
const MIB = KIB * KIB;
const EXPANDED_BYTE_LIMITS: Record<CatalogDataset | 'strings', number> = {
  bootstrap: 64 * KIB,
  'tasks-core': 8 * MIB,
  'tasks-objectives': 4 * MIB,
  'tasks-rewards': 2 * MIB,
  hideout: MIB,
  'items-lite': 16 * MIB,
  items: 64 * MIB,
  prestige: MIB,
  editions: MIB,
  'map-spawns': MIB,
  strings: 24 * MIB,
};
export function catalogByteLimit(scope: string): number {
  const dataset = scope.split('/')[0] ?? '';
  if (!Object.hasOwn(EXPANDED_BYTE_LIMITS, dataset)) return 0;
  return EXPANDED_BYTE_LIMITS[dataset as keyof typeof EXPANDED_BYTE_LIMITS];
}
export const CATALOG_LANGUAGES = [
  ...new Set(SUPPORTED_LOCALES.map((locale) => LOCALE_TO_API_MAPPING[locale] ?? locale)),
];
export const CATALOG_MANIFEST_KEY = 'neutral-catalog-v1-manifest';
export interface CatalogRelease {
  completedAt: number;
  overlaySha: string;
  entries: Record<string, { key: string; bytes: number; headers: Record<string, string> }>;
}
