/**
 * 24x24 Material Design Icons path data (Apache-2.0, @iconify-json/mdi) for map overlays. Leaflet
 * markers and popups are plain DOM, so the map and the Layers legend share these paths.
 */
export const MAP_REQUIREMENT_ICON_PATHS: Record<string, string> = {
  // mdi:cash
  money:
    'M3 6h18v12H3zm9 3a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3M7 8a2 2 0 0 1-2 2v4a2 2 0 0 1 2 2h10a2 2 0 0 1 2-2v-4a2 2 0 0 1-2-2z',
  // mdi:package-variant-closed
  transfer:
    'M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.99.99 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88zM12 4.15l-1.89 1.07L16 8.61l1.96-1.11zM6.04 7.5L12 10.85l1.96-1.1l-5.88-3.4zM5 15.91l6 3.38v-6.71L5 9.21zm14 0v-6.7l-6 3.37v6.71z',
  // mdi:key-variant
  key: 'M22 18v4h-4v-3h-3v-3h-3l-2.26-2.26c-.55.17-1.13.26-1.74.26a6 6 0 0 1-6-6a6 6 0 0 1 6-6a6 6 0 0 1 6 6c0 .61-.09 1.19-.26 1.74zM7 5a2 2 0 0 0-2 2a2 2 0 0 0 2 2a2 2 0 0 0 2-2a2 2 0 0 0-2-2',
  // mdi:tools
  gear: 'm21.71 20.29l-1.42 1.42a1 1 0 0 1-1.41 0L7 9.85A3.8 3.8 0 0 1 6 10a4 4 0 0 1-3.78-5.3l2.54 2.54l.53-.53l1.42-1.42l.53-.53L4.7 2.22A4 4 0 0 1 10 6a3.8 3.8 0 0 1-.15 1l11.86 11.88a1 1 0 0 1 0 1.41M2.29 18.88a1 1 0 0 0 0 1.41l1.42 1.42a1 1 0 0 0 1.41 0l5.47-5.46l-2.83-2.83M20 2l-4 2v2l-2.17 2.17l2 2L18 8h2l2-4Z',
  // mdi:bag-personal-off
  no_backpack:
    'M20 19.35L2.38 1.73L1.11 3l3.66 3.66C4.27 7.34 4 8.16 4 9v11a2 2 0 0 0 2 2h12c.56 0 1.08-.24 1.46-.65l1.38 1.38l1.27-1.27zM9 16v2H8v-2H6v-1h7.11l1 1zm11-7a4 4 0 0 0-4-4V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v.8l12 12zm-6-4h-4V4h4z',
  // mdi:shield-off
  no_armor:
    'M1 4.27L2.28 3L20.5 21.22l-1.27 1.28L17 20.25c-1.43 1.32-3.13 2.29-5 2.75c-5.16-1.26-9-6.45-9-12V6.27zM12 1l9 4v6c0 2.28-.65 4.5-1.77 6.41L5.65 3.82z',
  // mdi:cancel
  restriction:
    'M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12S6.5 2 12 2m0 2c-1.9 0-3.6.6-4.9 1.7l11.2 11.2c1-1.4 1.7-3.1 1.7-4.9c0-4.4-3.6-8-8-8m4.9 14.3L5.7 7.1C4.6 8.4 4 10.1 4 12c0 4.4 3.6 8 8 8c1.9 0 3.6-.6 4.9-1.7',
  // mdi:alert-circle
  conditional:
    'M13 13h-2V7h2m0 10h-2v-2h2M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2',
  // mdi:handshake
  coop: 'M11 6h3l3.29-3.3a1 1 0 0 1 1.42 0l2.58 2.59a1 1 0 0 1 0 1.41L19 9h-8v2a1 1 0 0 1-1 1a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2m-6 5v4l-2.29 2.29a1 1 0 0 0 0 1.41l2.58 2.59a1 1 0 0 0 1.42 0L11 17h4a1 1 0 0 0 1-1v-1h1a1 1 0 0 0 1-1v-1h1a1 1 0 0 0 1-1v-1h-7v1a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9Z',
  // mdi:power
  activation:
    'm16.56 5.44l-1.45 1.45A5.97 5.97 0 0 1 18 12a6 6 0 0 1-6 6a6 6 0 0 1-6-6c0-2.17 1.16-4.06 2.88-5.12L7.44 5.44A7.96 7.96 0 0 0 4 12a8 8 0 0 0 8 8a8 8 0 0 0 8-8c0-2.72-1.36-5.12-3.44-6.56M13 3h-2v10h2',
  // mdi:train
  train:
    'M12 2c-4 0-8 .5-8 4v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-3.58-4-8-4M7.5 17A1.5 1.5 0 0 1 6 15.5A1.5 1.5 0 0 1 7.5 14A1.5 1.5 0 0 1 9 15.5A1.5 1.5 0 0 1 7.5 17m3.5-7H6V6h5zm2 0V6h5v4zm3.5 7a1.5 1.5 0 0 1-1.5-1.5a1.5 1.5 0 0 1 1.5-1.5a1.5 1.5 0 0 1 1.5 1.5a1.5 1.5 0 0 1-1.5 1.5',
  // mdi:timer-outline
  timer:
    'M12 20a7 7 0 0 1-7-7a7 7 0 0 1 7-7a7 7 0 0 1 7 7a7 7 0 0 1-7 7m7.03-12.61l1.42-1.42c-.45-.51-.9-.97-1.41-1.41L17.62 6c-1.55-1.26-3.5-2-5.62-2a9 9 0 0 0-9 9a9 9 0 0 0 9 9c5 0 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61M11 14h2V8h-2m4-7H9v2h6z',
  // mdi:firework
  flare:
    'm5.8 16.59l-1.3-1.31l7.76-7.78l4.24 4.24l-7.78 7.76l-1.43-1.41c-.25.07-.49.19-.66.41c-.06.07-.13.15-.13.24c-.08.14-.12.26-.18.41c-.11.27-.23.54-.39.78c-.12.17-.25.33-.4.46c-.11.11-.24.2-.37.27c-.08.05-.16.1-.26.13c-.6.25-1.27.21-1.9.21v-2h.9c.1 0 .18 0 .26-.06l.05-.05c.07-.08.13-.19.18-.29c.08-.18.14-.36.21-.54l.04-.1c.12-.27.26-.51.44-.73c.1-.13.22-.23.34-.36c.12-.1.24-.2.38-.28M21 3l-1.12 8.19l-7.07-7.07z',
  // mdi:smoke
  green_smoke:
    'M17 19v3h-2v-3c0-1.1-.9-2-2-2h-3c-2.8 0-5-2.2-5-5c0-1.2.4-2.2 1.1-3.1C3.8 8.5 2 6.4 2 4c0-.7.2-1.4.4-2h2.4c-.5.5-.8 1.2-.8 2c0 1.7 1.3 3 3 3h3v2c-1.7 0-3 1.3-3 3s1.3 3 3 3h3c2.2 0 4 1.8 4 4m.9-10.1C20.2 8.5 22 6.4 22 4c0-.7-.2-1.4-.4-2h-2.4c.5.5.8 1.2.8 2c0 1.7-1.3 3-3 3h-1.2c.1.3.2.6.2 1c0 1.7-1.3 3-3 3v2c2.8 0 5 2.2 5 5v4h2v-4c0-2.7-1.5-5-3.8-6.2c.9-.7 1.5-1.7 1.7-2.9',
  // mdi:help
  unknown:
    'M10 19h3v3h-3zm2-17c5.35.22 7.68 5.62 4.5 9.67c-.83 1-2.17 1.66-2.83 2.5C13 15 13 16 13 17h-3c0-1.67 0-3.08.67-4.08c.66-1 2-1.59 2.83-2.25C15.92 8.43 15.32 5.26 12 5a3 3 0 0 0-3 3H6a6 6 0 0 1 6-6',
};
/** mdi:arrow-up-bold / mdi:arrow-down-bold: solid shapes stay crisp at badge size. */
export const MAP_ELEVATION_ARROW_PATHS = {
  up: 'M15 20H9v-8H4.16L12 4.16L19.84 12H15z',
  down: 'M9 4h6v8h4.84L12 19.84L4.16 12H9z',
} as const;
/** Requirement order for the Layers legend; the most common requirements come first. */
export const MAP_REQUIREMENT_LEGEND_KEYS = [
  'money',
  'transfer',
  'key',
  'gear',
  'no_backpack',
  'no_armor',
  'flare',
  'activation',
  'green_smoke',
  'train',
  'timer',
  'conditional',
  'restriction',
  'unknown',
] as const;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** A decorative 24x24 icon that takes its color from `currentColor`. */
export function createMapIconSvg(path: string, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('fill', 'currentColor');
  shape.setAttribute('d', path);
  svg.appendChild(shape);
  return svg;
}
