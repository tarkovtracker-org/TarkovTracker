/**
 * Constants for the needed items page
 */
/** Items added per infinite-scroll batch; 24 fills whole rows at 2, 3, 4 and 6 columns. */
export const INFINITE_SCROLL_BATCH_SIZE = 24;
/** Root margin for infinite scroll intersection observer */
export const INFINITE_SCROLL_MARGIN = '600px';
/**
 * Entries rendered before scrolling: about two desktop screens of list rows, and whole rows of
 * tiles at 2, 3, 4 and 6 columns. Narrow screens render half, which still fills the viewport.
 */
export const INITIAL_RENDER_COUNT = { list: 30, grid: 24 } as const;
/** Filter type options */
export type NeededItemsFilterType = 'all' | 'tasks' | 'hideout' | 'completed';
/**
 * FIR (Found In Raid) filter options.
 * "Found In Raid" is a Tarkov game mechanic where items must be obtained during a raid
 * (not purchased from traders/flea market) to count for certain quest objectives.
 * - 'all': Show all items regardless of FIR status
 * - 'fir': Show only items that require Found In Raid status
 * - 'non-fir': Show only items that do NOT require Found In Raid status
 */
export type NeededItemsFirFilter = 'all' | 'fir' | 'non-fir';
export const NEEDED_ITEMS_FILTER_TYPES = ['all', 'tasks', 'hideout', 'completed'] as const;
export const NEEDED_ITEMS_SORT_BY = ['priority', 'name', 'category', 'count'] as const;
export const NEEDED_ITEMS_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type NeededItemsSortBy = (typeof NEEDED_ITEMS_SORT_BY)[number];
export type NeededItemsSortDirection = (typeof NEEDED_ITEMS_SORT_DIRECTIONS)[number];
export const isValidNeededItemsFilterType = (
  value: string | undefined
): value is NeededItemsFilterType =>
  typeof value === 'string' && NEEDED_ITEMS_FILTER_TYPES.includes(value as NeededItemsFilterType);
export const isValidNeededItemsSortBy = (value: string | undefined): value is NeededItemsSortBy =>
  typeof value === 'string' &&
  NEEDED_ITEMS_SORT_BY.includes(value as (typeof NEEDED_ITEMS_SORT_BY)[number]);
export const isValidNeededItemsSortDirection = (
  value: string | undefined
): value is NeededItemsSortDirection =>
  typeof value === 'string' &&
  NEEDED_ITEMS_SORT_DIRECTIONS.includes(value as (typeof NEEDED_ITEMS_SORT_DIRECTIONS)[number]);
