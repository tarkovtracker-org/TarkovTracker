// Image-pixel coordinates already include the SVG viewBox offset (+174, +27).
// For example, the ritual circle at (677.5, 670.96) is centered at (852, 698).
export const HIDEOUT_MAP_SIZE = { width: 1178, height: 793 } as const;
export const HIDEOUT_AREAS = [
  'workshop',
  'gym',
  'living',
  'water',
  'utilities',
  'security',
] as const;
export type HideoutArea = (typeof HIDEOUT_AREAS)[number];
export const AREA_LABELS: Record<HideoutArea, string> = {
  workshop: 'page.hideout.map.areas.workshop',
  gym: 'page.hideout.map.areas.gym',
  living: 'page.hideout.map.areas.living',
  water: 'page.hideout.map.areas.water',
  utilities: 'page.hideout.map.areas.utilities',
  security: 'page.hideout.map.areas.security',
};
export type HideoutPin = { area: HideoutArea; x: number; y: number };
export const HIDEOUT_PINS: Readonly<Partial<Record<string, HideoutPin>>> = {
  'air-filtering-unit': { area: 'water', x: 974, y: 286 },
  'bitcoin-farm': { area: 'utilities', x: 589, y: 355 },
  'booze-generator': { area: 'water', x: 808, y: 249 },
  'cultist-circle': { area: 'security', x: 852, y: 698 },
  'defective-wall': { area: 'gym', x: 762, y: 214 },
  'gear-rack': { area: 'gym', x: 670, y: 258 },
  generator: { area: 'utilities', x: 672, y: 429 },
  gym: { area: 'gym', x: 699, y: 134 },
  'hall-of-fame': { area: 'gym', x: 511, y: 198 },
  heating: { area: 'living', x: 1095, y: 218 },
  illumination: { area: 'utilities', x: 666, y: 349 },
  'intelligence-center': { area: 'workshop', x: 550, y: 316 },
  lavatory: { area: 'workshop', x: 357, y: 346 },
  library: { area: 'living', x: 1046, y: 182 },
  medstation: { area: 'living', x: 904, y: 196 },
  'nutrition-unit': { area: 'water', x: 842, y: 359 },
  'rest-space': { area: 'living', x: 981, y: 154 },
  'scav-case': { area: 'security', x: 675, y: 507 },
  security: { area: 'security', x: 632, y: 502 },
  'shooting-range': { area: 'workshop', x: 332, y: 279 },
  'solar-power': { area: 'utilities', x: 640, y: 446 },
  stash: { area: 'workshop', x: 528, y: 435 },
  vents: { area: 'utilities', x: 622, y: 413 },
  'water-collector': { area: 'water', x: 721, y: 297 },
  'weapon-rack': { area: 'workshop', x: 455, y: 330 },
  workbench: { area: 'workshop', x: 467, y: 269 },
};
