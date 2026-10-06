import { buildTaskFailureAlternatives, getTaskReferenceId } from '@shared/utils/taskFailureEdges';
import { waitUntil } from 'cloudflare:workers';
import { CatalogUnavailableError } from './catalog-error';
import { getMemoryCache, setMemoryCache } from '../utils/memory-cache';
import { prepareTaskCatalog } from '../utils/task-catalog';
import { TARKOVTRACKER_USER_AGENT } from '../utils/userAgent';
import type { GameMode, TarkovHideoutStation, TarkovTask } from '../types';
const CACHE_TTL = 3600; // 1 hour
const FETCH_TIMEOUT_MS = 30_000;
const JSON_BASE_URL = 'https://json.tarkov.dev';
const inFlightTasks = new Map<string, Promise<TarkovTask[]>>();
const inFlightHideout = new Map<string, Promise<TarkovHideoutStation[]>>();
function loadCatalog<T>(
  key: string,
  inFlight: Map<string, Promise<T[]>>,
  load: () => Promise<T[]>
): Promise<T[]> {
  const cached = getMemoryCache<T[]>(key);
  if (cached) return Promise.resolve(cached);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = load().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  // Keep the originating request alive if its client disconnects while other requests wait.
  // Only parsed public data is shared; response streams remain owned by that request.
  waitUntil(pending);
  return pending;
}
const getApiGameMode = (gameMode: GameMode): 'regular' | 'pve' | 'pvp-season' => {
  if (gameMode === 'pve') return 'pve';
  if (gameMode === 'seasonal') return 'pvp-season';
  return 'regular';
};
// Fetch a json.tarkov.dev endpoint and unwrap the { data: ... } envelope.
// Required rules must fail closed when their catalog is unavailable.
async function fetchJson<T>(path: string): Promise<T> {
  try {
    const response = await fetch(`${JSON_BASE_URL}/${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': TARKOVTRACKER_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new CatalogUnavailableError();
    const json: unknown = await response.json();
    if (!isRecord(json) || !isRecord(json.data)) throw new CatalogUnavailableError();
    return json.data as T;
  } catch {
    throw new CatalogUnavailableError();
  }
}
type JsonTask = {
  id?: unknown;
  name?: unknown;
  factionName?: unknown;
  objectives?: unknown;
  failConditions?: unknown;
  taskRequirements?: unknown;
};
type JsonTasksPayload = { tasks?: unknown };
type JsonHideoutLevel = {
  id?: unknown;
  level?: unknown;
  itemRequirements?: unknown;
};
type JsonHideoutStation = {
  id?: unknown;
  levels?: unknown;
};
type JsonHideoutPayload = Record<string, unknown>;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const asRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];
const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
function requireCatalog(
  value: unknown,
  validEntry: (entry: Record<string, unknown>) => boolean
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new CatalogUnavailableError();
  const entries = Object.values(value);
  if (!entries.length || !entries.every((entry) => isRecord(entry) && validEntry(entry))) {
    throw new CatalogUnavailableError();
  }
}
function isTaskRequirement(value: unknown): boolean {
  if (!isRecord(value) || !getTaskReferenceId(value.task)) return false;
  return Array.isArray(value.status) && value.status.every((status) => typeof status === 'string');
}
function isTaskRuleEntry(task: Record<string, unknown>): boolean {
  if (!asString(task.id) || !Array.isArray(task.taskRequirements)) return false;
  return isTaskRuleLists(task);
}
function isTaskRuleLists(task: Record<string, unknown>): boolean {
  return (
    (task.taskRequirements as unknown[]).every(isTaskRequirement) &&
    isObjectiveList(task.objectives) &&
    isFailureConditionList(task.failConditions)
  );
}
function isFailureConditionList(value: unknown): boolean {
  return Array.isArray(value) && value.every(isFailureCondition);
}
function isFailureCondition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.task === undefined || isTaskRequirement(value);
}
function isObjectiveList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((objective) => isRecord(objective) && Boolean(asString(objective.id)))
  );
}
function isHideoutLevel(value: unknown): boolean {
  if (!isRecord(value) || !asString(value.id) || asFiniteNumber(value.level) === undefined)
    return false;
  return Array.isArray(value.itemRequirements) && value.itemRequirements.every(isHideoutItem);
}
function isHideoutItem(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    Boolean(asString(value.item) ?? asString(value.id)) && asFiniteNumber(value.count) !== undefined
  );
}
function isHideoutEntry(station: Record<string, unknown>): boolean {
  return (
    Boolean(asString(station.id)) &&
    Array.isArray(station.levels) &&
    station.levels.every(isHideoutLevel)
  );
}
export function getTasks(gameMode: GameMode): Promise<TarkovTask[]> {
  const apiGameMode = getApiGameMode(gameMode);
  const cacheKey = `tarkov:tasks:${apiGameMode}`;
  return loadCatalog(cacheKey, inFlightTasks, () => fetchTasks(apiGameMode, cacheKey));
}
async function fetchTasks(apiGameMode: string, cacheKey: string): Promise<TarkovTask[]> {
  const data = await fetchJson<JsonTasksPayload>(`${apiGameMode}/tasks`);
  requireCatalog(data.tasks, isTaskRuleEntry);
  const tasks: TarkovTask[] = Object.values(data.tasks)
    .filter(isRecord)
    .flatMap((rawTask) => {
      const task = rawTask as JsonTask;
      const id = asString(task.id);
      if (!id) return [];
      return [
        {
          id,
          name: asString(task.name) ?? id,
          factionName: asString(task.factionName),
          objectives: asRecords(task.objectives).flatMap((objective) => {
            const objectiveId = asString(objective.id);
            if (!objectiveId) return [];
            return [
              {
                id: objectiveId,
                type: asString(objective.type),
                count: asFiniteNumber(objective.count),
              },
            ];
          }),
          failConditions: asRecords(task.failConditions).flatMap((condition) => {
            const taskId = getTaskReferenceId(condition.task);
            return taskId ? [{ task: { id: taskId }, status: condition.status as string[] }] : [];
          }),
          taskRequirements: asRecords(task.taskRequirements).flatMap((requirement) => {
            const requiredTaskId = getTaskReferenceId(requirement.task);
            if (!requiredTaskId) return [];
            return [
              {
                task: { id: requiredTaskId },
                status: Array.isArray(requirement.status)
                  ? requirement.status.filter(
                      (status): status is string => typeof status === 'string'
                    )
                  : undefined,
              },
            ];
          }),
        },
      ];
    });
  const alternatives = buildTaskFailureAlternatives(tasks);
  for (const task of tasks) task.alternatives = alternatives[task.id];
  prepareTaskCatalog(tasks);
  setMemoryCache(cacheKey, tasks, CACHE_TTL);
  return tasks;
}
export function getHideoutStations(gameMode: GameMode): Promise<TarkovHideoutStation[]> {
  const apiGameMode = getApiGameMode(gameMode);
  const cacheKey = `tarkov:hideout:${apiGameMode}`;
  return loadCatalog(cacheKey, inFlightHideout, () => fetchHideoutStations(apiGameMode, cacheKey));
}
async function fetchHideoutStations(
  apiGameMode: string,
  cacheKey: string
): Promise<TarkovHideoutStation[]> {
  const data = await fetchJson<JsonHideoutPayload>(`${apiGameMode}/hideout`);
  requireCatalog(data, isHideoutEntry);
  const stations: TarkovHideoutStation[] = Object.values(data)
    .filter(isRecord)
    .flatMap((rawStation) => {
      const station = rawStation as JsonHideoutStation;
      const stationId = asString(station.id);
      if (!stationId) return [];
      return [
        {
          id: stationId,
          levels: asRecords(station.levels).flatMap((rawLevel) => {
            const level = rawLevel as JsonHideoutLevel;
            const levelId = asString(level.id);
            const levelNumber = asFiniteNumber(level.level);
            if (!levelId || levelNumber === undefined) return [];
            return [
              {
                id: levelId,
                level: levelNumber,
                itemRequirements: asRecords(level.itemRequirements).flatMap((item) => {
                  // json.tarkov.dev identifies a requirement row separately from the
                  // actual item. Progress responses must expose the item template ID.
                  const itemId = asString(item.item) ?? asString(item.id);
                  const count = asFiniteNumber(item.count);
                  return itemId && count !== undefined ? [{ id: itemId, count }] : [];
                }),
              },
            ];
          }),
        },
      ];
    });
  setMemoryCache(cacheKey, stations, CACHE_TTL);
  return stations;
}
