import { isCoopExtract } from '@/features/maps/composables/useLeafletMapControls';
import { createMapIconSvg } from '@/features/maps/utils/mapIcons';
import type { MapExtract } from '@/types/tarkov';
import type { MapMarkerColorKey } from '@/utils/theme-colors';
/** Marker categories that render an icon chip on the map and in the legend. */
export type MapMarkerGlyphKind =
  'pmc' | 'scav' | 'shared' | 'coop' | 'transit' | 'extract' | 'boss';
/** Running through a doorway: the familiar extraction cue, without a faction restriction. */
const EXIT_GLYPH_PATH =
  'M13.34 8.17c-.93 0-1.69-.77-1.69-1.7a1.69 1.69 0 0 1 1.69-1.69c.94 0 1.7.76 1.7 1.69s-.76 1.7-1.7 1.7M10.3 19.93l-5.93-1.18l.34-1.7l4.15.85l1.35-6.86l-1.52.6v2.86H7v-3.96l4.4-1.87l.67-.08c.6 0 1.1.34 1.43.85l.86 1.35c.68 1.21 2.03 2.03 3.64 2.03v1.68c-1.86 0-3.56-.83-4.66-2.1l-.5 2.54l1.77 1.69V23h-1.69v-5.1l-1.78-1.69zM21 23h-2V3H6v13.11l-2-.42V1h17zM6 23H4v-3.22l2 .42z';
/**
 * 24x24 Material Design Icons path data (Apache-2.0, @iconify-json/mdi). Leaflet markers are
 * plain DOM, so the map and the legend share these paths instead of rendering UIcon per marker.
 */
export const MAP_MARKER_GLYPH_PATHS: Record<MapMarkerGlyphKind, string> = {
  pmc: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12c5.16-1.26 9-6.45 9-12V5zm0 4a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3m5.13 12A9.7 9.7 0 0 1 12 20.92A9.7 9.7 0 0 1 6.87 17c-.34-.5-.63-1-.87-1.53c0-1.65 2.71-3 6-3s6 1.32 6 3c-.24.53-.53 1.03-.87 1.53',
  scav: 'M12 2a9 9 0 0 0-9 9a8.99 8.99 0 0 0 4 7.47V22h2v-3h2v3h2v-3h2v3h2v-3.54c2.47-1.65 4-4.46 4-7.46a9 9 0 0 0-9-9m-4 9a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2m8 0a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2m-4 3l1.5 3h-3z',
  shared: EXIT_GLYPH_PATH,
  coop: 'M11 6h3l3.29-3.3a1 1 0 0 1 1.42 0l2.58 2.59a1 1 0 0 1 0 1.41L19 9h-8v2a1 1 0 0 1-1 1a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2m-6 5v4l-2.29 2.29a1 1 0 0 0 0 1.41l2.58 2.59a1 1 0 0 0 1.42 0L11 17h4a1 1 0 0 0 1-1v-1h1a1 1 0 0 0 1-1v-1h1a1 1 0 0 0 1-1v-1h-7v1a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9Z',
  transit:
    'M16.5 15.5H22V17h-5.5v1.75l-2.5-2.5l2.5-2.5zm3 4.25V18l2.5 2.5l-2.5 2.5v-1.75H14v-1.5zM9.5 5.5a2 2 0 0 1-2-2a2 2 0 0 1 2-2a2 2 0 0 1 2 2a2 2 0 0 1-2 2M5.75 8.9L4 9.65V13H2V8.3l5.25-2.15Q7.625 6 8 6c.7 0 1.35.35 1.7.95l.95 1.6C11.55 10 13.15 11 15 11v2c-2.2 0-4.15-1-5.45-2.6l-.6 3L11 15.45V23H9v-6l-2.15-2l-1.75 8H3z',
  extract: EXIT_GLYPH_PATH,
  boss: 'M15.8 18.5l6 1.6l-.4 1.9l-9.4-2.5L2.6 22l-.5-1.9l6-1.6L2 16.9l.5-1.9l9.4 2.5l9.4-2.5l.5 1.9zM18 8c0 1.8-.8 3.3-2 4.4V15h-2v-2h-1v2h-2v-2h-1v2H8v-2.6C6.8 11.3 6 9.8 6 8a6 6 0 0 1 6-6a6 6 0 0 1 6 6m-7-.5c0-.8-.7-1.5-1.5-1.5S8 6.7 8 7.5S8.7 9 9.5 9S11 8.3 11 7.5m2 3.5l-1-2l-1 2zm3-3.5c0-.8-.7-1.5-1.5-1.5S13 6.7 13 7.5S13.7 9 14.5 9S16 8.3 16 7.5',
};
/** The user-customizable color that fills each glyph chip. */
export const MAP_MARKER_GLYPH_COLOR_KEYS: Record<MapMarkerGlyphKind, MapMarkerColorKey> = {
  pmc: 'PMC_EXTRACT',
  scav: 'SCAV_EXTRACT',
  shared: 'SHARED_EXTRACT',
  coop: 'COOP_EXTRACT',
  transit: 'TRANSIT',
  extract: 'DEFAULT_EXTRACT',
  boss: 'BOSS_SPAWN',
};
/** Classify an extract by who can use it in mode; unknown factions keep the generic exit glyph. */
export function getExtractGlyphKind(
  extract: MapExtract,
  mode = 'pvp'
): Exclude<MapMarkerGlyphKind, 'transit' | 'boss'> {
  if (extract.faction === 'shared') return isCoopExtract(extract, mode) ? 'coop' : 'shared';
  return extract.faction === 'pmc' || extract.faction === 'scav' ? extract.faction : 'extract';
}
// Pins are plain Leaflet DOM, so their Tailwind utilities live here (Tailwind scans this file).
// The pin is a teardrop: a 30px square with three rounded corners, turned 45deg so the square
// corner points down. Its tip (36px below the top of the head box) is the marker position. A
// highlight, inner shading, a white border with a dark outer ring and a drop shadow keep it
// readable on light and dark map areas; a small ground shadow sits under the tip. Beside the head,
// a side row holds always-visible extract requirement icons followed by the name label. The label
// is hidden until the pin is hovered, tapped open (`is-open`), or the map shows all names
// (`map-names-visible` on an ancestor).
/** Shared look of the pin body on the map and in the Layers legend. */
export const MAP_PIN_BODY_SKIN_CLASS =
  'rounded-[50%_50%_50%_0] border-white bg-(--pin-color) bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.6),rgba(255,255,255,0)_62%)] shadow-[inset_0_-4px_6px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.6)] -rotate-45';
/** Shared look of the white glyph inside a pin body. */
export const MAP_PIN_GLYPH_SKIN_CLASS = 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]';
const PIN_CLASS = 'map-pin group/pin relative size-0 cursor-pointer';
const PIN_SHADOW_CLASS =
  'map-pin-shadow pointer-events-none absolute -top-0.75 -left-2 h-1.5 w-4 rounded-full bg-black/55 blur-[1.5px]';
const PIN_HEAD_CLASS =
  'map-pin-head absolute -top-9 -left-3.75 h-9 w-7.5 origin-bottom drop-shadow-[0_3px_3px_rgba(0,0,0,0.6)] transition-transform duration-150 group-hover/pin:scale-115 group-[.is-open]/pin:scale-115';
const PIN_BODY_CLASS = `map-pin-body absolute top-0 left-0 size-7.5 border-2 ${MAP_PIN_BODY_SKIN_CLASS}`;
const PIN_GLYPH_CLASS = `absolute top-1.5 left-1.5 size-4.5 ${MAP_PIN_GLYPH_SKIN_CLASS}`;
// The side row is as tall as the label, so icons stay put when the label appears.
const PIN_SIDE_CLASS = 'map-pin-side absolute -top-8 left-4.5 flex h-6 items-center gap-1';
const PIN_LABEL_CLASS =
  'map-pin-label hidden rounded-full border-2 border-(--pin-color) bg-surface-900 px-2 py-1 text-xs leading-none font-semibold whitespace-nowrap text-surface-100 shadow-md group-hover/pin:block group-[.is-open]/pin:block in-[.map-names-visible]:block';
/**
 * A pin whose marker is on another floor fades and desaturates so the selected floor reads first;
 * its floor arrow stays fully opaque. Hovering or opening the pin restores it.
 */
const OFF_FLOOR_CLASSES = [
  'opacity-55',
  'saturate-50',
  'group-hover/pin:opacity-100',
  'group-hover/pin:saturate-100',
  'group-[.is-open]/pin:opacity-100',
  'group-[.is-open]/pin:saturate-100',
];
/** Leaflet's marker wrapper: lift a hovered or opened pin and its name above its neighbours. */
export const MAP_PIN_ICON_CLASS = 'hover:z-100000! has-[.is-open]:z-100000!';
/**
 * Build a map pin: a colored teardrop with a glyph whose tip sits exactly on the marker position,
 * and a name label beside it. The accessible name is always the label.
 */
export function createMapPinElement(
  kind: MapMarkerGlyphKind,
  color: string,
  label: string
): HTMLElement {
  const pin = document.createElement('div');
  pin.className = `${PIN_CLASS} map-pin--${kind}`;
  pin.style.setProperty('--pin-color', color);
  pin.setAttribute('role', 'img');
  pin.setAttribute('aria-label', label);
  const shadow = document.createElement('span');
  shadow.className = PIN_SHADOW_CLASS;
  const head = document.createElement('span');
  head.className = PIN_HEAD_CLASS;
  const body = document.createElement('span');
  body.className = PIN_BODY_CLASS;
  head.append(body, createMapIconSvg(MAP_MARKER_GLYPH_PATHS[kind], PIN_GLYPH_CLASS));
  const side = document.createElement('span');
  side.className = PIN_SIDE_CLASS;
  const text = document.createElement('span');
  text.className = kind === 'transit' ? `${PIN_LABEL_CLASS} border-dashed` : PIN_LABEL_CLASS;
  text.textContent = label;
  side.append(text);
  pin.append(shadow, head, side);
  return pin;
}
/** Fade a pin's body, shadow and requirement icons; added indicators such as the floor arrow
 * keep full contrast. */
export function dimOffFloorPin(pin: HTMLElement): void {
  pin.classList.add('map-pin--off-floor');
  pin
    .querySelectorAll('.map-pin-head, .map-pin-shadow, .map-extract-requirements')
    .forEach((part) => part.classList.add(...OFF_FLOOR_CLASSES));
}
