/**
 * Overlay utility for applying tarkov-data-overlay corrections to tarkov.dev API data.
 *
 * Fetches overlay from GitHub and applies corrections to API responses.
 * The overlay contains corrections for incorrect data in tarkov.dev (e.g., wrong minPlayerLevel values).
 *
 * Deployment Note: Module-level cache persists across requests in long-running Node.js processes
 * but resets on cold starts in serverless/edge platforms. See fetchOverlay for TTL and fallback logic.
 */
import { deepMerge, isPlainObject } from './deepMerge';
import { createLogger } from './logger';
import {
  inferFoundInRaid,
  inferObjectiveType,
  normalizeObjectiveList,
} from './objectiveTypeInferrer';
const logger = createLogger('Overlay');
// Overlay data structure
interface OverlayData {
  tasks?: Record<string, Record<string, unknown>>;
  tasksAdd?: Record<string, Record<string, unknown>>;
  items?: Record<string, Record<string, unknown>>;
  traders?: Record<string, Record<string, unknown>>;
  hideout?: Record<string, Record<string, unknown>>;
  editions?: Record<string, unknown>;
  $meta?: {
    version: string;
    generated: string;
    sha256: string;
  };
}
type OverlayStatus = 'fresh' | 'cached' | 'stale' | 'missing';
export interface OverlayMeta {
  status: OverlayStatus;
  version?: string;
  generated?: string;
  sha256?: string;
  sourceUrl: string;
  fetchedAt?: string;
  cacheAgeMs?: number;
  error?: string;
}
// Module-level cache behavior: cachedOverlay and cacheTimestamp persist across requests in
// long-running Node.js processes but reset on cold starts in serverless/edge platforms.
// Features a 1-hour TTL (OVERLAY_CACHE_TTL) and falls back to stale data on fetch errors.
// OVERLAY_URL can be overridden by the environment variable.
let cachedOverlay: OverlayData | null = null;
let cacheTimestamp = 0;
const OVERLAY_CACHE_TTL = 3600000; // 1 hour in milliseconds
const FETCH_TIMEOUT_MS = 5000; // 5 seconds
// GitHub raw URL for the overlay
// Note: Using raw.githubusercontent.com directly until jsDelivr cache propagates
const OVERLAY_URL =
  process.env.OVERLAY_URL?.trim() ||
  'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay.json';
const OVERLAY_CACHE_BUSTER = process.env.OVERLAY_CACHE_BUSTER?.trim();
const OVERLAY_URL_WITH_BUSTER = OVERLAY_CACHE_BUSTER
  ? `${OVERLAY_URL}${OVERLAY_URL.includes('?') ? '&' : '?'}v=${encodeURIComponent(
      OVERLAY_CACHE_BUSTER
    )}`
  : OVERLAY_URL;
let lastOverlayMeta: OverlayMeta = {
  status: 'missing',
  sourceUrl: OVERLAY_URL_WITH_BUSTER,
};
/**
 * Validate overlay data structure
 */
function isValidOverlayData(data: unknown): data is OverlayData {
  if (!data || typeof data !== 'object') return false;
  const overlay = data as OverlayData;
  // Check for required $meta field with version
  if (!overlay.$meta || typeof overlay.$meta !== 'object') {
    logger.warn('Invalid overlay: missing $meta');
    return false;
  }
  if (typeof overlay.$meta.version !== 'string') {
    logger.warn('Invalid overlay: missing or invalid $meta.version');
    return false;
  }
  // Validate optional entity collections are records if present
  const collections = ['tasks', 'tasksAdd', 'items', 'traders', 'hideout'] as const;
  for (const collection of collections) {
    if (
      overlay[collection] !== undefined &&
      (typeof overlay[collection] !== 'object' || overlay[collection] === null)
    ) {
      logger.warn(`Invalid overlay: ${collection} is not an object`);
      return false;
    }
  }
  return true;
}
function buildOverlayMeta(
  overlay: OverlayData | null,
  status: OverlayStatus,
  extra?: Partial<OverlayMeta>
): OverlayMeta {
  return {
    status,
    version: overlay?.$meta?.version,
    generated: overlay?.$meta?.generated,
    sha256: overlay?.$meta?.sha256,
    sourceUrl: OVERLAY_URL_WITH_BUSTER,
    ...extra,
  };
}
/**
 * Fetch the overlay data from CDN (with caching)
 */
async function fetchOverlay(
  forceRefresh: boolean = false
): Promise<{ overlay: OverlayData | null; meta: OverlayMeta }> {
  const now = Date.now();
  // Return cached overlay if still valid
  if (!forceRefresh && cachedOverlay && now - cacheTimestamp < OVERLAY_CACHE_TTL) {
    lastOverlayMeta = buildOverlayMeta(cachedOverlay, 'cached', {
      cacheAgeMs: now - cacheTimestamp,
    });
    return { overlay: cachedOverlay, meta: lastOverlayMeta };
  }
  try {
    // Set up abort controller with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(OVERLAY_URL_WITH_BUSTER, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        logger.warn(`Failed to fetch overlay: ${response.status}`);
        lastOverlayMeta = buildOverlayMeta(cachedOverlay, cachedOverlay ? 'stale' : 'missing', {
          error: `HTTP ${response.status}`,
        });
        return { overlay: cachedOverlay, meta: lastOverlayMeta };
      }
      const parsedData = await response.json();
      // Validate the parsed data before caching
      if (!isValidOverlayData(parsedData)) {
        logger.warn('Fetched overlay failed validation, using stale cache');
        lastOverlayMeta = buildOverlayMeta(cachedOverlay, cachedOverlay ? 'stale' : 'missing', {
          error: 'validation_failed',
        });
        return { overlay: cachedOverlay, meta: lastOverlayMeta };
      }
      cachedOverlay = parsedData;
      cacheTimestamp = now;
      logger.info(`Loaded overlay v${cachedOverlay.$meta?.version}`);
      lastOverlayMeta = buildOverlayMeta(cachedOverlay, 'fresh', {
        fetchedAt: new Date(now).toISOString(),
        cacheAgeMs: 0,
      });
      return { overlay: cachedOverlay, meta: lastOverlayMeta };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn(`Fetch timeout after ${FETCH_TIMEOUT_MS}ms`);
    } else {
      logger.warn('Error fetching overlay:', error);
    }
    const message = error instanceof Error ? error.message : String(error);
    lastOverlayMeta = buildOverlayMeta(cachedOverlay, cachedOverlay ? 'stale' : 'missing', {
      error: message,
    });
    return { overlay: cachedOverlay, meta: lastOverlayMeta };
  }
}
/**
 * Apply overlay corrections to an array of entities
 * Filters out entities marked as disabled after applying corrections
 */
type ApplyEntityOverlayOptions = {
  logLabel?: string;
  /** If true, log even when appliedCount and disabledCount are both zero. Default: true */
  logEvenWhenZero?: boolean;
};
function applyEntityOverlay<T extends { id: string }>(
  entities: T[],
  corrections: Record<string, Record<string, unknown>> | undefined,
  options: ApplyEntityOverlayOptions = {}
): T[] {
  if (!corrections || !entities) return entities;
  let appliedCount = 0;
  let disabledCount = 0;
  const result = entities
    .map((entity) => {
      const correction = corrections[entity.id];
      if (correction) {
        appliedCount++;
        logger.debug(`Applying correction to ${entity.id}:`, correction);
        // Deep merge the correction into the entity (recursively merges nested objects)
        return deepMerge(entity as Record<string, unknown>, correction) as T;
      }
      return entity;
    })
    .filter((entity) => {
      // Filter out entities marked as disabled in the overlay
      const disabled = (entity as Record<string, unknown>).disabled;
      if (disabled === true) {
        disabledCount++;
        logger.debug(`Filtering out disabled entity: ${entity.id}`);
        return false;
      }
      return true;
    });
  const logLabel = options.logLabel ? ` (${options.logLabel})` : '';
  // Log by default unless logEvenWhenZero is explicitly false and counts are zero
  const shouldLog = appliedCount > 0 || disabledCount > 0 || options.logEvenWhenZero !== false;
  if (shouldLog) {
    logger.info(
      `Applied ${appliedCount} corrections out of ${Object.keys(corrections).length} available${logLabel}`
    );
    if (disabledCount > 0) {
      logger.info(`Filtered out ${disabledCount} disabled entities${logLabel}`);
    }
  }
  return result;
}
type ObjectiveAddEntry = Record<string, unknown>;
const DEFAULT_OVERLAY_OBJECTIVE_TYPE = 'giveItem';
const DEFAULT_OVERLAY_OBJECTIVE_COUNT = 1;
function expandObjectiveAdditions(additions: unknown[]): ObjectiveAddEntry[] {
  const expanded: ObjectiveAddEntry[] = [];
  for (const [index, entry] of additions.entries()) {
    if (!isPlainObject(entry)) continue;
    const baseId = typeof entry.id === 'string' ? entry.id : `overlay-objective-${index}`;
    const items = Array.isArray(entry.items) ? entry.items.filter(isPlainObject) : [];
    const description =
      typeof entry.description === 'string'
        ? entry.description
        : 'Hand over the found in raid item';
    const foundInRaid = inferFoundInRaid(description, entry);
    const count = typeof entry.count === 'number' ? entry.count : DEFAULT_OVERLAY_OBJECTIVE_COUNT;
    const inferredType = inferObjectiveType(entry);
    const normalizedType =
      typeof inferredType === 'string' && inferredType.trim().length > 0
        ? inferredType.trim()
        : undefined;
    const objectiveType =
      normalizedType ?? (items.length > 0 ? DEFAULT_OVERLAY_OBJECTIVE_TYPE : undefined);
    // Expand multi-item objectives into individual objectives
    if (!entry.type && items.length > 1) {
      for (const [itemIndex, item] of items.entries()) {
        const itemObj = item as Record<string, unknown>;
        const itemId = typeof itemObj.id === 'string' ? itemObj.id : `item-${itemIndex}`;
        const itemName = typeof itemObj.name === 'string' ? itemObj.name : 'item';
        expanded.push({
          ...entry,
          id: `${baseId}:${itemId}`,
          type: objectiveType ?? DEFAULT_OVERLAY_OBJECTIVE_TYPE,
          count,
          foundInRaid,
          description: `Hand over the found in raid item: ${itemName}`,
          items: [item],
        });
      }
      continue;
    }
    // Validation check: objectiveType should have been determined above via normalizedType
    // (inferred from entry.type or description) or via items.length fallback. If still
    // undefined, the objective (baseId) is missing required type information and must be skipped.
    if (objectiveType === undefined) {
      logger.warn(
        `Skipping overlay objective ${baseId}: missing type and unable to infer objective type`
      );
      continue;
    }
    expanded.push({
      ...entry,
      type: objectiveType,
      count,
      foundInRaid,
    });
  }
  return expanded;
}
function applyTaskObjectiveAdditions<T extends { id: string }>(task: T): T {
  if (!isPlainObject(task)) return task;
  const obj = task as Record<string, unknown>;
  const additions = Array.isArray(obj.objectivesAdd) ? obj.objectivesAdd : [];
  if (additions.length === 0) return task;
  const existing = Array.isArray(obj.objectives) ? obj.objectives : [];
  const expanded = expandObjectiveAdditions(additions);
  if (expanded.length === 0) return task;
  const { objectivesAdd, ...rest } = obj;
  return {
    ...(rest as T),
    objectives: [...existing, ...expanded],
  };
}
type OverlayTaskAddition = Record<string, unknown> & { id: string };
function normalizeTaskAdditions(
  additions: Record<string, Record<string, unknown>> | undefined
): OverlayTaskAddition[] {
  if (!additions) return [];
  return Object.values(additions)
    .filter((entry): entry is Record<string, unknown> & { id: string } => {
      return isPlainObject(entry) && typeof entry.id === 'string' && entry.disabled !== true;
    })
    .map((entry) => {
      const factionName = typeof entry.factionName === 'string' ? entry.factionName : 'Any';
      const objectives = normalizeObjectiveList(entry.objectives);
      const failConditions = normalizeObjectiveList(entry.failConditions);
      return { ...entry, factionName, objectives, failConditions };
    });
}
/**
 * Apply overlay corrections to tarkov.dev API response
 *
 * @param data - The raw API response from tarkov.dev
 * @returns The data with overlay corrections applied
 */
type OverlayTargetData = {
  tasks?: Array<{ id: string }>;
  items?: Array<{ id: string }>;
  traders?: Array<{ id: string }>;
  hideoutStations?: Array<{ id: string }>;
};
export async function applyOverlay<T extends { data?: OverlayTargetData }>(
  data: T,
  options: { bypassCache?: boolean } = {}
): Promise<T> {
  const { overlay, meta } = await fetchOverlay(Boolean(options.bypassCache));
  const result = { ...data, dataOverlay: meta } as T & { dataOverlay?: OverlayMeta };
  if (!overlay || !data?.data) {
    return result;
  }
  result.data = { ...data.data };
  // Apply task corrections and inject overlay task additions
  if (Array.isArray(result.data.tasks)) {
    const correctedTasks = applyEntityOverlay(
      result.data.tasks as Array<{ id: string }>,
      overlay.tasks
    ).map((task) => applyTaskObjectiveAdditions(task));
    const normalizedAdditions = normalizeTaskAdditions(overlay.tasksAdd);
    logger.info(
      `Overlay tasksAdd: ${normalizedAdditions.length} additions after filtering disabled`
    );
    const addedTasks = applyEntityOverlay(normalizedAdditions, overlay.tasks, {
      logLabel: 'tasksAdd',
      logEvenWhenZero: false,
    }).map((task) => applyTaskObjectiveAdditions(task));
    const existingIds = new Set(correctedTasks.map((task) => task.id));
    const dedupedAdditions = addedTasks.filter((task) => !existingIds.has(task.id));
    logger.info(`Overlay tasksAdd: ${dedupedAdditions.length} additions after dedupe`);
    result.data.tasks = [...correctedTasks, ...dedupedAdditions];
  }
  // Apply item corrections (if present)
  if (overlay.items && Array.isArray(result.data.items)) {
    result.data.items = applyEntityOverlay(
      result.data.items as Array<{ id: string }>,
      overlay.items
    );
  }
  // Apply trader corrections (if present)
  if (overlay.traders && Array.isArray(result.data.traders)) {
    result.data.traders = applyEntityOverlay(
      result.data.traders as Array<{ id: string }>,
      overlay.traders
    );
  }
  // Apply hideout corrections (if present)
  if (overlay.hideout && Array.isArray(result.data.hideoutStations)) {
    result.data.hideoutStations = applyEntityOverlay(
      result.data.hideoutStations as Array<{ id: string }>,
      overlay.hideout
    );
  }
  return result;
}
