import { isValidMapSvgConfig, isValidMapTileConfig } from '@/utils/mapCoordinates';
import type { TarkovMap } from '@/types/tarkov';
type Position = { x: number; z: number };
function withinBounds(position: Position, bounds: [[number, number], [number, number]]): boolean {
  return [position.x, position.z].every(
    (value, axis) =>
      value >= Math.min(bounds[0][axis]!, bounds[1][axis]!) &&
      value <= Math.max(bounds[0][axis]!, bounds[1][axis]!)
  );
}
function withinMapBounds(map: TarkovMap, position: Position): boolean {
  if (isValidMapSvgConfig(map.svg)) return withinBounds(position, map.svg.bounds);
  if (isValidMapTileConfig(map.tile)) return withinBounds(position, map.tile.bounds);
  return false;
}
/** Validate source-map coordinates, never the transit destination's coordinate system. */
export function isDrawableMapPosition(map: TarkovMap, position?: Position): boolean {
  if (!position || ![position.x, position.z].every(Number.isFinite)) return false;
  // Foreign-map extracts contaminate Ground Zero in all three upstream modes.
  // Keep other maps' legitimate edge exits; this guard also applies to cached catalogs.
  const groundZero = ['653e6760052c01c1c805532f', '65b8d6f5cdde2479cb2a3125'].includes(map.id);
  return !groundZero || withinMapBounds(map, position);
}
