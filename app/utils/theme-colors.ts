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
 * Map-specific color constants for Leaflet markers and overlays.
 * These mirror the Tailwind theme tokens with semantic naming for map context.
 *
 * Note: Leaflet's JS API requires raw color strings for options like `color`
 * and `fillColor`, not CSS variable references. These constants provide
 * theme-aligned values for use when constructing markers programmatically.
 */
export const MAP_MARKER_COLORS = {
  /** Self objectives - matches --color-warning-500 */
  SELF_OBJECTIVE: '#f59e0b',
  /** Pinned task objectives - matches --color-selection-500 */
  PINNED_OBJECTIVE: '#7c3bed',
  /** Team objectives - matches --color-info-400 */
  TEAM_OBJECTIVE: '#3c9add',
  /** Selected/pinned marker - matches --color-selection-500 */
  SELECTED: '#7c3bed',
  /** PMC extracts - matches --color-success-500 */
  PMC_EXTRACT: '#2ba86a',
  /** Scav extracts - matches --color-info-400 */
  SCAV_EXTRACT: '#3c9add',
  /** Shared extracts - matches --color-secondary-400 */
  SHARED_EXTRACT: '#40b5bf',
  /** Co-op extracts - matches --color-secondary-600 */
  COOP_EXTRACT: '#2b7b82',
  /** PMC spawns - --color-info-500 */
  PMC_SPAWN: '#2280c3',
  /** Default extract - --color-secondary-500 */
  DEFAULT_EXTRACT: '#339199',
  /** Marker border - white */
  MARKER_BORDER: '#ffffff',
  /** Extract dot border - near black */
  EXTRACT_DOT_BORDER: '#0a0a0b',
} as const;
export const LEGACY_MAP_MARKER_COLORS = {
  ...MAP_MARKER_COLORS,
  SELF_OBJECTIVE: '#ef4444',
} as const;
export type MapMarkerColorKey = keyof typeof MAP_MARKER_COLORS;
export type MapMarkerColors = Record<MapMarkerColorKey, string>;
export type MapColorOption = { key: MapMarkerColorKey; label: string };
type MapColorOptionTranslator = (key: string) => string;
const MAP_MARKER_COLOR_KEYS = Object.keys(MAP_MARKER_COLORS) as MapMarkerColorKey[];
// Frozen pre-PINNED_OBJECTIVE snapshot used by hasExactLegacyDefaults; persisted
// legacy palettes lack newer keys, so never add new marker colors to this list.
const LEGACY_MAP_MARKER_COLOR_KEYS: MapMarkerColorKey[] = [
  'SELF_OBJECTIVE',
  'TEAM_OBJECTIVE',
  'SELECTED',
  'PMC_EXTRACT',
  'SCAV_EXTRACT',
  'SHARED_EXTRACT',
  'COOP_EXTRACT',
  'PMC_SPAWN',
  'DEFAULT_EXTRACT',
  'MARKER_BORDER',
  'EXTRACT_DOT_BORDER',
];
export const getMapColorOptions = (t: MapColorOptionTranslator): MapColorOption[] => {
  return [
    { key: 'SELF_OBJECTIVE', label: t('settings.interface.maps.colors.self_objective') },
    { key: 'PINNED_OBJECTIVE', label: t('settings.interface.maps.colors.pinned_objective') },
    { key: 'TEAM_OBJECTIVE', label: t('settings.interface.maps.colors.team_objective') },
    { key: 'SELECTED', label: t('settings.interface.maps.colors.selected') },
    { key: 'PMC_EXTRACT', label: t('common.pmc_extract') },
    { key: 'SCAV_EXTRACT', label: t('common.scav_extract') },
    { key: 'SHARED_EXTRACT', label: t('settings.interface.maps.colors.shared_extract') },
    { key: 'COOP_EXTRACT', label: t('settings.interface.maps.colors.coop_extract') },
    { key: 'PMC_SPAWN', label: t('common.pmc_spawn') },
  ];
};
export const normalizeMapMarkerColors = (value: unknown): MapMarkerColors => {
  const defaults: MapMarkerColors = { ...MAP_MARKER_COLORS };
  if (!value || typeof value !== 'object') return defaults;
  const candidateColors = value as Record<string, unknown>;
  for (const key of MAP_MARKER_COLOR_KEYS) {
    const candidate = candidateColors[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      defaults[key] = candidate.trim();
    }
  }
  return defaults;
};
const normalizeHex = (value: string): string => value.trim().toLowerCase();
const hasExactLegacyDefaults = (value: unknown): value is MapMarkerColors => {
  if (!value || typeof value !== 'object') return false;
  const candidateColors = value as Record<string, unknown>;
  if ('PINNED_OBJECTIVE' in candidateColors) return false;
  for (const key of LEGACY_MAP_MARKER_COLOR_KEYS) {
    const rawCandidate = candidateColors[key];
    if (typeof rawCandidate !== 'string') return false;
    if (normalizeHex(rawCandidate) !== normalizeHex(LEGACY_MAP_MARKER_COLORS[key])) {
      return false;
    }
  }
  return true;
};
export const migrateLegacyMapMarkerColors = (value: unknown): MapMarkerColors | null => {
  if (!hasExactLegacyDefaults(value)) return null;
  return { ...MAP_MARKER_COLORS };
};
