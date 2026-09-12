// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
/**
 * Regression guards for theme-critical app config that has no component-level
 * assertion surface. The checkbox indicator contrast is decided here, not in a
 * component: light-mode success uses a dark tick on a pale plate, while other
 * colors inherit the inverted foreground on their dark plates.
 */
describe('app config theme guards', () => {
  let checkbox: {
    slots: Record<string, string>;
    compoundVariants: { color?: string; class: Record<string, string> }[];
  };
  beforeAll(async () => {
    vi.stubGlobal('defineAppConfig', (config: Record<string, unknown>) => config);
    const { default: appConfig } = await import('@/app.config');
    checkbox = (appConfig.ui as { checkbox: typeof checkbox }).checkbox;
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });
  it('pairs the pale success indicator with a dark tick in light mode', () => {
    const successOverride = checkbox.compoundVariants.find((entry) => entry.color === 'success');
    expect(successOverride?.class.indicator).toContain('light:bg-success-100');
    expect(successOverride?.class.icon).toBe('light:text-surface-50');
  });
  it('keeps other colors on their own plates with inherited inverted ticks', () => {
    // Force explicit review when another color gains a plate or foreground override.
    expect(checkbox.compoundVariants.map((entry) => entry.color)).toEqual(['success']);
    // A global dark tick makes the info checkbox's checked state only 1.52:1 in light mode.
    expect(checkbox.slots.icon).toBe('h-4 w-4');
  });
});
