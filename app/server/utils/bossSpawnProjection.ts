import bossSpawnPositions from '@/data/bossSpawnPositions.json';
import type { MapBossSpawn, MapBossSpawnLocation, MapPosition } from '@/types/tarkov';
type Row = Record<string, unknown>;
type ZoneFallbacks = Partial<Record<string, { mobs: string[]; positions: MapPosition[] }>>;
const mapFallbacks: Partial<Record<string, ZoneFallbacks>> = bossSpawnPositions;
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
function fallbackPositions(name: string, mob: string, fallback?: ZoneFallbacks): MapPosition[] {
  if (!fallback) return [];
  // Neutral snapshots carry the original area key inside the maps translation reference.
  const zone = name.replace(/^@tt:(?:regular|pve|pvp-season):maps:/, '');
  const entry = Object.hasOwn(fallback, zone) ? fallback[zone] : undefined;
  return entry?.mobs.includes(mob) ? entry.positions : [];
}
function projectLocation(
  row: Row,
  mob: string,
  fallback?: ZoneFallbacks
): MapBossSpawnLocation | undefined {
  if (typeof row.name !== 'string' || !row.name.trim()) return undefined;
  const upstream = rows(row.positions).filter(isPosition);
  const positions = upstream.length ? upstream : fallbackPositions(row.name, mob, fallback);
  return {
    name: row.name,
    chance: isProbability(row.chance) ? row.chance : undefined,
    positions: positions.map(({ x, y, z }) => ({ x, y, z })),
  };
}
function projectBoss(row: Row, mobs: Row, fallback?: ZoneFallbacks): MapBossSpawn | undefined {
  if (!isBossId(row.mob)) return undefined;
  const { mob } = row;
  const name = getBossName(mob, mobs);
  if (!name || !isProbability(row.spawnChance)) return undefined;
  return {
    name,
    chance: row.spawnChance,
    locations: rows(row.spawnLocations).flatMap(
      (location) => projectLocation(location, mob, fallback) ?? []
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
  const fallback = Object.hasOwn(mapFallbacks, mapId) ? mapFallbacks[mapId] : undefined;
  return rows(value).flatMap((row) => projectBoss(row, mobs, fallback) ?? []);
}
