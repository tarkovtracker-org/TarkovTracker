export interface MapZone {
  map: { id: string };
  outline: Array<{ x: number; z: number }>;
}
export interface MapMarkLocation {
  map: { id: string };
  positions?: Array<{ x: number; y?: number; z: number }>;
  [key: string]: unknown;
}
export interface MapMark {
  id?: string;
  zones: MapZone[];
  possibleLocations?: MapMarkLocation[];
  users?: string[];
  pinned?: boolean;
}
const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;
const compareCodeUnits = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};
const updateFnv1a = (hash: number, value: string | number): number => {
  const token = typeof value === 'number' ? String(value) : value;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.codePointAt(i) ?? 0;
    hash = Math.imul(hash, FNV1A_PRIME);
  }
  hash ^= 124;
  return Math.imul(hash, FNV1A_PRIME) >>> 0;
};
const hashZoneOutline = (outline: Array<{ x: number; z: number }>): number => {
  let zoneHash = updateFnv1a(FNV1A_OFFSET_BASIS, outline.length);
  for (const point of outline) {
    zoneHash = updateFnv1a(zoneHash, point.x);
    zoneHash = updateFnv1a(zoneHash, point.z);
  }
  return zoneHash;
};
const hashLocationPositions = (positions: Array<{ x: number; y?: number; z: number }>): number => {
  let locationHash = updateFnv1a(FNV1A_OFFSET_BASIS, positions.length);
  for (const point of positions) {
    locationHash = updateFnv1a(locationHash, point.x);
    locationHash = updateFnv1a(locationHash, point.z);
  }
  return locationHash;
};
const hashSortedValues = (hash: number, values: Array<string | number>): number => {
  let next = updateFnv1a(hash, values.length);
  for (const value of values) {
    next = updateFnv1a(next, value);
  }
  return next;
};
const markZoneHashes = (mark: MapMark, mapId: string): number[] =>
  mark.zones
    .filter((zone) => zone.map.id === mapId)
    .map((zone) => hashZoneOutline(zone.outline))
    .sort((a, b) => a - b);
const markLocationHashes = (mark: MapMark, mapId: string): number[] =>
  (mark.possibleLocations ?? [])
    .filter((location) => location.map.id === mapId)
    .map((location) => hashLocationPositions(location.positions ?? []))
    .sort((a, b) => a - b);
const hashMark = (hash: number, mark: MapMark, mapId: string): number => {
  let next = updateFnv1a(hash, mark.id ?? '');
  next = updateFnv1a(next, mark.pinned ? '1' : '0');
  next = hashSortedValues(next, [...(mark.users ?? [])].sort(compareCodeUnits));
  next = hashSortedValues(next, markZoneHashes(mark, mapId));
  return hashSortedValues(next, markLocationHashes(mark, mapId));
};
export function getMarksHash(marks: MapMark[], mapId: string): string {
  let hash = updateFnv1a(FNV1A_OFFSET_BASIS, mapId);
  hash = updateFnv1a(hash, marks.length);
  for (const mark of marks) {
    hash = hashMark(hash, mark, mapId);
  }
  return hash.toString(16).padStart(8, '0');
}
