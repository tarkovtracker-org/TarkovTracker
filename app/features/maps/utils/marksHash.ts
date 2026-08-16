/**
 * Hashing utilities for map objective marks.
 *
 * `getMarksHash` produces a cheap, allocation-light fingerprint of the marks
 * relevant to a given map. It is used by LeafletMap.vue to skip re-rendering
 * markers when nothing that affects them has changed.
 */
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
const updateFnv1a = (hash: number, value: string | number): number => {
  const token = typeof value === 'number' ? String(value) : value;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
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
const hashLocationPositions = (positions?: Array<{ x: number; y?: number; z: number }>): number => {
  let locationHash = updateFnv1a(FNV1A_OFFSET_BASIS, positions?.length ?? 0);
  for (const point of positions ?? []) {
    locationHash = updateFnv1a(locationHash, point.x);
    locationHash = updateFnv1a(locationHash, point.z);
  }
  return locationHash;
};
export function getMarksHash(marks: MapMark[], mapId: string): string {
  let hash = updateFnv1a(FNV1A_OFFSET_BASIS, mapId);
  hash = updateFnv1a(hash, marks.length);
  for (const mark of marks) {
    hash = updateFnv1a(hash, mark.id ?? '');
    // pinned affects marker rendering (fill colour), so it must be folded in here too.
    // Any field that changes how a mark is drawn — not just its identity — belongs in this hash.
    hash = updateFnv1a(hash, mark.pinned ? '1' : '0');
    const sortedUsers = [...(mark.users ?? [])].sort();
    hash = updateFnv1a(hash, sortedUsers.length);
    for (const user of sortedUsers) {
      hash = updateFnv1a(hash, user);
    }
    const zoneHashes = mark.zones
      .filter((zone) => zone.map.id === mapId)
      .map((zone) => hashZoneOutline(zone.outline))
      .sort((a, b) => a - b);
    hash = updateFnv1a(hash, zoneHashes.length);
    for (const zoneHash of zoneHashes) {
      hash = updateFnv1a(hash, zoneHash);
    }
    const locationHashes = (mark.possibleLocations ?? [])
      .filter((location) => location.map.id === mapId)
      .map((location) => hashLocationPositions(location.positions))
      .sort((a, b) => a - b);
    hash = updateFnv1a(hash, locationHashes.length);
    for (const locationHash of locationHashes) {
      hash = updateFnv1a(hash, locationHash);
    }
  }
  return hash.toString(16).padStart(8, '0');
}
