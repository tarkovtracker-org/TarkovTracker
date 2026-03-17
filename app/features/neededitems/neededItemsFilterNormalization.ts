import {
  NEEDED_ITEMS_FILTER_TYPES,
  NEEDED_ITEMS_SORT_BY,
  NEEDED_ITEMS_SORT_DIRECTIONS,
  type NeededItemsFilterType,
  type NeededItemsFirFilter,
  type NeededItemsSortBy,
  type NeededItemsSortDirection,
} from '@/features/neededitems/neededitems-constants';
const NEEDED_ITEMS_CARD_STYLES = ['compact', 'expanded'] as const;
const NEEDED_ITEMS_FIR_FILTERS = ['all', 'fir', 'non-fir'] as const;
const NEEDED_ITEMS_VIEW_MODES = ['list', 'grid'] as const;
const extractNormalizationCandidate = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value?: unknown }).value;
  }
  return null;
};
const normalizeEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  const candidate = extractNormalizationCandidate(value);
  if (typeof candidate === 'string' && allowed.includes(candidate as T)) {
    return candidate as T;
  }
  return fallback;
};
export type NeededItemsCardStyle = (typeof NEEDED_ITEMS_CARD_STYLES)[number];
export type NeededItemsViewMode = (typeof NEEDED_ITEMS_VIEW_MODES)[number];
export const normalizeNeededItemsCardStyle = (value: unknown): NeededItemsCardStyle =>
  normalizeEnum(value, NEEDED_ITEMS_CARD_STYLES, 'expanded');
export const normalizeNeededItemsFilterType = (value: unknown): NeededItemsFilterType =>
  normalizeEnum(value, NEEDED_ITEMS_FILTER_TYPES, 'all');
export const normalizeNeededItemsFirFilter = (value: unknown): NeededItemsFirFilter =>
  normalizeEnum(value, NEEDED_ITEMS_FIR_FILTERS, 'all');
export const normalizeNeededItemsSortBy = (value: unknown): NeededItemsSortBy =>
  normalizeEnum(value, NEEDED_ITEMS_SORT_BY, 'priority');
export const normalizeNeededItemsSortDirection = (value: unknown): NeededItemsSortDirection =>
  normalizeEnum(value, NEEDED_ITEMS_SORT_DIRECTIONS, 'desc');
export const normalizeNeededItemsViewMode = (value: unknown): NeededItemsViewMode =>
  normalizeEnum(value, NEEDED_ITEMS_VIEW_MODES, 'grid');
