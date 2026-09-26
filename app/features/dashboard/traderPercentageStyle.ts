import type { CSSProperties } from 'vue';
/**
 * Inline progress hue-gradient colors (red -> yellow -> green by percentage).
 *
 * The gradient encodes task progress and is shared by both themes; only the
 * lightness is theme-dependent. Yellow hues cannot clear WCAG AA on the light
 * theme's paper surfaces at the dark-theme lightness, so light mode uses the same
 * hue/saturation at a deepened lightness (see SYSTEMS.md §17, inline-color rule).
 *
 * Two consumers with different requirements:
 * - Trader card percentage text: body text needs 4.5:1, so light uses 22%
 *   (worst case 5.06:1 on the surface-900 card).
 * - Progress-bar fill: a non-text indicator (WCAG 1.4.11, 3:1 against the adjacent
 *   track), so light uses 26% (worst case 3.60:1 against the composited track)
 *   to stay a step lighter than the text ink.
 */
const HUE_RANGE_DEGREES = 120;
const SATURATION_PERCENT = 70;
const LIGHTNESS_BY_MODE = {
  dark: { text: 55, fill: 45 },
  light: { text: 22, fill: 26 },
} as const;
export type GradientMode = 'dark' | 'light';
export const progressGradientColor = (
  percentage: number,
  mode: GradientMode,
  variant: 'text' | 'fill' = 'text'
): string =>
  `hsl(${(percentage / 100) * HUE_RANGE_DEGREES}, ${SATURATION_PERCENT}%, ${
    LIGHTNESS_BY_MODE[mode][variant]
  }%)`;
export type TraderPercentageState = {
  isLocked: boolean;
  isComplete: boolean;
  percentage: number;
};
const showsGradient = (state: TraderPercentageState): boolean =>
  !state.isLocked && !state.isComplete && state.percentage > 0;
export const traderPercentageStyle = (
  state: TraderPercentageState,
  mode: GradientMode
): CSSProperties =>
  showsGradient(state) ? { color: progressGradientColor(state.percentage, mode, 'text') } : {};
export const progressBarFillStyle = (percentage: number, mode: GradientMode): CSSProperties => ({
  backgroundColor: progressGradientColor(percentage, mode, 'fill'),
});
