// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
/**
 * Regression guards for theme-critical app config that has no component-level
 * assertion surface. The checkbox indicator contrast is decided here, not in a
 * component: the light mode success plate must stay pale and the tick must stay
 * light. The rendered result is measured in the app (dark tick on the light
 * `success` plate, light tick on the pale `light:bg-success-100` plate).
 */
describe('app config theme guards', () => {
  let checkbox: {
    slots: Record<string, string>;
    compoundVariants: { color?: string; class: Record<string, string> }[];
  };
  beforeAll(async () => {
    vi.stubGlobal('defineAppConfig', (config: Record<string, unknown>) => config);
    const { default: appConfig } = await import('../app.config');
    checkbox = (appConfig.ui as { checkbox: typeof checkbox }).checkbox;
  });
  it('flips the checked success indicator to the pale accent tint in light mode', () => {
    // The success variant's `bg-success` resolves to a dark plate under light mode, so without
    // this companion the light tick measures ~1.7:1 against the checked indicator.
    const successOverride = checkbox.compoundVariants.find((entry) => entry.color === 'success');
    expect(successOverride?.class.indicator).toContain('light:bg-success-100');
  });
  it('scopes the pale plate to the success color so other checkbox colors keep their own', () => {
    for (const entry of checkbox.compoundVariants) {
      if (entry.color !== 'success') {
        expect(entry.class.indicator ?? '').not.toContain('bg-success-100');
      }
    }
    // The base icon keeps the shared `text-inverted` tick in dark mode; only the light theme
    // needs the explicit light tick because `--ui-text-inverted` resolves to dark ink there.
    expect(checkbox.slots.icon).toBe('h-4 w-4 light:text-surface-50');
  });
});
