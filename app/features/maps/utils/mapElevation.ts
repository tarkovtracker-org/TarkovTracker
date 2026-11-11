import floorData from '@/data/mapFloors.json';
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
/** Always-visible arrow count; the translated description is also available to screen readers. */
export function createElevationIndicator(delta: number, label: string): HTMLElement | null {
  if (!delta) return null;
  const indicator = document.createElement('span');
  indicator.className =
    'map-elevation pointer-events-none absolute -top-7 right-5 rounded bg-surface-950/90 px-1 text-sm leading-none font-bold whitespace-nowrap text-white shadow';
  indicator.textContent = (delta > 0 ? '↑' : '↓').repeat(Math.abs(delta));
  indicator.setAttribute('role', 'img');
  indicator.setAttribute('aria-label', label);
  indicator.title = label;
  return indicator;
}
