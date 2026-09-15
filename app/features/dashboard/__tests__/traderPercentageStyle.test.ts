import { describe, expect, it } from 'vitest';
import {
  traderPercentageStyle,
  type TraderPercentageState,
} from '@/features/dashboard/traderPercentageStyle';
const inProgress: TraderPercentageState = {
  isLocked: false,
  isComplete: false,
  percentage: 50,
};
describe('traderPercentageStyle', () => {
  it('keeps the authored dark-theme lightness', () => {
    expect(traderPercentageStyle(inProgress, 'dark')).toEqual({
      color: 'hsl(60, 70%, 55%)',
    });
  });
  it('deepens the same hue gradient for the light theme', () => {
    // 22% lightness clears WCAG AA across the whole 0-120 degree hue range,
    // including the yellow mid-range that cannot pass on paper surfaces at 55%.
    expect(traderPercentageStyle(inProgress, 'light')).toEqual({
      color: 'hsl(60, 70%, 22%)',
    });
  });
  it('maps progress linearly onto the hue range', () => {
    expect(traderPercentageStyle({ ...inProgress, percentage: 25 }, 'dark')).toEqual({
      color: 'hsl(30, 70%, 55%)',
    });
    expect(traderPercentageStyle({ ...inProgress, percentage: 75 }, 'light')).toEqual({
      color: 'hsl(90, 70%, 22%)',
    });
  });
  it('carries no inline color for locked, completed, or zero-progress traders', () => {
    // Those states rely on their theme-aware class tokens; an inline color would win
    // over the utility classes and break them.
    expect(traderPercentageStyle({ ...inProgress, isLocked: true }, 'light')).toEqual({});
    expect(traderPercentageStyle({ ...inProgress, isComplete: true }, 'light')).toEqual({});
    expect(traderPercentageStyle({ ...inProgress, percentage: 0 }, 'light')).toEqual({});
  });
});
