import {
  hasDeclaredPrestigeLevel,
  isDeclaredGate,
  isValidTraderLevel,
  normalizeTraderReference,
  normalizeTraderRequirements,
  resolveRequiredPrestige,
} from '@/utils/taskRequirements';
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
import { addFallbackCrafts, addFallbackItems } from './overlayAdditions';
import { mergeOverlayRecords, scopedOverlay } from './overlayProjectors';
import { validateOverlayData, unknownOverlaySections } from './overlayValidation';
import { TARKOVTRACKER_USER_AGENT } from './userAgent';
import type { OverlayData, OverlayLocaleData as LocaleOverlayData } from './overlayTypes';
import type { HideoutStation, TarkovItem, Task, TaskRequirementDiagnostic } from '@/types/tarkov';
const logger = createLogger('Overlay');
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
  unconsumedSections?: string[];
}
// Module-level cache behavior: cachedOverlay and cacheTimestamp persist across requests in
// long-running Node.js processes but reset on cold starts in serverless/edge platforms.
// Features a 1-hour TTL (OVERLAY_CACHE_TTL) and falls back to stale data on fetch errors.
// OVERLAY_URL can be overridden by the environment variable.
let cachedOverlay: OverlayData | null = null;
let cacheTimestamp = 0;
let overlayRefreshPromise: Promise<OverlayFetchResult> | null = null;
let nextOverlayRefreshAt = 0;
const OVERLAY_CACHE_TTL = 3600000; // 1 hour in milliseconds
const OVERLAY_REFRESH_RETRY_MS = 60000;
const FETCH_TIMEOUT_MS = 5000; // 5 seconds
// GitHub raw URL for the overlay
// Note: Using raw.githubusercontent.com directly until jsDelivr cache propagates
const DEFAULT_OVERLAY_URL =
  'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay.json';
const OVERLAY_PROTOCOL = 'https:';
const MAX_OVERLAY_REDIRECTS = 3;
const OVERLAY_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
function resolveOverlayUrl(value: string | undefined): string {
  const candidate = value ? value.trim() : DEFAULT_OVERLAY_URL;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return DEFAULT_OVERLAY_URL;
  }
  if (url.protocol !== OVERLAY_PROTOCOL) return DEFAULT_OVERLAY_URL;
  return url.toString();
}
const OVERLAY_URL = resolveOverlayUrl(process.env.OVERLAY_URL);
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
function buildOverlayMeta(
  overlay: OverlayData | null,
  status: OverlayStatus,
  extra?: Partial<OverlayMeta>
): OverlayMeta {
  const { version, generated, sha256 } = overlay?.$meta ?? {};
  return {
    status,
    version,
    generated,
    sha256,
    sourceUrl: OVERLAY_URL_WITH_BUSTER,
    unconsumedSections: overlay ? unknownOverlaySections(overlay) : [],
    ...extra,
  };
}
/**
 * Fetch the overlay data from CDN (with caching)
 */
type OverlayFetchResult = { overlay: OverlayData | null; meta: OverlayMeta };
type OverlayRefreshScheduler = (task: Promise<unknown>) => void;
function buildOverlayFailure(error: string): OverlayFetchResult {
  lastOverlayMeta = buildOverlayMeta(cachedOverlay, cachedOverlay ? 'stale' : 'missing', { error });
  return { overlay: cachedOverlay, meta: lastOverlayMeta };
}
function resolveOverlayRedirect(response: Response, currentUrl: string): string {
  const location = response.headers.get('location');
  if (!location) throw new Error(`overlay_redirect_without_location (${response.status})`);
  let target: URL;
  try {
    target = new URL(location, currentUrl);
  } catch {
    throw new Error('overlay_redirect_malformed_location');
  }
  if (target.protocol !== OVERLAY_PROTOCOL) {
    throw new Error(`overlay_redirect_insecure_scheme (${target.protocol})`);
  }
  return target.toString();
}
async function fetchOverlayOverHttps(signal: AbortSignal): Promise<Response> {
  let currentUrl = OVERLAY_URL_WITH_BUSTER;
  for (let hop = 0; hop <= MAX_OVERLAY_REDIRECTS; hop += 1) {
    const response = await fetch(currentUrl, {
      signal,
      redirect: 'manual',
      headers: { Accept: 'application/json', 'User-Agent': TARKOVTRACKER_USER_AGENT },
    });
    if (!OVERLAY_REDIRECT_STATUSES.has(response.status)) return response;
    await response.body?.cancel();
    currentUrl = resolveOverlayRedirect(response, currentUrl);
  }
  throw new Error(`overlay_redirect_limit_exceeded (${MAX_OVERLAY_REDIRECTS})`);
}
function createOverlayRequest(): {
  clearTimeout: () => void;
  response: Promise<Response>;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return {
    clearTimeout: () => clearTimeout(timeoutId),
    response: Promise.resolve().then(() => fetchOverlayOverHttps(controller.signal)),
  };
}
async function processOverlayResponse(
  response: Response,
  now: number
): Promise<OverlayFetchResult> {
  if (!response.ok) {
    logger.warn(`Failed to fetch overlay: ${response.status}`);
    return buildOverlayFailure(`HTTP ${response.status}`);
  }
  const parsedData = await response.json();
  if (!validateOverlayData(parsedData)) {
    logger.warn('Fetched overlay failed validation, using stale cache');
    return buildOverlayFailure('validation_failed');
  }
  const unconsumed = unknownOverlaySections(parsedData);
  if (unconsumed.length) logger.warn('Unconsumed overlay sections:', unconsumed);
  cachedOverlay = parsedData;
  cacheTimestamp = now;
  logger.info(`Loaded overlay v${cachedOverlay.$meta!.version}`);
  lastOverlayMeta = buildOverlayMeta(cachedOverlay, 'fresh', {
    unconsumedSections: unconsumed,
    fetchedAt: new Date(now).toISOString(),
    cacheAgeMs: 0,
  });
  return { overlay: cachedOverlay, meta: lastOverlayMeta };
}
function logOverlayFetchError(error: unknown): void {
  if (error instanceof Error && error.name === 'AbortError') {
    logger.warn(`Fetch timeout after ${FETCH_TIMEOUT_MS}ms`);
    return;
  }
  logger.warn('Error fetching overlay:', error);
}
async function refreshOverlay(now: number): Promise<OverlayFetchResult> {
  const request = createOverlayRequest();
  try {
    return await processOverlayResponse(await request.response, now);
  } catch (error) {
    logOverlayFetchError(error);
    return buildOverlayFailure(error instanceof Error ? error.message : String(error));
  } finally {
    request.clearTimeout();
  }
}
function startOverlayRefresh(now: number): {
  promise: Promise<OverlayFetchResult>;
  started: boolean;
} {
  if (overlayRefreshPromise) return { promise: overlayRefreshPromise, started: false };
  const promise = refreshOverlay(now)
    .then((result) => {
      nextOverlayRefreshAt =
        result.meta.status === 'fresh' ? 0 : Date.now() + OVERLAY_REFRESH_RETRY_MS;
      return result;
    })
    .finally(() => {
      overlayRefreshPromise = null;
    });
  overlayRefreshPromise = promise;
  return { promise, started: true };
}
function isOverlayCacheFresh(now: number, forceRefresh: boolean): boolean {
  return !forceRefresh && cachedOverlay !== null && now - cacheTimestamp < OVERLAY_CACHE_TTL;
}
function canDeferOverlayRefresh(
  forceRefresh: boolean,
  scheduleRefresh: OverlayRefreshScheduler | undefined
): scheduleRefresh is OverlayRefreshScheduler {
  return !forceRefresh && cachedOverlay !== null && Boolean(scheduleRefresh);
}
function buildCachedOverlayResult(now: number, status: 'cached' | 'stale'): OverlayFetchResult {
  const overlay = cachedOverlay as OverlayData;
  lastOverlayMeta = buildOverlayMeta(overlay, status, { cacheAgeMs: now - cacheTimestamp });
  return { overlay, meta: lastOverlayMeta };
}
function scheduleOverlayRefresh(now: number, scheduleRefresh: OverlayRefreshScheduler): void {
  if (now < nextOverlayRefreshAt) return;
  const refresh = startOverlayRefresh(now);
  if (refresh.started) scheduleRefresh(refresh.promise);
}
export async function fetchOverlay(
  forceRefresh: boolean = false,
  scheduleRefresh?: OverlayRefreshScheduler
): Promise<OverlayFetchResult> {
  const now = Date.now();
  if (isOverlayCacheFresh(now, forceRefresh)) {
    return buildCachedOverlayResult(now, 'cached');
  }
  if (canDeferOverlayRefresh(forceRefresh, scheduleRefresh)) {
    scheduleOverlayRefresh(now, scheduleRefresh);
    return buildCachedOverlayResult(now, 'stale');
  }
  return await startOverlayRefresh(now).promise;
}
/**
 * Apply overlay corrections to an array of entities
 * Filters out entities marked as disabled after applying corrections
 */
type ApplyEntityOverlayOptions<T extends { id: string }> = {
  normalize?: (task: T, patch: Record<string, unknown>, original: T) => T;
  logLabel?: string;
  /** If true, log even when appliedCount and disabledCount are both zero. Default: true */
  logEvenWhenZero?: boolean;
};
function applyEntityOverlay<T extends { id: string }>(
  entities: T[],
  corrections: Record<string, Record<string, unknown>> | undefined,
  options: ApplyEntityOverlayOptions<T> = {}
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
        const merged = deepMerge(entity as Record<string, unknown>, correction) as T;
        return options.normalize ? options.normalize(merged, correction, entity) : merged;
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
  const shouldReportOverlayChanges =
    appliedCount > 0 || disabledCount > 0 || options.logEvenWhenZero !== false;
  if (shouldReportOverlayChanges) {
    logger.info(
      `Applied ${appliedCount} corrections out of ${Object.keys(corrections).length} available${logLabel}`
    );
    if (disabledCount > 0) {
      logger.info(`Filtered out ${disabledCount} disabled entities${logLabel}`);
    }
  }
  return result;
}
export function applyLocaleOverlay<T extends { id: string }>(
  entities: T[],
  localePatches: Record<string, Record<string, unknown>> | undefined
): T[] {
  if (!localePatches || !entities) return entities;
  return entities.map((entity) => {
    const patch = localePatches[entity.id];
    return isPlainObject(patch)
      ? (deepMerge(entity as Record<string, unknown>, patch) as T)
      : entity;
  });
}
type ObjectiveAddEntry = Record<string, unknown>;
const DEFAULT_OVERLAY_OBJECTIVE_TYPE = 'giveItem';
const DEFAULT_OVERLAY_OBJECTIVE_COUNT = 1;
export function expandObjectiveAdditions(additions: unknown[]): ObjectiveAddEntry[] {
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
export function getObjectiveItemIds(objective: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const item = objective.item;
  if (isPlainObject(item) && typeof item.id === 'string') ids.add(item.id);
  const items = objective.items;
  if (Array.isArray(items)) {
    for (const entry of items) {
      if (isPlainObject(entry) && typeof entry.id === 'string') ids.add(entry.id);
    }
  }
  const questItem = objective.questItem;
  if (isPlainObject(questItem) && typeof questItem.id === 'string') ids.add(questItem.id);
  return ids;
}
export function applyTaskObjectiveAdditions<T extends { id: string }>(task: T): T {
  if (!isPlainObject(task)) return task;
  const obj = task as Record<string, unknown>;
  const additions = Array.isArray(obj.objectivesAdd) ? obj.objectivesAdd : [];
  if (additions.length === 0) return task;
  const existing = Array.isArray(obj.objectives) ? obj.objectives : [];
  const expanded = expandObjectiveAdditions(additions);
  if (expanded.length === 0) return task;
  const existingItemIds = new Set<string>();
  for (const objective of existing) {
    if (isPlainObject(objective)) {
      for (const id of getObjectiveItemIds(objective)) existingItemIds.add(id);
    }
  }
  const deduped = expanded.filter((addition) => {
    const additionItemIds = getObjectiveItemIds(addition);
    if (additionItemIds.size === 0) return true;
    for (const id of additionItemIds) {
      if (existingItemIds.has(id)) return false;
    }
    return true;
  });
  if (deduped.length < expanded.length) {
    logger.info(
      `Skipped ${expanded.length - deduped.length} overlay objective(s) for task ${task.id} (items already in API)`
    );
  }
  const { objectivesAdd, ...rest } = obj;
  if (deduped.length === 0) return { ...(rest as T) };
  return {
    ...(rest as T),
    objectives: [...existing, ...deduped],
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
const isLevelRequirement = (requirement: unknown): requirement is Record<string, unknown> =>
  isPlainObject(requirement) && requirement.requirementType === 'level';
const hasFiniteLevelThreshold = (requirement: Record<string, unknown>): boolean => {
  const level = requirement.level ?? requirement.value;
  return typeof level === 'number' && isValidTraderLevel(level);
};
function applyTraderRequirementSplit(task: Record<string, unknown>): void {
  const raw = task.traderRequirements;
  task.normalizedTraderRequirements = normalizeTraderRequirements(raw);
  if (!Array.isArray(raw)) return;
  const adapted = raw.map((requirement) =>
    isPlainObject(requirement)
      ? { ...requirement, trader: normalizeTraderReference(requirement.trader) }
      : requirement
  );
  const traderLevelRequirements = adapted
    .filter(isLevelRequirement)
    .filter(hasFiniteLevelThreshold)
    .map((requirement) => ({ ...requirement, level: requirement.level ?? requirement.value }));
  const traderRequirements = adapted.filter(
    (requirement) => isPlainObject(requirement) && requirement.requirementType !== 'level'
  );
  task.traderLevelRequirements =
    traderLevelRequirements.length > 0 ? traderLevelRequirements : undefined;
  task.traderRequirements = traderRequirements.length > 0 ? traderRequirements : undefined;
}
const DECLARED_GATE_DIAGNOSTICS = {
  taskRequirements: 'task_requirement',
  requiredPrestige: 'prestige_reference',
} as const satisfies Partial<Record<keyof Task, TaskRequirementDiagnostic>>;
type DeclaredGateField = keyof typeof DECLARED_GATE_DIAGNOSTICS;
const DECLARED_GATE_FIELDS = Object.keys(DECLARED_GATE_DIAGNOSTICS) as DeclaredGateField[];
const patchesField = (patch: Record<string, unknown> | undefined, field: string): boolean =>
  patch != null && field in patch;
const patchesDeclaredGates = (patch: Record<string, unknown> | undefined): boolean =>
  DECLARED_GATE_FIELDS.some((field) => patchesField(patch, field));
const declaredGateFields = (task: Record<string, unknown>): DeclaredGateField[] =>
  DECLARED_GATE_FIELDS.filter((field) => isDeclaredGate(task[field]));
const diagnosticsFor = (fields: DeclaredGateField[]): TaskRequirementDiagnostic[] =>
  fields.map((field) => DECLARED_GATE_DIAGNOSTICS[field]);
const normalizeDeclaredRequirements = (task: Record<string, unknown>): void => {
  if (Array.isArray(task.taskRequirements)) return;
  delete task.taskRequirements;
};
const normalizeDeclaredPrestige = (task: Record<string, unknown>): void => {
  const resolved = resolveRequiredPrestige(task.requiredPrestige);
  if (resolved) task.requiredPrestige = resolved;
  else if (!hasDeclaredPrestigeLevel(task.requiredPrestige)) delete task.requiredPrestige;
};
const orderedGateDiagnostics = (
  diagnostics: TaskRequirementDiagnostic[]
): TaskRequirementDiagnostic[] =>
  diagnosticsFor(DECLARED_GATE_FIELDS).filter((diagnostic) => diagnostics.includes(diagnostic));
const recordGateDiagnostics = (
  task: Record<string, unknown>,
  diagnostics: TaskRequirementDiagnostic[]
): void => {
  if (diagnostics.length) task.requirementDiagnostics = orderedGateDiagnostics(diagnostics);
  else delete task.requirementDiagnostics;
};
const recordedGateDiagnostics = (task: Record<string, unknown>): TaskRequirementDiagnostic[] =>
  Array.isArray(task.requirementDiagnostics)
    ? (task.requirementDiagnostics as TaskRequirementDiagnostic[])
    : [];
/**
 * A patch that leaves a gate field alone must not clear the diagnostic the adapter recorded for it:
 * the adapter already dropped the value a recomputation would need in order to re-detect it.
 */
const retainedGateDiagnostics = (
  task: Record<string, unknown>,
  patch: Record<string, unknown> | undefined
): TaskRequirementDiagnostic[] => {
  const untouched = DECLARED_GATE_FIELDS.filter((field) => !patchesField(patch, field));
  const kept = new Set(diagnosticsFor(untouched));
  return recordedGateDiagnostics(task).filter((diagnostic) => kept.has(diagnostic));
};
/**
 * The overlay merges into already-adapted tasks, so a correction or an injected task can reintroduce
 * a raw gate the adapter would have normalized. Recomputing here keeps `taskRequirements` a list and
 * resolves `requiredPrestige`, then reports exactly the declared gates normalization had to drop.
 */
function applyDeclaredGateNormalization(
  task: Record<string, unknown>,
  retained: TaskRequirementDiagnostic[]
): void {
  const declared = declaredGateFields(task);
  normalizeDeclaredRequirements(task);
  normalizeDeclaredPrestige(task);
  const dropped = declared.filter((field) => task[field] === undefined);
  recordGateDiagnostics(task, [...retained, ...diagnosticsFor(dropped)]);
}
/**
 * Normalize the gates a patch touched. Only patched entities are fresh `deepMerge` results, so this
 * both avoids mutating shared input and lets a correction clear the diagnostic for the field it
 * rewrote while leaving an untouched field's diagnostic intact.
 */
function applyPatchedGateNormalization<T extends { id: string }>(
  task: T,
  patch: Record<string, unknown> | undefined,
  original: T
): T {
  const record = task as Record<string, unknown>;
  // Diagnostics are derived state: corrections cannot replace the adapter's evidence.
  recordGateDiagnostics(record, recordedGateDiagnostics(original as Record<string, unknown>));
  if (!patchesDeclaredGates(patch)) return task;
  applyDeclaredGateNormalization(record, retainedGateDiagnostics(record, patch));
  return task;
}
/** Re-normalize a corrected upstream task. */
function applyTaskPatchNormalization<T extends { id: string }>(
  task: T,
  patch: Record<string, unknown> | undefined,
  original: T
): T {
  const record = task as Record<string, unknown>;
  if (patchesField(patch, 'traderRequirements')) applyTraderRequirementSplit(record);
  return applyPatchedGateNormalization(task, patch, original);
}
/** Overlay additions never pass through the adapter, so their raw gates are all still readable. */
function applyTaskAdditionNormalization<T extends { id: string }>(task: T): T {
  const record = task as Record<string, unknown>;
  if ('traderRequirements' in record) applyTraderRequirementSplit(record);
  applyDeclaredGateNormalization(record, []);
  return applyTaskObjectiveAdditions(task);
}
function mergeModeCorrections(
  shared: Record<string, Record<string, unknown>> | undefined,
  modeSpecific: Record<string, Record<string, unknown>> | undefined
): Record<string, Record<string, unknown>> | undefined {
  if (!modeSpecific) return shared;
  if (!shared) return modeSpecific;
  const merged = { ...shared };
  for (const [id, patch] of Object.entries(modeSpecific)) {
    merged[id] = merged[id] ? deepMerge(merged[id], patch) : patch;
  }
  return merged;
}
/**
 * Apply overlay corrections to tarkov.dev API response
 *
 * @param data - The raw API response from tarkov.dev
 * @returns The data with overlay corrections applied
 */
type OverlayTargetData = {
  maps?: Array<{ id: string }>;
  tasks?: Array<{ id: string }>;
  items?: Array<{ id: string }>;
  traders?: Array<{ id: string }>;
  hideoutStations?: Array<{ id: string }>;
};
function applyLocaleOverlays(target: OverlayTargetData, localeOverlay: LocaleOverlayData): void {
  for (const collection of ['items', 'maps', 'traders'] as const) {
    const entities = target[collection];
    if (Array.isArray(entities))
      target[collection] = applyLocaleOverlay(entities, localeOverlay[collection]);
  }
  // Locale patches land after the main task pass, so a gate one of them declares needs the same
  // normalization. Locale corrections are meant to be locale-sensitive fields only; this keeps a
  // stray gate from reaching consumers unchecked rather than trusting that convention. The merge and
  // the normalization share one pass so the patch stays associated with its pre-patch task id.
  const tasks = target.tasks;
  if (!Array.isArray(tasks)) return;
  target.tasks = tasks.map((task) => {
    const patch = localeOverlay.tasks?.[task.id];
    if (!isPlainObject(patch)) return task;
    const merged = deepMerge(task as Record<string, unknown>, patch) as { id: string };
    return applyPatchedGateNormalization(merged, patch, task);
  });
}
function applyEntityCollectionOverlay(
  target: OverlayTargetData,
  collection: 'hideoutStations' | 'items' | 'traders' | 'maps',
  patches: Record<string, Record<string, unknown>> | undefined
): void {
  const entities = target[collection];
  if (!patches || !Array.isArray(entities)) return;
  target[collection] = applyEntityOverlay(entities, patches);
}
const chapterTaskIds = (chapter: Record<string, unknown>): string[] => {
  if (!Array.isArray(chapter.questUnlocks)) return [];
  return chapter.questUnlocks
    .filter(isPlainObject)
    .map((unlock) => unlock.id)
    .filter((id): id is string => typeof id === 'string');
};
const storyChapterName = (chapter: Record<string, unknown>, id: string) =>
  typeof chapter.name === 'string' ? chapter.name : id;
const collectStoryUnlocks = (chapters: Record<string, Record<string, unknown>> = {}) => {
  const byTask = new Map<string, Array<{ id: string; name: string }>>();
  for (const [id, chapter] of Object.entries(chapters)) {
    const name = storyChapterName(chapter, id);
    for (const taskId of chapterTaskIds(chapter)) {
      const entries = byTask.get(taskId) ?? [];
      entries.push({ id, name });
      byTask.set(taskId, entries);
    }
  }
  return byTask;
};
export async function applyOverlay<T extends { data?: OverlayTargetData }>(
  data: T,
  options: {
    bypassCache?: boolean;
    gameMode?: string;
    locale?: string;
    scheduleRefresh?: OverlayRefreshScheduler;
  } = {}
): Promise<T & { dataOverlay: OverlayMeta }> {
  const { overlay, meta } = await fetchOverlay(
    Boolean(options.bypassCache),
    options.scheduleRefresh
  );
  const result = { ...data, dataOverlay: meta } as T & { dataOverlay: OverlayMeta };
  if (!overlay || !data?.data) {
    return result;
  }
  result.data = { ...data.data };
  const locale = options.locale?.trim() || 'en';
  // Apply task corrections and inject overlay task additions
  if (Array.isArray(result.data.tasks)) {
    // Merge mode-specific task corrections on top of shared corrections
    const modeOverlay = options.gameMode ? overlay.modes?.[options.gameMode] : undefined;
    const mergedTasks = mergeModeCorrections(overlay.tasks, modeOverlay?.tasks);
    const mergedTasksAdd = mergeModeCorrections(overlay.tasksAdd, modeOverlay?.tasksAdd);
    const correctedTasks = applyEntityOverlay(
      result.data.tasks as Array<{ id: string }>,
      mergedTasks,
      { normalize: applyTaskPatchNormalization }
    ).map(applyTaskObjectiveAdditions);
    const normalizedAdditions = normalizeTaskAdditions(mergedTasksAdd);
    logger.info(
      `Overlay tasksAdd: ${normalizedAdditions.length} additions after filtering disabled`
    );
    const addedTasks = applyEntityOverlay(normalizedAdditions, mergedTasks, {
      logLabel: 'tasksAdd',
      logEvenWhenZero: false,
    }).map(applyTaskAdditionNormalization);
    const existingIds = new Set(correctedTasks.map((task) => task.id));
    const dedupedAdditions = addedTasks.filter((task) => !existingIds.has(task.id));
    logger.info(`Overlay tasksAdd: ${dedupedAdditions.length} additions after dedupe`);
    const chapters = mergeOverlayRecords(
      scopedOverlay(overlay, 'storyChapters', options.gameMode ?? 'regular'),
      overlay.locales?.[locale]?.storyChapters
    );
    const storyUnlocksByTask = collectStoryUnlocks(chapters);
    result.data.tasks = [...correctedTasks, ...dedupedAdditions].map((task) => ({
      ...task,
      storyUnlocks: storyUnlocksByTask.get(task.id) ?? [],
    }));
  }
  const mode = options.gameMode ?? 'regular';
  if (Array.isArray(result.data.items))
    result.data.items = addFallbackItems(result.data.items as TarkovItem[], overlay, mode);
  if (Array.isArray(result.data.hideoutStations))
    result.data.hideoutStations = addFallbackCrafts(
      result.data.hideoutStations as HideoutStation[],
      overlay,
      mode
    );
  applyEntityCollectionOverlay(result.data, 'items', scopedOverlay(overlay, 'items', mode));
  applyEntityCollectionOverlay(result.data, 'traders', scopedOverlay(overlay, 'traders', mode));
  applyEntityCollectionOverlay(
    result.data,
    'hideoutStations',
    scopedOverlay(overlay, 'hideout', mode)
  );
  applyEntityCollectionOverlay(result.data, 'maps', scopedOverlay(overlay, 'maps', mode));
  const localeOverlay = overlay.locales?.[locale];
  if (localeOverlay) {
    applyLocaleOverlays(result.data, localeOverlay);
  }
  return result;
}
