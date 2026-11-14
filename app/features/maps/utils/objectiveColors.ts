import { normalizeHexColor } from '@/features/maps/utils/colorContrast';
import {
  MAP_OBJECTIVE_GLYPH_LEGEND_KINDS,
  type MapObjectiveGlyphKind,
} from '@/features/maps/utils/objectiveGlyphs';
/**
 * What an objective chip's fill encodes (#920): its task category (Regular, Pinned, Team), its
 * quest, or the action its objective type asks for. The glyph always names the action, so color is
 * never the only cue.
 */
export const MAP_OBJECTIVE_COLOR_MODES = ['category', 'task', 'type'] as const;
export type MapObjectiveColorMode = (typeof MAP_OBJECTIVE_COLOR_MODES)[number];
export const DEFAULT_MAP_OBJECTIVE_COLOR_MODE: MapObjectiveColorMode = 'category';
/**
 * Published palettes designed to stay distinguishable with protanopia, deuteranopia and
 * tritanopia: Okabe & Ito (2008) without black, and Paul Tol's "bright" (without grey) and "muted"
 * qualitative schemes (https://personal.sron.nl/~pault/). Quest and objective-type colors come
 * only from these lists; a user's per-quest pick is the one exception.
 */
export const MAP_OBJECTIVE_PALETTES = {
  okabe_ito: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'],
  tol_bright: ['#4477aa', '#66ccee', '#228833', '#ccbb44', '#ee6677', '#aa3377'],
  tol_muted: [
    '#332288',
    '#88ccee',
    '#44aa99',
    '#117733',
    '#999933',
    '#ddcc77',
    '#cc6677',
    '#882255',
    '#aa4499',
  ],
} as const satisfies Record<string, readonly string[]>;
export type MapObjectivePaletteKey = keyof typeof MAP_OBJECTIVE_PALETTES;
export const MAP_OBJECTIVE_PALETTE_KEYS = Object.keys(
  MAP_OBJECTIVE_PALETTES
) as MapObjectivePaletteKey[];
export const DEFAULT_MAP_OBJECTIVE_PALETTE: MapObjectivePaletteKey = 'okabe_ito';
/** Tol's pale grey: the generic flag stays neutral and apart from every palette color. */
export const OTHER_OBJECTIVE_TYPE_COLOR = '#dddddd';
export const normalizeMapObjectiveColorMode = (value: unknown): MapObjectiveColorMode =>
  MAP_OBJECTIVE_COLOR_MODES.find((mode) => mode === value) ?? DEFAULT_MAP_OBJECTIVE_COLOR_MODE;
export const normalizeMapObjectivePalette = (value: unknown): MapObjectivePaletteKey =>
  MAP_OBJECTIVE_PALETTE_KEYS.find((key) => key === value) ?? DEFAULT_MAP_OBJECTIVE_PALETTE;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** One stored pick as `[taskId, #rrggbb]`, or nothing when the ID or color is malformed. */
const normalizeTaskColorEntry = ([taskId, color]: [string, unknown]): [string, string][] => {
  const hex = normalizeHexColor(color);
  return taskId.length > 0 && hex ? [[taskId, hex]] : [];
};
/** Per-quest color picks keyed by task ID; drops malformed IDs and colors. */
export const normalizeMapTaskColors = (value: unknown): Record<string, string> =>
  isRecord(value) ? Object.fromEntries(Object.entries(value).flatMap(normalizeTaskColorEntry)) : {};
/** 32-bit FNV-1a, so a quest's preferred palette slot is the same in every session. */
const hashTaskId = (taskId: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < taskId.length; i++) {
    hash ^= taskId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};
/** The least-used slot, searching forward from the preferred one so ties keep the preference. */
const pickPaletteSlot = (uses: number[], preferred: number): number => {
  let best = preferred;
  for (let step = 1; step < uses.length; step++) {
    const slot = (preferred + step) % uses.length;
    if (uses[slot]! < uses[best]!) best = slot;
  }
  return best;
};
const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : Number(a > b));
/**
 * One color per quest. Each quest prefers the palette slot its ID hashes to and takes the
 * least-used slot from there, so colors repeat only once the palette is used up. The result
 * depends only on the set of IDs (not their order), so hiding or focusing quests from the same
 * set keeps every color. A user's pick for a quest replaces only that quest's color: picked
 * quests still hold their automatic slot, so picking or resetting one never recolors another.
 */
export function assignTaskColors(
  taskIds: readonly string[],
  palette: readonly string[],
  overrides: Readonly<Record<string, string>> = {}
): Map<string, string> {
  const colors = new Map<string, string>();
  const uses = palette.map(() => 0);
  for (const taskId of [...new Set(taskIds)].sort(compareCodeUnits)) {
    const slot = pickPaletteSlot(uses, hashTaskId(taskId) % palette.length);
    uses[slot]! += 1;
    const override = Object.hasOwn(overrides, taskId) ? overrides[taskId] : undefined;
    colors.set(taskId, override ?? palette[slot]!);
  }
  return colors;
}
/** Objective-type colors in legend order; the generic flag keeps the neutral grey. */
export function getObjectiveTypeColors(
  palette: readonly string[]
): Record<MapObjectiveGlyphKind, string> {
  const colors = { other: OTHER_OBJECTIVE_TYPE_COLOR } as Record<MapObjectiveGlyphKind, string>;
  MAP_OBJECTIVE_GLYPH_LEGEND_KINDS.filter((kind) => kind !== 'other').forEach((kind, index) => {
    colors[kind] = palette[index % palette.length]!;
  });
  return colors;
}
