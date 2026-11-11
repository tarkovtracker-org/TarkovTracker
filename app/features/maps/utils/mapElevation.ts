import floorData from '@/data/mapFloors.json';
import { createMapIconSvg, MAP_ELEVATION_ARROW_PATHS } from '@/features/maps/utils/mapIcons';
import type { TarkovMap } from '@/types/tarkov';
type Bounds = number[][];
type Extent = { height: number[]; bounds?: Bounds[] };
type FloorConfig = {
  order: string[];
  base: string;
  height: number[];
  layers: Array<{ floor: string; extents: Extent[] }>;
};
export type MapElevation = {
  position?: { x: number; y?: number; z: number };
  top?: number;
  bottom?: number;
};
const configs: Record<string, FloorConfig> = floorData;
const inBounds = (position: NonNullable<MapElevation['position']>, bounds: Bounds): boolean =>
  [position.x, position.z].every(
    (value, axis) =>
      value >= Math.min(bounds[0]![axis]!, bounds[1]![axis]!) &&
      value <= Math.max(bounds[0]![axis]!, bounds[1]![axis]!)
  );
const inHeight = (height: number, range: number[]): boolean =>
  height >= range[0]! && height < range[1]!;
function configKey(map: TarkovMap): string {
  if (typeof map.svg === 'object') return map.svg.file.replace(/\.svg$/, '').toLowerCase();
  return map.tile?.defaultFloor === 'First_Level' ? 'lab' : '';
}
function getConfig(map: TarkovMap): FloorConfig | undefined {
  const render = typeof map.svg === 'object' ? map.svg : map.tile;
  if ((render?.floors?.length ?? 0) < 2) return undefined;
  return configs[configKey(map)];
}
function floorsAtHeight(
  config: FloorConfig,
  position: NonNullable<MapElevation['position']>,
  y: number
): string[] {
  const matches = config.layers.flatMap((layer) =>
    layer.extents
      .filter(
        (extent) =>
          inHeight(y, extent.height) &&
          (!extent.bounds || extent.bounds.some((bounds) => inBounds(position, bounds)))
      )
      .map((extent) => ({ floor: layer.floor, scoped: Boolean(extent.bounds) }))
  );
  const scoped = matches.filter((match) => match.scoped);
  const floors = (scoped.length ? scoped : matches).map((match) => match.floor);
  return floors.length ? floors : inHeight(y, config.height) ? [config.base] : [];
}
function heightSamples(marker: MapElevation, config: FloorConfig): number[] {
  const { bottom, top } = marker;
  if (![bottom, top].every(Number.isFinite)) return [marker.position?.y ?? NaN];
  return intervalSamples(bottom!, top!, config);
}
function intervalSamples(bottom: number, top: number, config: FloorConfig): number[] {
  if (bottom > top) return [];
  if (bottom === top) return [bottom];
  const edges = [
    bottom,
    top,
    ...config.layers.flatMap((layer) => layer.extents.flatMap((extent) => extent.height)),
    ...config.height,
  ]
    .filter((y) => y >= bottom! && y <= top!)
    .sort((a, b) => a - b);
  return edges.slice(1).flatMap((edge, i) => (edge > edges[i]! ? [(edge + edges[i]!) / 2] : []));
}
function floorIndices(config: FloorConfig, marker: MapElevation): number[] {
  const samples = heightSamples(marker, config);
  if (!samples.length || !samples.every(Number.isFinite)) return [-1];
  const floors = samples.map((y) => floorsAtHeight(config, marker.position!, y));
  if (floors.some((names) => !names.length)) return [-1];
  return floors.flat().map((floor) => config.order.indexOf(floor));
}
function floorDistance(selected: number, indices: number[]): number {
  if (selected < 0 || indices.includes(-1)) return 0;
  return Math.min(Math.max(selected, Math.min(...indices)), Math.max(...indices)) - selected;
}
/** Signed number of selectable levels toward a marker. Unknown/ambiguous heights have no arrow. */
export function getMapFloorDelta(
  map: TarkovMap,
  selectedFloor: string,
  marker: MapElevation
): number {
  const config = getConfig(map);
  const position = marker.position;
  if (!config || !position || ![position.x, position.z].every(Number.isFinite)) return 0;
  return floorDistance(config.order.indexOf(selectedFloor), floorIndices(config, marker));
}
/** Floor badge position on a pin: on the head's upper-left shoulder, growing away from the head. */
const PIN_BADGE_POSITION_CLASS = 'absolute -top-11 right-2';
/** One level is clear from the arrow alone; more levels add the count beside it. */
function levelCount(delta: number): HTMLElement[] {
  if (Math.abs(delta) < 2) return [];
  const count = document.createElement('span');
  count.className = 'pr-0.5';
  count.textContent = String(Math.abs(delta));
  return [count];
}
/**
 * Always-visible floor badge: a solid arrow toward the marker's floor, plus the number of levels
 * when it is more than one. The translated description is the badge's accessible name.
 */
export function createElevationIndicator(
  delta: number,
  label: string,
  onPin = true
): HTMLElement | null {
  if (!delta) return null;
  const direction = delta > 0 ? 'up' : 'down';
  const indicator = document.createElement('span');
  indicator.className = `map-elevation pointer-events-none inline-flex h-4.5 min-w-4.5 items-center justify-center gap-px rounded-full bg-black/85 px-0.5 text-[11px] leading-none font-bold text-white tabular-nums shadow-[0_1px_3px_rgba(0,0,0,0.7)] ring-1 ring-white/80 ${onPin ? PIN_BADGE_POSITION_CLASS : ''}`;
  indicator.dataset.direction = direction;
  indicator.append(
    createMapIconSvg(MAP_ELEVATION_ARROW_PATHS[direction], 'size-3.5 shrink-0'),
    ...levelCount(delta)
  );
  indicator.setAttribute('role', 'img');
  indicator.setAttribute('aria-label', label);
  indicator.title = label;
  return indicator;
}
