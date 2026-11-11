import { createMapIconSvg } from '@/features/maps/utils/mapIcons';
import { MAP_MARKER_GLYPH_PATHS } from '@/features/maps/utils/markerGlyphs';
/** What the player does at an objective's map location; each action has one glyph. */
export type MapObjectiveGlyphKind =
  'visit' | 'find' | 'plant' | 'mark' | 'shoot' | 'use' | 'extract' | 'other';
/** Upstream objective `type` to the action its map location asks for. */
const OBJECTIVE_TYPE_GLYPHS: Record<string, MapObjectiveGlyphKind> = {
  visit: 'visit',
  zone: 'visit',
  findItem: 'find',
  findQuestItem: 'find',
  plantItem: 'plant',
  plantQuestItem: 'plant',
  place: 'plant',
  mark: 'mark',
  shoot: 'shoot',
  useItem: 'use',
  extract: 'extract',
};
/**
 * 24x24 Material Design Icons path data (Apache-2.0, @iconify-json/mdi). Solid shapes with
 * distinct outlines, so each action still reads at the 12 px size inside an objective dot.
 */
export const MAP_OBJECTIVE_GLYPH_PATHS: Record<MapObjectiveGlyphKind, string> = {
  // mdi:eye - visit or locate a place
  visit:
    'M12 9a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3m0 8a5 5 0 0 1-5-5a5 5 0 0 1 5-5a5 5 0 0 1 5 5a5 5 0 0 1-5 5m0-12.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5',
  // mdi:magnify - find and pick up an item
  find: 'M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5l-1.5 1.5l-5-5v-.79l-.27-.27A6.52 6.52 0 0 1 9.5 16A6.5 6.5 0 0 1 3 9.5A6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14S14 12 14 9.5S12 5 9.5 5',
  // mdi:tray-arrow-down - plant, stash or install an item
  plant:
    'M2 12h2v5h16v-5h2v5c0 1.11-.89 2-2 2H4a2 2 0 0 1-2-2zm10 3l5.55-5.46l-1.42-1.41L13 11.25V2h-2v9.25L7.88 8.13L6.46 9.55z',
  // mdi:access-point - mark with an MS2000 Marker (a radio beacon)
  mark: 'M4.93 4.93A9.97 9.97 0 0 0 2 12c0 2.76 1.12 5.26 2.93 7.07l1.41-1.41A7.94 7.94 0 0 1 4 12c0-2.21.89-4.22 2.34-5.66zm14.14 0l-1.41 1.41A7.96 7.96 0 0 1 20 12c0 2.22-.89 4.22-2.34 5.66l1.41 1.41A9.97 9.97 0 0 0 22 12c0-2.76-1.12-5.26-2.93-7.07M7.76 7.76A5.98 5.98 0 0 0 6 12c0 1.65.67 3.15 1.76 4.24l1.41-1.41A4 4 0 0 1 8 12c0-1.11.45-2.11 1.17-2.83zm8.48 0l-1.41 1.41A4 4 0 0 1 16 12c0 1.11-.45 2.11-1.17 2.83l1.41 1.41A5.98 5.98 0 0 0 18 12c0-1.65-.67-3.15-1.76-4.24M12 10a2 2 0 0 0-2 2a2 2 0 0 0 2 2a2 2 0 0 0 2-2a2 2 0 0 0-2-2',
  // mdi:pistol - eliminate targets in the area; the skull already means Scav extracts
  shoot:
    'M7 5h16v4h-1v1h-6a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2H9.62c-.38 0-.73.22-.9.56l-2.45 4.89c-.17.34-.51.55-.89.55H2s-3 0 1-6c0 0 3-4-1-4V5h1l.5-1h3zm7 7v-1a1 1 0 0 0-1-1h-1s-1 1 0 2a2 2 0 0 1-2-2a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1',
  // mdi:hand-pointing-up - use an item here, such as launching a signal flare
  use: 'M14 3v10l3.2-1.69l.22-.03c.29 0 .55.12.74.32l.74.77l-4.9 4.2c-.26.27-.61.43-1 .43H6.5c-.77 0-1.5-.7-1.5-1.5v-4.36c0-.61.35-1.14.85-1.34l4.94-2.2L12 7.47V3a1 1 0 0 1 1-1a1 1 0 0 1 1 1M5 19h8v3H5z',
  // mdi:exit-run - the same exit glyph the extract pins use
  extract: MAP_MARKER_GLYPH_PATHS.extract,
  // mdi:flag-variant - any other objective location
  other:
    'M6 3a1 1 0 0 1 1 1v.88C8.06 4.44 9.5 4 11 4c3 0 3 2 5 2c3 0 4-2 4-2v8s-1 2-4 2s-3-2-5-2c-3 0-4 2-4 2v7H5V4a1 1 0 0 1 1-1',
};
/** Layers legend order: the most common objective locations first. */
export const MAP_OBJECTIVE_GLYPH_LEGEND_KINDS = [
  'visit',
  'plant',
  'find',
  'mark',
  'shoot',
  'use',
  'extract',
  'other',
] as const satisfies readonly MapObjectiveGlyphKind[];
/** The glyph for an objective type; unknown or missing types use the generic flag. */
export const getObjectiveGlyphKind = (type: string | undefined): MapObjectiveGlyphKind =>
  (type && Object.hasOwn(OBJECTIVE_TYPE_GLYPHS, type) ? OBJECTIVE_TYPE_GLYPHS[type] : undefined) ??
  'other';
// Glyphs are plain Leaflet DOM, so their Tailwind utilities live here (Tailwind scans this file).
const GLYPH_CLASS =
  'map-objective-glyph pointer-events-none flex size-full items-center justify-center text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]';
/**
 * The decorative glyph drawn over an objective dot. It never takes pointer input, so hover,
 * click and the stacked-objective hit test keep using the dot underneath.
 */
export function createObjectiveGlyphElement(
  kind: MapObjectiveGlyphKind,
  offFloor = false
): HTMLElement {
  const glyph = document.createElement('span');
  glyph.className = `${GLYPH_CLASS} map-objective-glyph--${kind}${offFloor ? ' opacity-55' : ''}`;
  glyph.dataset.kind = kind;
  glyph.setAttribute('aria-hidden', 'true');
  glyph.append(createMapIconSvg(MAP_OBJECTIVE_GLYPH_PATHS[kind], 'size-3'));
  return glyph;
}
