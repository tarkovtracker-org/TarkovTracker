// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
/**
 * Regression guards for theme-critical app config that has no component-level
 * assertion surface. The checkbox indicator contrast is decided here, not in a
 * component: the light mode plate must stay pale and the tick must stay light.
 * The rendered result is measured in the app (dark tick on the light `success`
 * plate, light tick on the pale `light:bg-success-100` plate).
 */
describe('app config theme guards', () => {
  let checkboxSlots: Record<string, string>;
  beforeAll(async () => {
    vi.stubGlobal('defineAppConfig', (config: Record<string, unknown>) => config);
    const { default: appConfig } = await import('../app.config');
    checkboxSlots = (appConfig.ui as { checkbox: { slots: Record<string, string> } }).checkbox
      .slots;
  });
  it('flips the checked checkbox indicator to the pale accent tint in light mode', () => {
    // The shared `--ui-success` alias resolves to a dark plate under light mode, so without
    // this companion the light tick measures ~1.7:1 against the checked indicator.
    expect(checkboxSlots.indicator).toContain('light:bg-success-100');
  });
  it('keeps the shared inverted tick and only overrides it for light mode', () => {
    // Nuxt UI's indicator sets `text-inverted`, which resolves to the dark tick in dark mode.
    // Light mode must not force a base icon color or it would break the default theme; only
    // the light variant is needed because `--ui-text-inverted` flips to dark ink there.
    expect(checkboxSlots.icon).toBe('h-4 w-4 light:text-surface-50');
  });
});
