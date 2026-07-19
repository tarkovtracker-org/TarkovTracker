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
  id: string;
  name?: string;
  factionName?: string;
  objectives?: { id: string; type?: string; count?: number }[];
  taskRequirements?: { task?: string; status?: string[] }[];
};
type JsonTasksPayload = { tasks: Record<string, JsonTask> };
type JsonHideoutLevel = {
  id: string;
  level: number;
  itemRequirements?: { id: string; count: number }[];
};
type JsonHideoutStation = {
  id: string;
  levels?: JsonHideoutLevel[];
};
type JsonHideoutPayload = Record<string, JsonHideoutStation>;
export async function getTasks(gameMode: GameMode): Promise<TarkovTask[]> {
  const apiGameMode = getApiGameMode(gameMode);
  const cacheKey = `tarkov:tasks:${apiGameMode}`;
  const cached = getMemoryCache<TarkovTask[]>(cacheKey);
  if (cached) return cached;
  const data = await fetchJson<JsonTasksPayload>(`${apiGameMode}/tasks`);
  if (!data?.tasks) return [];
  const tasks: TarkovTask[] = Object.values(data.tasks).map((task) => ({
    id: task.id,
    name: task.name ?? task.id,
    factionName: task.factionName,
    objectives: task.objectives?.map((o) => ({ id: o.id, type: o.type, count: o.count })),
    taskRequirements: task.taskRequirements?.map((r) => ({
      task: { id: typeof r.task === 'string' ? r.task : '' },
      status: r.status,
    })),
  }));
  setMemoryCache(cacheKey, tasks, CACHE_TTL);
  return tasks;
}
export async function getHideoutStations(gameMode: GameMode): Promise<TarkovHideoutStation[]> {
  const apiGameMode = getApiGameMode(gameMode);
  const cacheKey = `tarkov:hideout:${apiGameMode}`;
  const cached = getMemoryCache<TarkovHideoutStation[]>(cacheKey);
  if (cached) return cached;
  const data = await fetchJson<JsonHideoutPayload>(`${apiGameMode}/hideout`);
  if (!data) return [];
  const stations: TarkovHideoutStation[] = Object.values(data).map((station) => ({
    id: station.id,
    levels: station.levels?.map((level) => ({
      id: level.id,
      level: level.level,
      itemRequirements: level.itemRequirements?.map((item) => ({
        id: item.id,
        count: item.count,
      })),
    })),
  }));
  setMemoryCache(cacheKey, stations, CACHE_TTL);
  return stations;
}
