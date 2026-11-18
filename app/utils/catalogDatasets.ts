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
export const CATALOG_LANGUAGES = [
  ...new Set(SUPPORTED_LOCALES.map((locale) => LOCALE_TO_API_MAPPING[locale] ?? locale)),
];
export const CATALOG_MANIFEST_KEY = 'neutral-catalog-v1-manifest';
export interface CatalogRelease {
  completedAt: number;
  overlaySha: string;
  entries: Record<string, { key: string; bytes: number; headers: Record<string, string> }>;
}
