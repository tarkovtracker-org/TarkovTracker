// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
