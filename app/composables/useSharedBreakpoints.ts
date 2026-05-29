import { useBreakpoints } from '@vueuse/core';
/**
 * Shared breakpoints composable to avoid per-component listeners
 *
 * Using a singleton pattern: breakpoint listeners are created once at module load,
 * and all components share the same reactive refs. This prevents N components
 * from creating N separate resize listeners.
 *
 * Breakpoints:
 * - sm: 600px (mobile/tablet boundary)
 * - md: 960px (tablet/desktop boundary)
 */
const breakpoints = useBreakpoints({
  sm: 600,
  md: 960,
  lg: 1024,
  xl: 1280,
  xxl: 1920,
});
// VueUse's smaller() and greaterOrEqual() already return ComputedRef<boolean>
// so no additional computed() wrapper is needed
const xs = breakpoints.smaller('sm'); // < 600px
const smAndUp = breakpoints.greaterOrEqual('sm'); // >= 600px
const belowMd = breakpoints.smaller('md'); // < 960px
const mdAndUp = breakpoints.greaterOrEqual('md'); // >= 960px
const belowLg = breakpoints.smaller('lg'); // < 1024px
const lgAndUp = breakpoints.greaterOrEqual('lg'); // >= 1024px
const xlAndUp = breakpoints.greaterOrEqual('xl'); // >= 1280px
const xxlAndUp = breakpoints.greaterOrEqual('xxl'); // >= 1920px
export interface SharedBreakpoints {
  /** Extra small: < 600px (mobile) */
  xs: ComputedRef<boolean>;
  /** Small and up: >= 600px */
  smAndUp: ComputedRef<boolean>;
  /** Below medium: < 960px (mobile + tablet) */
  belowMd: ComputedRef<boolean>;
  /** Medium and up: >= 960px (desktop) */
  mdAndUp: ComputedRef<boolean>;
  /** Below large: < 1024px */
  belowLg: ComputedRef<boolean>;
  /** Large and up: >= 1024px */
  lgAndUp: ComputedRef<boolean>;
  /** Extra large and up: >= 1280px */
  xlAndUp: ComputedRef<boolean>;
  /** Extra extra large and up: >= 1920px (wide desktop, full trader board) */
  xxlAndUp: ComputedRef<boolean>;
}
/**
 * Returns shared breakpoint computed refs.
 * All callers receive the same singleton ComputedRef instances from VueUse,
 * avoiding the overhead of creating new computed refs per call.
 */
export function useSharedBreakpoints(): SharedBreakpoints {
  return {
    xs,
    smAndUp,
    belowMd,
    mdAndUp,
    belowLg,
    lgAndUp,
    xlAndUp,
    xxlAndUp,
  };
}
