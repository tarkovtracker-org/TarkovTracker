import { isDrawableMapPosition } from '@/features/maps/utils/mapLocations';
import type { MapBossSpawn, MapBossSpawnLocation, MapPosition, TarkovMap } from '@/types/tarkov';
export type BossPin = {
  position: MapPosition;
  encounters: Array<{ boss: MapBossSpawn; location: MapBossSpawnLocation }>;
};
export function resolveMergedBossSpawns(maps: TarkovMap[]): MapBossSpawn[] {
  if (maps.length === 1) return maps[0]?.bossSpawns ?? [];
  return maps.flatMap((map) =>
    (map.bossSpawns ?? []).map((boss) => ({ ...boss, mapName: map.name }))
  );
}
function squaredDistance(position: MapPosition, x: number, z: number): number {
  return (position.x - x) ** 2 + (position.z - z) ** 2;
}
/** Represent an area with a supplied point closest to its center. */
function representativePosition(map: TarkovMap, location: MapBossSpawnLocation) {
  const positions = location.positions.filter((point) => isDrawableMapPosition(map, point));
  const first = positions[0];
  if (!first) return undefined;
  const x = positions.reduce((sum, point) => sum + point.x, 0) / positions.length;
  const z = positions.reduce((sum, point) => sum + point.z, 0) / positions.length;
  return positions.reduce(
    (closest, point) =>
      squaredDistance(point, x, z) < squaredDistance(closest, x, z) ? point : closest,
    first
  );
}
export function getBossPins(map: TarkovMap): BossPin[] {
  const pins = new Map<string, BossPin>();
  const bosses = map.bossSpawns ?? [];
  bosses.filter((boss) => boss.chance > 0).forEach((boss) => addBossPins(pins, map, boss));
  return [...pins.values()];
}
function addBossPins(pins: Map<string, BossPin>, map: TarkovMap, boss: MapBossSpawn) {
  boss.locations.forEach((location) => {
    if (location.chance === 0) return;
    const position = representativePosition(map, location);
    if (!position) return;
    const key = `${position.x},${position.y},${position.z}`;
    const pin = pins.get(key) ?? { position, encounters: [] };
    pin.encounters.push({ boss, location });
    pins.set(key, pin);
  });
}
