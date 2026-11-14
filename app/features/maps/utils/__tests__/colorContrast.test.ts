import { describe, expect, it } from 'vitest';
import {
  DARK_GLYPH_INK,
  getGlyphInk,
  LIGHT_GLYPH_INK,
  normalizeHexColor,
  relativeLuminance,
} from '@/features/maps/utils/colorContrast';
import { MAP_OBJECTIVE_PALETTES } from '@/features/maps/utils/objectiveColors';
import { MAP_MARKER_COLORS } from '@/utils/theme-colors';
const contrast = (a: string, b: string) => {
  const [high, low] = [relativeLuminance(a)!, relativeLuminance(b)!].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
};
describe('color contrast helpers', () => {
  it('accepts only #rrggbb colors', () => {
    expect(normalizeHexColor(' #A1B2C3 ')).toBe('#a1b2c3');
    expect(normalizeHexColor('#abc')).toBeNull();
    expect(normalizeHexColor('rgb(0, 0, 0)')).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
  });
  it('measures WCAG relative luminance', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
    expect(relativeLuminance('tomato')).toBeNull();
  });
  it('inks light fills dark and dark fills white', () => {
    expect(getGlyphInk('#f0e442')).toBe(DARK_GLYPH_INK);
    expect(getGlyphInk('#dddddd')).toBe(DARK_GLYPH_INK);
    expect(getGlyphInk('#332288')).toBe(LIGHT_GLYPH_INK);
    expect(getGlyphInk('#0072b2')).toBe(LIGHT_GLYPH_INK);
    expect(getGlyphInk('not-a-color')).toBe(LIGHT_GLYPH_INK);
  });
  it('keeps every palette and default category glyph at 3:1 contrast or better', () => {
    const fills = [
      ...Object.values(MAP_OBJECTIVE_PALETTES).flat(),
      MAP_MARKER_COLORS.SELF_OBJECTIVE,
      MAP_MARKER_COLORS.PINNED_OBJECTIVE,
      MAP_MARKER_COLORS.TEAM_OBJECTIVE,
      MAP_MARKER_COLORS.SELECTED,
    ];
    for (const fill of fills) expect(contrast(fill, getGlyphInk(fill))).toBeGreaterThanOrEqual(3);
  });
});
