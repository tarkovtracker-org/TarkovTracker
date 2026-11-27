import icebreakerPositions from '@/data/icebreakerBossSpawnPositions.json';
import type { MapBossSpawn, MapBossSpawnLocation, MapPosition } from '@/types/tarkov';
type Row = Record<string, unknown>;
type ZonePositions = Partial<Record<string, MapPosition[]>>;
type BossPositions = Partial<Record<string, ZonePositions>>;
const ICEBREAKER_MAP_ID = '69af492a4819ea4ba10a69c5';
const icebreakerFallbacks: BossPositions = icebreakerPositions;
const isRow = (value: unknown): value is Row =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && value >= 0 && value <= 1;
const isBossId = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:boss|sectantPriest$|infectedTagilla$)/i.test(value);
function isPosition(value: Row): value is Row & MapPosition {
  return [value.x, value.y, value.z].every(Number.isFinite);
}
function fallbackPositions(name: string, fallback?: ZonePositions): MapPosition[] {
  if (!fallback) return [];
  // Neutral snapshots carry the original area key inside the maps translation reference.
  const zone = name.replace(/^@tt:(?:regular|pve|pvp-season):maps:/, '');
  return Object.hasOwn(fallback, zone) ? (fallback[zone] ?? []) : [];
}
function projectLocation(row: Row, fallback?: ZonePositions): MapBossSpawnLocation | undefined {
  if (typeof row.name !== 'string' || !row.name.trim()) return undefined;
  const upstream = rows(row.positions).filter(isPosition);
  const positions = upstream.length ? upstream : fallbackPositions(row.name, fallback);
  return {
    name: row.name,
    chance: isProbability(row.chance) ? row.chance : undefined,
    positions: positions.map(({ x, y, z }) => ({ x, y, z })),
  };
}
function projectBoss(row: Row, mobs: Row, fallback?: BossPositions): MapBossSpawn | undefined {
  if (!isBossId(row.mob)) return undefined;
  const name = getBossName(row.mob, mobs);
  if (!name || !isProbability(row.spawnChance)) return undefined;
  const zoneFallback = fallback?.[row.mob];
  return {
    name,
    chance: row.spawnChance,
    locations: rows(row.spawnLocations).flatMap(
      (location) => projectLocation(location, zoneFallback) ?? []
    ),
  };
}
function getBossName(id: string, mobs: Row): string | undefined {
  const mob = mobs[id];
  return isRow(mob) && typeof mob.name === 'string' ? mob.name.trim() : undefined;
}
/** The upstream bosses list also includes ordinary Raider, Rogue and event waves. */
export function projectBossSpawns(value: unknown, mobs: unknown, mapId: string): MapBossSpawn[] {
  if (!isRow(mobs)) return [];
  const fallback = mapId === ICEBREAKER_MAP_ID ? icebreakerFallbacks : undefined;
  return rows(value).flatMap((row) => projectBoss(row, mobs, fallback) ?? []);
}
