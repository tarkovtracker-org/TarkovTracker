// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
/**
 * Regression guards for theme-critical app config that has no component-level
 * assertion surface. The checkbox indicator contrast is decided here, not in a
 * component: the light mode plate must stay pale and the tick must stay light.
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
  it('keeps the checkbox tick light in light mode', () => {
    // Nuxt UI's base indicator foreground is `text-inverted`, which light mode maps to dark
    // ink; the explicit variant restores the light tick on the pale plate.
    expect(checkboxSlots.icon).toContain('text-surface-900');
    expect(checkboxSlots.icon).toContain('light:text-surface-50');
  });
});
