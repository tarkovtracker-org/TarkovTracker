/**
 * Centralized theme color constants for use in JavaScript/TypeScript contexts.
 *
 * These values mirror the CSS custom properties defined in:
 *   app/assets/css/tailwind.css (@theme block)
 *
 * Use these constants when:
 * - Creating DOM elements outside Vue/Tailwind context (e.g., Leaflet markers)
 * - Writing CSS-in-JS where CSS variables may not be accessible
 * - Inline styles that require raw color values
 *
 * IMPORTANT: When updating colors, update BOTH this file AND tailwind.css
 * to keep them in sync. The CSS variables are the source of truth.
 *
 * Note: Prefer Tailwind classes or CSS variables when possible.
 * Only use these constants when the above scenarios apply.
 */
/**
 * Core theme colors matching Tailwind v4 tokens.
 * HSL format for consistency with CSS custom properties.
 *
 * Source of truth: app/assets/css/tailwind.css @theme
 */
export const THEME_COLORS = {
  // Selection palette (violet) - for highlights, pinned states, focus rings
  // CSS var: --color-selection-*
  selection: {
    500: 'hsl(262 83% 58%)',
  },
  // Status colors
  // CSS var: --color-error-*
  error: {
    500: 'hsl(0 84.2% 60.2%)',
  },
  // CSS var: --color-warning-*
  warning: {
    500: 'hsl(38 92.1% 50.2%)',
  },
  // CSS var: --color-success-*
  success: {
    500: 'hsl(150 59.2% 41.4%)',
  },
  // Accent colors (not in theme, but used for map markers)
  sky: {
    400: 'hsl(198 93.2% 59.6%)',
    600: 'hsl(200 98% 39.4%)',
  },
  // Surface colors
  // CSS var: --color-surface-*
  surface: {
    900: 'hsl(0 0% 7.1%)',
    800: 'hsl(240 5.1% 11.6%)',
    700: 'hsl(240 5.1% 19.4%)',
  },
  // Neutral colors
  neutral: {
    white: 'hsl(0 0% 100%)',
    black: 'hsl(240 5.1% 4%)',
    gray200: 'hsl(0 0% 90%)',
  },
  // Secondary
  // CSS var: --color-secondary-*
  secondary: {
    500: 'hsl(215 50% 22.7%)',
  },
} as const;
/**
 * Map-specific color constants for Leaflet markers and overlays.
 * These are derived from THEME_COLORS for semantic naming in map context.
 *
 * Note: Leaflet's JS API requires raw color strings for options like `color`
 * and `fillColor`, not CSS variable references. These constants provide
 * theme-aligned values for use when constructing markers programmatically.
 */
export const MAP_MARKER_COLORS = {
  /** Self objectives - matches --color-error-500 */
  SELF_OBJECTIVE: THEME_COLORS.error[500],
  /** Team objectives - matches --color-warning-500 */
  TEAM_OBJECTIVE: THEME_COLORS.warning[500],
  /** Selected/pinned marker - matches --color-selection-500 */
  SELECTED: THEME_COLORS.selection[500],
  /** PMC extracts - matches --color-success-500 */
  PMC_EXTRACT: THEME_COLORS.success[500],
  /** Scav extracts - amber (--color-warning-500) */
  SCAV_EXTRACT: THEME_COLORS.warning[500],
  /** Shared extracts - sky-400 */
  SHARED_EXTRACT: THEME_COLORS.sky[400],
  /** Co-op extracts - sky-600 */
  COOP_EXTRACT: THEME_COLORS.sky[600],
  /** Default extract - --color-secondary-500 */
  DEFAULT_EXTRACT: THEME_COLORS.secondary[500],
  /** Marker border - white */
  MARKER_BORDER: THEME_COLORS.neutral.white,
  /** Extract dot border - near black */
  EXTRACT_DOT_BORDER: THEME_COLORS.neutral.black,
} as const;
