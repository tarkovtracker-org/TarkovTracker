import { useStorage } from '@vueuse/core';
import { GAME_MODES, type GameMode } from '@/utils/constants';
export type OverlayMetric = 'items' | 'summary' | 'tasks';
export type OverlayAccent = 'custom' | 'info' | 'kappa' | 'success' | 'warning';
export type OverlayAlign =
  | 'bottom-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'center-left'
  | 'center-right'
  | 'top-center'
  | 'top-left'
  | 'top-right';
export type OverlayBackground = 'custom' | 'transparent';
export type OverlayContainer = 'canvas' | 'self-contained';
export type OverlayLayout = 'card' | 'minimal' | 'text';
export type OverlayResolution = '1080p' | '1440p' | 'custom';
export type OverlaySize = 'lg' | 'md' | 'sm';
export type OverlayFont = 'inter' | 'oswald' | 'outfit' | 'poppins' | 'rajdhani' | 'roboto-mono';
export interface StreamerToolsSettings {
  accent: OverlayAccent;
  align: OverlayAlign;
  background: OverlayBackground;
  container: OverlayContainer;
  borderColor: string;
  borderOpacity: number;
  cardColor: string;
  cardOpacity: number;
  customAccentColor: string;
  customBackgroundColor: string;
  customBackgroundOpacity: number;
  customLabel: string;
  customScalePercent: number;
  font: OverlayFont;
  intervalMs: number;
  layout: OverlayLayout;
  metric: OverlayMetric;
  mode: GameMode;
  resolution: OverlayResolution;
  showPercent: boolean;
  showRemaining: boolean;
  showTitle: boolean;
  size: OverlaySize;
  textColor: string;
  trackColor: string;
  trackOpacity: number;
}
export const STREAMER_TOOLS_SETTINGS_STORAGE_KEY = 'streamer_tools:overlay_settings:v1';
export const DEFAULT_STREAMER_TOOLS_SETTINGS: StreamerToolsSettings = {
  accent: 'kappa',
  align: 'bottom-left',
  background: 'transparent',
  container: 'canvas',
  borderColor: '#ffffff',
  borderOpacity: 12,
  cardColor: '#0f172a',
  cardOpacity: 45,
  customAccentColor: '#e61919',
  customBackgroundColor: '#0f172a',
  customBackgroundOpacity: 88,
  customLabel: '',
  customScalePercent: 100,
  font: 'rajdhani',
  intervalMs: 60000,
  layout: 'card',
  metric: 'tasks',
  mode: GAME_MODES.PVP,
  resolution: '1080p',
  showPercent: true,
  showRemaining: true,
  showTitle: true,
  size: 'md',
  textColor: '#ffffff',
  trackColor: '#94a3b8',
  trackOpacity: 20,
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const sanitizeMode = (value: unknown): GameMode => {
  if (value === GAME_MODES.PVE || value === GAME_MODES.PVP) {
    return value;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.mode;
};
const sanitizeMetric = (value: unknown): OverlayMetric => {
  if (value === 'items' || value === 'summary' || value === 'tasks') {
    return value;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.metric;
};
const sanitizeLayout = (value: unknown): OverlayLayout => {
  if (value === 'card' || value === 'minimal' || value === 'text') {
    return value;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.layout;
};
const sanitizeAccent = (value: unknown): OverlayAccent => {
  if (
    value === 'custom' ||
    value === 'info' ||
    value === 'kappa' ||
    value === 'success' ||
    value === 'warning'
  ) {
    return value;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.accent;
};
const sanitizeSize = (value: unknown): OverlaySize => {
  if (value === 'sm' || value === 'md' || value === 'lg') {
    return value;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.size;
};
const VALID_ALIGNS = new Set<OverlayAlign>([
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);
const LEGACY_ALIGN_MAP: Record<string, OverlayAlign> = {
  left: 'bottom-left',
  center: 'bottom-center',
  right: 'bottom-right',
};
const sanitizeAlign = (value: unknown): OverlayAlign => {
  if (typeof value === 'string' && VALID_ALIGNS.has(value as OverlayAlign)) {
    return value as OverlayAlign;
  }
  if (typeof value === 'string' && value in LEGACY_ALIGN_MAP) {
    return LEGACY_ALIGN_MAP[value] as OverlayAlign;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.align;
};
const sanitizeBackground = (value: unknown): OverlayBackground => {
  if (value === 'custom') {
    return value;
  }
  return 'transparent';
};
const sanitizeContainer = (value: unknown): OverlayContainer => {
  if (value === 'self-contained') {
    return value;
  }
  return 'canvas';
};
const sanitizeIntervalMs = (value: unknown): number => {
  if (value === 60000 || value === 120000 || value === 300000 || value === 600000) {
    return value;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.intervalMs;
};
const sanitizeResolution = (value: unknown): OverlayResolution => {
  if (value === '1440p' || value === 'custom') {
    return value;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.resolution;
};
const sanitizeCustomScalePercent = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_STREAMER_TOOLS_SETTINGS.customScalePercent;
  }
  return Math.min(250, Math.max(50, Math.round(numeric)));
};
export const sanitizeHexColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }
  return fallback;
};
const sanitizeCustomBackgroundColor = (value: unknown): string => {
  if (typeof value !== 'string') {
    return DEFAULT_STREAMER_TOOLS_SETTINGS.customBackgroundColor;
  }
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.customBackgroundColor;
};
const sanitizeCustomBackgroundOpacity = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_STREAMER_TOOLS_SETTINGS.customBackgroundOpacity;
  }
  return Math.min(100, Math.max(0, Math.round(numeric)));
};
const sanitizeCustomLabel = (value: unknown): string => {
  if (typeof value !== 'string') {
    return DEFAULT_STREAMER_TOOLS_SETTINGS.customLabel;
  }
  return value.slice(0, 60);
};
const VALID_FONTS = new Set<OverlayFont>([
  'inter',
  'oswald',
  'outfit',
  'poppins',
  'rajdhani',
  'roboto-mono',
]);
const sanitizeFont = (value: unknown): OverlayFont => {
  if (typeof value === 'string' && VALID_FONTS.has(value as OverlayFont)) {
    return value as OverlayFont;
  }
  return DEFAULT_STREAMER_TOOLS_SETTINGS.font;
};
const sanitizeOpacity = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(numeric)));
};
export const sanitizeStreamerToolsSettings = (value: unknown): StreamerToolsSettings => {
  if (!isObject(value)) {
    return { ...DEFAULT_STREAMER_TOOLS_SETTINGS };
  }
  return {
    accent: sanitizeAccent(value.accent),
    align: sanitizeAlign(value.align),
    background: sanitizeBackground(value.background),
    container: sanitizeContainer(value.container),
    borderColor: sanitizeHexColor(value.borderColor, DEFAULT_STREAMER_TOOLS_SETTINGS.borderColor),
    borderOpacity: sanitizeOpacity(
      value.borderOpacity,
      DEFAULT_STREAMER_TOOLS_SETTINGS.borderOpacity
    ),
    cardColor: sanitizeHexColor(value.cardColor, DEFAULT_STREAMER_TOOLS_SETTINGS.cardColor),
    cardOpacity: sanitizeOpacity(value.cardOpacity, DEFAULT_STREAMER_TOOLS_SETTINGS.cardOpacity),
    customAccentColor: sanitizeHexColor(
      value.customAccentColor,
      DEFAULT_STREAMER_TOOLS_SETTINGS.customAccentColor
    ),
    customBackgroundColor: sanitizeCustomBackgroundColor(value.customBackgroundColor),
    customBackgroundOpacity: sanitizeCustomBackgroundOpacity(value.customBackgroundOpacity),
    customLabel: sanitizeCustomLabel(value.customLabel),
    customScalePercent: sanitizeCustomScalePercent(value.customScalePercent),
    font: sanitizeFont(value.font),
    intervalMs: sanitizeIntervalMs(value.intervalMs),
    layout: sanitizeLayout(value.layout),
    metric: sanitizeMetric(value.metric),
    mode: sanitizeMode(value.mode),
    resolution: sanitizeResolution(value.resolution),
    showPercent:
      typeof value.showPercent === 'boolean'
        ? value.showPercent
        : DEFAULT_STREAMER_TOOLS_SETTINGS.showPercent,
    showRemaining:
      typeof value.showRemaining === 'boolean'
        ? value.showRemaining
        : DEFAULT_STREAMER_TOOLS_SETTINGS.showRemaining,
    showTitle:
      typeof value.showTitle === 'boolean'
        ? value.showTitle
        : DEFAULT_STREAMER_TOOLS_SETTINGS.showTitle,
    size: sanitizeSize(value.size),
    textColor: sanitizeHexColor(value.textColor, DEFAULT_STREAMER_TOOLS_SETTINGS.textColor),
    trackColor: sanitizeHexColor(value.trackColor, DEFAULT_STREAMER_TOOLS_SETTINGS.trackColor),
    trackOpacity: sanitizeOpacity(value.trackOpacity, DEFAULT_STREAMER_TOOLS_SETTINGS.trackOpacity),
  };
};
export function usePersistedStreamerToolsSettings() {
  return useStorage<StreamerToolsSettings>(
    STREAMER_TOOLS_SETTINGS_STORAGE_KEY,
    { ...DEFAULT_STREAMER_TOOLS_SETTINGS },
    undefined,
    {
      mergeDefaults: true,
      serializer: {
        read: (value) => {
          try {
            return sanitizeStreamerToolsSettings(JSON.parse(value));
          } catch {
            return { ...DEFAULT_STREAMER_TOOLS_SETTINGS };
          }
        },
        write: (value) => JSON.stringify(sanitizeStreamerToolsSettings(value)),
      },
    }
  );
}
