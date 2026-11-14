/** Hex color parsing and WCAG contrast helpers for map marker fills and their glyphs. */
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;
/** Lowercase `#rrggbb`, the only form a color input returns, or null. */
export const normalizeHexColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const color = value.trim().toLowerCase();
  return HEX_COLOR_PATTERN.test(color) ? color : null;
};
const channelLuminance = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
/** WCAG relative luminance of `#rrggbb`, or null for any other color string. */
export const relativeLuminance = (color: string): number | null => {
  const hex = normalizeHexColor(color);
  if (!hex) return null;
  const [r, g, b] = [1, 3, 5].map((start) =>
    channelLuminance(parseInt(hex.slice(start, start + 2), 16))
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
export const LIGHT_GLYPH_INK = '#ffffff';
export const DARK_GLYPH_INK = '#0a0a0b';
/**
 * The glyph color with the higher WCAG contrast against a chip fill, so a light quest color (or a
 * user's pick) never hides the action glyph. Unparseable colors keep the white glyph.
 */
export function getGlyphInk(fill: string): string {
  const luminance = relativeLuminance(fill);
  if (luminance === null) return LIGHT_GLYPH_INK;
  const dark = relativeLuminance(DARK_GLYPH_INK)!;
  return contrastRatio(luminance, 1) >= contrastRatio(luminance, dark)
    ? LIGHT_GLYPH_INK
    : DARK_GLYPH_INK;
}
