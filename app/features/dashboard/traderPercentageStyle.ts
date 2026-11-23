import type { CSSProperties } from 'vue';
export const progressBarFillStyle = (
  percentage: number,
  mode: 'dark' | 'light'
): CSSProperties => ({
  // The darker light-theme fill maintains WCAG non-text contrast against the track.
  backgroundColor: `hsl(${(percentage / 100) * 120}, 70%, ${mode === 'light' ? 26 : 45}%)`,
});
