/**
 * Constants for the needed items page
 */
/** Number of items to load per infinite-scroll batch */
export const INFINITE_SCROLL_BATCH_SIZE = 12;
/** Root margin for infinite scroll intersection observer */
export const INFINITE_SCROLL_MARGIN = '600px';
/** Default initial render count before responsive adjustments */
export const DEFAULT_INITIAL_RENDER_COUNT = 12;
/**
 * Screen size multipliers for initial render count.
 * These are multiplicative factors applied to a base render count.
 *
 * Usage formula at runtime:
 *   viewAdjusted = viewMode === 'grid' ? DEFAULT_INITIAL_RENDER_COUNT * SCREEN_SIZE_MULTIPLIERS.gridView : DEFAULT_INITIAL_RENDER_COUNT
 *   finalCount = Math.round(viewAdjusted * SCREEN_SIZE_MULTIPLIERS.xs) // when xs screen
 *   finalCount = Math.round(viewAdjusted * SCREEN_SIZE_MULTIPLIERS.belowMd) // when belowMd screen
 *
 * Note: DEFAULT_INITIAL_RENDER_COUNT (currently 12) is the base value used in these calculations.
 * Only one screen size multiplier (xs or belowMd) is applied per calculation.
 */
export const SCREEN_SIZE_MULTIPLIERS = {
  /** Multiplier for grid view vs list view */
  gridView: 1.4,
  /** Multiplier for extra small screens */
  xs: 0.6,
  /** Multiplier for below medium screens */
  belowMd: 0.8,
} as const;
/**
 * Minimum render counts for small screens.
 * These are lower bounds applied AFTER multiplication to ensure a minimum number of items render.
 *
 * Usage formula at runtime:
 *   finalCount = Math.max(MIN_RENDER_COUNTS.xs, computedCount) // when xs screen
 *   finalCount = Math.max(MIN_RENDER_COUNTS.belowMd, computedCount) // when belowMd screen
 */
export const MIN_RENDER_COUNTS = {
  xs: 6,
  belowMd: 8,
} as const;
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
