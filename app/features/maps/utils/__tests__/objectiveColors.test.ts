import { describe, expect, it } from 'vitest';
import {
  assignTaskColors,
  DEFAULT_MAP_OBJECTIVE_COLOR_MODE,
  DEFAULT_MAP_OBJECTIVE_PALETTE,
  getObjectiveTypeColors,
  MAP_OBJECTIVE_PALETTE_KEYS,
  MAP_OBJECTIVE_PALETTES,
  normalizeMapObjectiveColorMode,
  normalizeMapObjectivePalette,
  normalizeMapTaskColors,
  OTHER_OBJECTIVE_TYPE_COLOR,
} from '@/features/maps/utils/objectiveColors';
import { MAP_OBJECTIVE_GLYPH_LEGEND_KINDS } from '@/features/maps/utils/objectiveGlyphs';
// Machado, Oliveira & Fernandes (2009) full-severity dichromacy matrices on linear RGB.
const SIMULATIONS = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;
const toLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const toLab = ([r, g, b]: number[]): number[] => {
  const [lr, lg, lb] = [r!, g!, b!].map((value) => Math.min(1, Math.max(0, value)));
  const x = (0.4124 * lr! + 0.3576 * lg! + 0.1805 * lb!) / 0.95047;
  const y = 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
  const z = (0.0193 * lr! + 0.1192 * lg! + 0.9505 * lb!) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const simulate = (hex: string, matrix: readonly (readonly number[])[]): number[] => {
  const linear = [1, 3, 5].map((start) => toLinear(parseInt(hex.slice(start, start + 2), 16)));
  return toLab(
    matrix.map((row) => row[0]! * linear[0]! + row[1]! * linear[1]! + row[2]! * linear[2]!)
  );
};
/** Smallest CIE76 color difference between any two colors, under each simulated vision type. */
const minimumDifference = (colors: readonly string[]): number => {
  let minimum = Number.POSITIVE_INFINITY;
  for (const matrix of Object.values(SIMULATIONS)) {
    const labs = colors.map((color) => simulate(color, matrix));
    labs.forEach((a, i) =>
      labs.slice(i + 1).forEach((b) => {
        minimum = Math.min(minimum, Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!));
      })
    );
  }
  return minimum;
};
describe('objective color palettes', () => {
  it.each(MAP_OBJECTIVE_PALETTE_KEYS)(
    'keeps every %s color apart with protanopia, deuteranopia and tritanopia',
    (key) => {
      const palette = MAP_OBJECTIVE_PALETTES[key];
      expect(new Set(palette).size).toBe(palette.length);
      // 12 is well above a just-noticeable difference (~2.3); the weakest pair measures 13.1.
      expect(minimumDifference(palette)).toBeGreaterThan(12);
      expect(minimumDifference([...palette, OTHER_OBJECTIVE_TYPE_COLOR])).toBeGreaterThan(10);
    }
  );
  it('colors every objective type from the palette and keeps the generic flag neutral', () => {
    const palette = MAP_OBJECTIVE_PALETTES.okabe_ito;
    const colors = getObjectiveTypeColors(palette);
    expect(Object.keys(colors).sort()).toEqual([...MAP_OBJECTIVE_GLYPH_LEGEND_KINDS].sort());
    expect(colors.other).toBe(OTHER_OBJECTIVE_TYPE_COLOR);
    const typed = MAP_OBJECTIVE_GLYPH_LEGEND_KINDS.filter((kind) => kind !== 'other');
    expect(typed.map((kind) => colors[kind])).toEqual([...palette]);
    // A shorter palette repeats from the start; the glyph still tells the types apart.
    const bright = getObjectiveTypeColors(MAP_OBJECTIVE_PALETTES.tol_bright);
    expect(bright.extract).toBe(MAP_OBJECTIVE_PALETTES.tol_bright[0]);
  });
});
describe('assignTaskColors', () => {
  const palette = MAP_OBJECTIVE_PALETTES.okabe_ito;
  const taskIds = [
    '5936d90786f7742b1420ba5b',
    '5967733e86f774602332fc84',
    '59674cd986f7744ab26e32f2',
  ];
  it('gives each quest a different palette color until the palette runs out', () => {
    const ids = Array.from({ length: palette.length }, (_, index) => `task-${index}`);
    const colors = assignTaskColors(ids, palette);
    expect(new Set(colors.values()).size).toBe(palette.length);
    const crowded = assignTaskColors([...ids, 'task-extra'], palette);
    const uses = [...crowded.values()].reduce(
      (counts, color) => counts.set(color, (counts.get(color) ?? 0) + 1),
      new Map<string, number>()
    );
    expect(Math.max(...uses.values())).toBe(2);
    expect([...crowded.values()].every((color) => palette.includes(color as never))).toBe(true);
  });
  it('depends only on the quest set, so order and repeated sessions keep colors', () => {
    const first = assignTaskColors(taskIds, palette);
    const reordered = assignTaskColors([...taskIds].reverse(), palette);
    expect([...reordered.entries()].sort()).toEqual([...first.entries()].sort());
    expect(assignTaskColors([...taskIds, taskIds[0]!], palette)).toEqual(first);
  });
  it('recolors only the picked quest, even when another quest shares its preferred slot', () => {
    const palette = MAP_OBJECTIVE_PALETTES.tol_bright;
    // Both IDs hash to slot 1 of the six-color palette, so 'd' already moved to the next slot.
    const automatic = assignTaskColors(['b', 'd'], palette);
    expect([automatic.get('b'), automatic.get('d')]).toEqual([palette[1], palette[2]]);
    const picked = assignTaskColors(['b', 'd'], palette, { b: '#123456' });
    expect([picked.get('b'), picked.get('d')]).toEqual(['#123456', palette[2]]);
  });
  it('uses a picked color and keeps every other quest color', () => {
    const automatic = assignTaskColors(taskIds, palette);
    const picked = assignTaskColors(taskIds, palette, { [taskIds[0]!]: '#123456' });
    expect(picked.get(taskIds[0]!)).toBe('#123456');
    expect(picked.get(taskIds[1]!)).toBe(automatic.get(taskIds[1]!));
    expect(picked.get(taskIds[2]!)).toBe(automatic.get(taskIds[2]!));
  });
  it('ignores inherited object keys as picks', () => {
    const colors = assignTaskColors(['constructor', 'toString'], palette, {});
    expect(palette).toContain(colors.get('constructor'));
    expect(palette).toContain(colors.get('toString'));
  });
  it('returns nothing for a map without quests', () => {
    expect(assignTaskColors([], palette).size).toBe(0);
  });
});
describe('objective color preference normalization', () => {
  it('falls back to category coloring and the Okabe-Ito palette', () => {
    expect(normalizeMapObjectiveColorMode('task')).toBe('task');
    expect(normalizeMapObjectiveColorMode('type')).toBe('type');
    expect(normalizeMapObjectiveColorMode('rainbow')).toBe(DEFAULT_MAP_OBJECTIVE_COLOR_MODE);
    expect(normalizeMapObjectiveColorMode(undefined)).toBe('category');
    expect(normalizeMapObjectivePalette('tol_muted')).toBe('tol_muted');
    expect(normalizeMapObjectivePalette('constructor')).toBe(DEFAULT_MAP_OBJECTIVE_PALETTE);
    expect(normalizeMapObjectivePalette(null)).toBe('okabe_ito');
  });
  it('keeps only quest picks with an ID and a #rrggbb color', () => {
    expect(
      normalizeMapTaskColors({
        'task-a': '#AABBCC',
        'task-b': ' #00ff00 ',
        'task-c': 'red',
        'task-d': '#fff',
        'task-e': 42,
        '': '#000000',
      })
    ).toEqual({ 'task-a': '#aabbcc', 'task-b': '#00ff00' });
    expect(normalizeMapTaskColors(['#000000'])).toEqual({});
    expect(normalizeMapTaskColors('#000000')).toEqual({});
    expect(normalizeMapTaskColors(null)).toEqual({});
  });
});
