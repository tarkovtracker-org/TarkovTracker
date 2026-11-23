import { describe, expect, it } from 'vitest';
import { progressBarFillStyle } from '@/features/dashboard/traderPercentageStyle';
describe('trader task progress fill', () => {
  it('preserves the progress hue with theme-appropriate contrast', () => {
    expect(progressBarFillStyle(50, 'dark').backgroundColor).toBe('hsl(60, 70%, 45%)');
    expect(progressBarFillStyle(50, 'light').backgroundColor).toBe('hsl(60, 70%, 26%)');
    expect(progressBarFillStyle(25, 'light').backgroundColor).toBe('hsl(30, 70%, 26%)');
    expect(progressBarFillStyle(75, 'light').backgroundColor).toBe('hsl(90, 70%, 26%)');
  });
});
