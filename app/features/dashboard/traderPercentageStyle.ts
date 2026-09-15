import type { CSSProperties } from 'vue';
/**
 * Inline progress-percentage color for the trader cards.
 *
 * The hue gradient (red -> yellow -> green) encodes task progress and is shared by
 * both themes; only the lightness is theme-dependent. Yellow hues cannot clear
 * WCAG AA on the light theme's paper surfaces at the dark-theme lightness, so light
 * mode uses the same hue/saturation at a deepened lightness that clears 4.5:1
 * against every light surface the card can composite over, measured worst-case
 * 5.06:1 on the surface-900 card (see SYSTEMS.md §16, inline-color rule).
 *
 * Locked, completed, and 0% traders carry no inline color: their class tokens
 * already carry theme-aware colors, and an inline color would override them.
 */
const HUE_RANGE_DEGREES = 120;
const LIGHTNESS_BY_MODE: Record<'dark' | 'light', number> = { dark: 55, light: 22 };
const SATURATION_PERCENT = 70;
export type TraderPercentageState = {
  isLocked: boolean;
  isComplete: boolean;
  percentage: number;
};
const showsGradient = (state: TraderPercentageState): boolean =>
  !state.isLocked && !state.isComplete && state.percentage > 0;
export const traderPercentageStyle = (
  state: TraderPercentageState,
  mode: 'dark' | 'light'
): CSSProperties =>
  showsGradient(state)
    ? {
        color: `hsl(${(state.percentage / 100) * HUE_RANGE_DEGREES}, ${SATURATION_PERCENT}%, ${
          LIGHTNESS_BY_MODE[mode]
        }%)`,
      }
    : {};
