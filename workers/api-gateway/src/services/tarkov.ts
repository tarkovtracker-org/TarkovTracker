import { getMemoryCache, setMemoryCache } from '../utils/memory-cache';
import { TARKOVTRACKER_USER_AGENT } from '../utils/userAgent';
import type { TarkovHideoutStation, TarkovTask } from '../types';
const CACHE_TTL = 3600; // 1 hour
const FETCH_TIMEOUT_MS = 30_000;
const JSON_BASE_URL = 'https://json.tarkov.dev';
type GameMode = 'pvp' | 'pve';
const getApiGameMode = (gameMode: GameMode): 'regular' | 'pve' =>
  gameMode === 'pve' ? 'pve' : 'regular';
// Fetch a json.tarkov.dev endpoint and unwrap the { data: ... } envelope.
// Returns null on any error so callers degrade to empty data instead of
// throwing.
async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${JSON_BASE_URL}/${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': TARKOVTRACKER_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { data: T };
    return json.data;
  } catch {
    return null;
  }
}
type JsonTask = {
  id?: unknown;
  name?: unknown;
  factionName?: unknown;
  objectives?: unknown;
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
export async function getTasks(gameMode: GameMode): Promise<TarkovTask[]> {
  const apiGameMode = getApiGameMode(gameMode);
  const cacheKey = `tarkov:tasks:${apiGameMode}`;
  const cached = getMemoryCache<TarkovTask[]>(cacheKey);
  if (cached) return cached;
  const data = await fetchJson<JsonTasksPayload>(`${apiGameMode}/tasks`);
  if (!data || !isRecord(data.tasks)) return [];
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
          taskRequirements: asRecords(task.taskRequirements).flatMap((requirement) => {
            const requiredTaskId = asString(requirement.task);
            if (!requiredTaskId) return [];
            return [
              {
                task: { id: requiredTaskId },
                status: Array.isArray(requirement.status)
                  ? requirement.status.filter((status): status is string => typeof status === 'string')
                  : undefined,
              },
            ];
          }),
        },
      ];
    });
  setMemoryCache(cacheKey, tasks, CACHE_TTL);
  return tasks;
}
export async function getHideoutStations(gameMode: GameMode): Promise<TarkovHideoutStation[]> {
  const apiGameMode = getApiGameMode(gameMode);
  const cacheKey = `tarkov:hideout:${apiGameMode}`;
  const cached = getMemoryCache<TarkovHideoutStation[]>(cacheKey);
  if (cached) return cached;
  const data = await fetchJson<JsonHideoutPayload>(`${apiGameMode}/hideout`);
  if (!data || !isRecord(data)) return [];
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
