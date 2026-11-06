// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getStatusBadgeClass, type StatusTone } from '@/utils/statusTones';
/**
 * The light theme remaps the accent foreground range (steps 200-400) so labels
 * and links that were authored for dark surfaces stay legible on the paper
 * ladder. A family that is missing from that block keeps its dark-theme
 * foreground values and fails contrast on light surfaces, so guard the full
 * set here rather than only in the rendered audit.
 */
const cssPath = `${process.cwd()}/app/assets/css/tailwind.css`;
const tailwindCss = readFileSync(cssPath, 'utf8');
// Strip comments before slicing the light block: a remap commented out while debugging
// must not satisfy the guard, and declarations inside comments must not match either.
const withoutComments = tailwindCss.replace(/\/\*[\s\S]*?\*\//g, '');
const lightBlock = /:root\[data-theme='light'\]\s*\{([^}]+)\}/.exec(withoutComments)?.[1] ?? '';
const remap = (family: string, step: number) =>
  new RegExp(`--color-${family}-${step}:\\s*var\\(--color-${family}-(\\d+)\\)`).exec(
    lightBlock
  )?.[1];
const FOREGROUND_FAMILIES = [
  'primary',
  'accent',
  'secondary',
  'success',
  'warning',
  'error',
  'info',
  'kappa',
  'locked',
  'lightkeeper',
  'pvp',
  'pve',
] as const;
describe('light theme accent foreground remap', () => {
  it('keeps spawn counts light over fixed-dark map tiles', () => {
    // Match the comment-stripped CSS so a commented-out rule cannot satisfy the guard.
    expect(withoutComments).toMatch(
      /:root\[data-theme='light'\] \.leaflet-tooltip\.spawn-cluster-label\s*\{\s*color: var\(--color-white\) !important;/
    );
  });
  it.each(FOREGROUND_FAMILIES)('remaps 200/300/400 for %s', (family) => {
    const step200 = remap(family, 200);
    const step300 = remap(family, 300);
    const step400 = remap(family, 400);
    expect(step200, `${family}-200 must be remapped`).toBeDefined();
    expect(step300, `${family}-300 must be remapped`).toBeDefined();
    expect(step400, `${family}-400 must be remapped`).toBeDefined();
    // Each remap target must be a declared token; a remap onto an undefined step
    // (e.g. --color-primary-999) would silently resolve to nothing at runtime. The
    // targets live in the base palette, so check the whole comment-stripped sheet.
    const declared = (step: string) =>
      new RegExp(`--color-${family}-${step}:`).test(withoutComments);
    // The remap has to move toward the deep end of the ladder; a remap onto a
    // lighter step would not improve contrast on the light surfaces.
    expect(step200 && step300 && step400).toBeTruthy();
    const targets = [Number(step200), Number(step300), Number(step400)];
    expect(declared(step200!), `${family}-${step200} must be declared`).toBe(true);
    expect(declared(step300!), `${family}-${step300} must be declared`).toBe(true);
    expect(declared(step400!), `${family}-${step400} must be declared`).toBe(true);
    expect(targets[0]).toBeGreaterThanOrEqual(900);
    expect(targets[1]).toBeGreaterThanOrEqual(900);
    expect(targets[2]).toBeGreaterThanOrEqual(800);
  });
  it('keeps the accent family aligned with primary steps', () => {
    expect(remap('accent', 200)).toBe(remap('primary', 200));
    expect(remap('accent', 300)).toBe(remap('primary', 300));
    expect(remap('accent', 400)).toBe(remap('primary', 400));
  });
});
const LADDER_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const oklchBlock = /@supports \(color: oklch\(0 0 0\)\)\s*\{\s*:root\s*\{([^}]+)\}/.exec(
  withoutComments
)?.[1];
const hslToken = (name: string) => {
  const match = new RegExp(`--color-${name}:\\s*hsl\\((\\d+) (\\d+)% (\\d+)%\\)`).exec(
    withoutComments
  );
  return match ? match.slice(1, 4).map(Number) : undefined;
};
const hslToRgb = ([h, s, l]: number[]) => {
  const sat = s! / 100;
  const light = l! / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h! / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
};
const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
describe('locked status color', () => {
  it.each(LADDER_STEPS)('declares locked-%s in the hsl base and the oklch override', (step) => {
    expect(hslToken(`locked-${step}`), `hsl locked-${step}`).toBeDefined();
    expect(oklchBlock, 'oklch :root block').toBeDefined();
    expect(oklchBlock).toMatch(new RegExp(`--color-locked-${step}:\\s*oklch\\(`));
  });
  it('keeps white badge numerals at AA on the locked badge step', () => {
    // STATUS_TONE_CLASSES.locked.badge renders white numerals on bg-locked-600.
    expect(contrast(hslToRgb(hslToken('locked-600')!), [1, 1, 1])).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps selected locked tab text at AA on the light shell', () => {
    const lightShell = /--color-surface-900:\s*hsl\((\d+) (\d+)% (\d+)%\)/.exec(lightBlock);
    expect(lightShell).not.toBeNull();
    const shellRgb = hslToRgb(lightShell!.slice(1, 4).map(Number));
    expect(contrast(hslToRgb(hslToken('locked-700')!), shellRgb)).toBeGreaterThanOrEqual(4.5);
  });
});
// CSS Color 4 OKLab inverse matrices, followed by sRGB display clipping.
// https://www.w3.org/TR/css-color-4/#color-conversion-code
const oklchToLinearRgb = ([light, chroma, hue]: number[]) => {
  const a = chroma! * Math.cos((hue! * Math.PI) / 180);
  const b = chroma! * Math.sin((hue! * Math.PI) / 180);
  const l = (light! + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (light! - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (light! - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.max(0, Math.min(1, channel)));
};
const linearLuminance = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
const oklchToken = (name: string) => {
  const match = new RegExp(`--color-${name}:\\s*oklch\\(([^)]+)\\)`).exec(oklchBlock ?? '');
  expect(match, `oklch ${name}`).not.toBeNull();
  return match![1]!.split(/\s+/).map(Number);
};
const tokenLuminance = (name: string, palette: string) =>
  palette === 'oklch'
    ? linearLuminance(oklchToLinearRgb(oklchToken(name)))
    : luminance(hslToRgb(hslToken(name)!));
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const badgeToken = (tone: StatusTone, light: boolean) => {
  const classes = getStatusBadgeClass(tone, 1);
  const background = light ? /light:bg-([\w-]+)/.exec(classes)?.[1] : undefined;
  return background ?? /(?:^| )bg-([\w-]+)/.exec(classes)![1]!;
};
describe.each(['hsl', 'oklch'])('%s status palette contrast', (palette) => {
  it.each(['info', 'success', 'locked'] as const)('keeps white %s badge numerals at AA', (tone) => {
    expect(ratio(tokenLuminance(badgeToken(tone, false), palette), 1)).toBeGreaterThanOrEqual(4.5);
  });
  it('preserves the light success badge ink and fill at AA', () => {
    expect(getStatusBadgeClass('success', 1)).toContain('light:text-surface-50');
    const ink = /--color-surface-50:\s*hsl\(([^)]+)\)/
      .exec(lightBlock)![1]!
      .match(/[\d.]+/g)!
      .map(Number);
    expect(
      ratio(tokenLuminance(badgeToken('success', true), palette), luminance(hslToRgb(ink)))
    ).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps selected locked tab text at AA on the light shell', () => {
    const shell = /--color-surface-900:\s*hsl\(([^)]+)\)/
      .exec(lightBlock)![1]!
      .match(/[\d.]+/g)!
      .map(Number);
    expect(
      ratio(tokenLuminance('locked-700', palette), luminance(hslToRgb(shell)))
    ).toBeGreaterThanOrEqual(4.5);
  });
});
it('checks the OKLCH conversion against black, white and red reference colors', () => {
  expect(linearLuminance(oklchToLinearRgb([0, 0, 0]))).toBe(0);
  expect(linearLuminance(oklchToLinearRgb([1, 0, 0]))).toBeCloseTo(1, 6);
  expect(linearLuminance(oklchToLinearRgb([0.62795536, 0.25768331, 29.233885]))).toBeCloseTo(
    0.2126,
    5
  );
});
