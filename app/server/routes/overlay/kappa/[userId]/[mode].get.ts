import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParam,
  setHeader,
  setResponseHeader,
} from 'h3';
import { GAME_MODES, type GameMode } from '@/utils/constants';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type OverlayMetric = 'items' | 'summary' | 'tasks';
type OverlayAccent = 'custom' | 'info' | 'kappa' | 'success' | 'warning';
type OverlayAlign =
  | 'bottom-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'center-left'
  | 'center-right'
  | 'top-center'
  | 'top-left'
  | 'top-right';
type OverlayBackground = 'custom' | 'transparent';
type OverlayContainer = 'canvas' | 'self-contained';
type OverlayLayout = 'card' | 'minimal' | 'text';
type OverlayResolution = '1080p' | '1440p' | 'custom';
type OverlaySize = 'lg' | 'md' | 'sm';
type OverlayFont = 'inter' | 'oswald' | 'outfit' | 'poppins' | 'rajdhani' | 'roboto-mono';
const normalizeMode = (value: string | undefined): GameMode | null => {
  if (value === GAME_MODES.PVE) {
    return GAME_MODES.PVE;
  }
  if (value === GAME_MODES.PVP) {
    return GAME_MODES.PVP;
  }
  return null;
};
const readScalarQueryValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return String(value[0] ?? '').trim();
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
};
const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (['1', 'on', 'true', 'yes'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
};
const normalizeMetric = (value: unknown): OverlayMetric => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (normalized === 'items' || normalized === 'summary' || normalized === 'tasks') {
    return normalized;
  }
  return 'tasks';
};
const normalizeAccent = (value: unknown): OverlayAccent => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (
    normalized === 'custom' ||
    normalized === 'info' ||
    normalized === 'kappa' ||
    normalized === 'success' ||
    normalized === 'warning'
  ) {
    return normalized;
  }
  return 'kappa';
};
const normalizeLayout = (value: unknown): OverlayLayout => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (normalized === 'card' || normalized === 'minimal' || normalized === 'text') {
    return normalized;
  }
  return 'card';
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
const normalizeAlign = (value: unknown): OverlayAlign => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (VALID_ALIGNS.has(normalized as OverlayAlign)) {
    return normalized as OverlayAlign;
  }
  if (normalized in LEGACY_ALIGN_MAP) {
    return LEGACY_ALIGN_MAP[normalized] as OverlayAlign;
  }
  return 'bottom-left';
};
const normalizeSize = (value: unknown): OverlaySize => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (normalized === 'sm' || normalized === 'md' || normalized === 'lg') {
    return normalized;
  }
  return 'md';
};
const normalizeBackground = (value: unknown): OverlayBackground => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (normalized === 'custom') {
    return normalized;
  }
  return 'transparent';
};
const normalizeResolution = (value: unknown): OverlayResolution => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (normalized === '1440p' || normalized === 'custom') {
    return normalized;
  }
  return '1080p';
};
const normalizeContainer = (value: unknown, isSelfContainedFallback: boolean): OverlayContainer => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (normalized === 'self' || normalized === 'self-contained' || normalized === 'selfcontained') {
    return 'self-contained';
  }
  if (normalized === 'canvas') {
    return normalized;
  }
  return isSelfContainedFallback ? 'self-contained' : 'canvas';
};
const MIN_INTERVAL_MS = 60000;
const MAX_INTERVAL_MS = 600000;
const DEFAULT_INTERVAL_MS = MIN_INTERVAL_MS;
const MIN_SCALE_PERCENT = 50;
const MAX_SCALE_PERCENT = 250;
const MIN_OPACITY_PERCENT = 0;
const MAX_OPACITY_PERCENT = 100;
const normalizeIntervalMs = (value: unknown): number => {
  const raw = Number(readScalarQueryValue(value));
  if (!Number.isFinite(raw)) {
    return DEFAULT_INTERVAL_MS;
  }
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(raw)));
};
const normalizeScalePercent = (value: unknown, fallback: number): number => {
  const rawValue = readScalarQueryValue(value);
  if (!rawValue) {
    return fallback;
  }
  const raw = Number(rawValue);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(MAX_SCALE_PERCENT, Math.max(MIN_SCALE_PERCENT, Math.round(raw)));
};
const normalizeHexColor = (value: unknown): string | null => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  const candidate = normalized.startsWith('#') ? normalized : `#${normalized}`;
  if (/^#[0-9a-f]{6}$/.test(candidate)) {
    return candidate;
  }
  return null;
};
const normalizeOpacityPercent = (value: unknown, fallback: number): number => {
  const rawValue = readScalarQueryValue(value);
  if (!rawValue) {
    return fallback;
  }
  const raw = Number(rawValue);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(MAX_OPACITY_PERCENT, Math.max(MIN_OPACITY_PERCENT, Math.round(raw)));
};
const normalizeLabel = (value: unknown): string | null => {
  const normalized = readScalarQueryValue(value);
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 60).replace(/[<>`]/g, '');
};
const VALID_FONTS = new Set<OverlayFont>([
  'inter',
  'oswald',
  'outfit',
  'poppins',
  'rajdhani',
  'roboto-mono',
]);
const normalizeFont = (value: unknown): OverlayFont => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (VALID_FONTS.has(normalized as OverlayFont)) {
    return normalized as OverlayFont;
  }
  return 'rajdhani';
};
const ACCENT_TOKENS: Record<
  Exclude<OverlayAccent, 'custom'>,
  { bar: string; glow: string; text: string }
> = {
  info: {
    bar: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.35)',
    text: '#d0f2ff',
  },
  kappa: {
    bar: '#e61919',
    glow: 'rgba(230, 25, 25, 0.35)',
    text: '#ffc5c5',
  },
  success: {
    bar: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.35)',
    text: '#d0ffe2',
  },
  warning: {
    bar: '#fb923c',
    glow: 'rgba(251, 146, 60, 0.35)',
    text: '#ffdfc5',
  },
};
const hexToRgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];
const buildCustomTokens = (hex: string): { bar: string; glow: string; text: string } => {
  const [r, g, b] = hexToRgb(hex);
  const lightR = Math.min(255, Math.round(r + (255 - r) * 0.7));
  const lightG = Math.min(255, Math.round(g + (255 - g) * 0.7));
  const lightB = Math.min(255, Math.round(b + (255 - b) * 0.7));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return {
    bar: hex,
    glow: `rgba(${r}, ${g}, ${b}, 0.35)`,
    text: `#${toHex(lightR)}${toHex(lightG)}${toHex(lightB)}`,
  };
};
const FONT_CONFIG: Record<OverlayFont, { family: string; href: string }> = {
  inter: {
    family: "'Inter', 'Segoe UI', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  },
  oswald: {
    family: "'Oswald', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap',
  },
  outfit: {
    family: "'Outfit', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap',
  },
  poppins: {
    family: "'Poppins', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  },
  rajdhani: {
    family: "'Rajdhani', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap',
  },
  'roboto-mono': {
    family: "'Roboto Mono', monospace",
    href: 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap',
  },
};
export default defineEventHandler((event) => {
  const userId = (getRouterParam(event, 'userId') || '').trim();
  const mode = normalizeMode(getRouterParam(event, 'mode'));
  if (!mode) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile mode' });
  }
  if (!UUID_REGEX.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile id' });
  }
  const query = getQuery(event);
  const metric = normalizeMetric(query.metric);
  const accent = normalizeAccent(query.accent);
  const align = normalizeAlign(query.align);
  const background = normalizeBackground(query.bg);
  const layout = normalizeLayout(query.layout);
  const resolution = normalizeResolution(query.resolution);
  const container = normalizeContainer(query.container, parseBoolean(query.selfContained, false));
  const size = normalizeSize(query.size);
  const intervalMs = normalizeIntervalMs(query.interval);
  const customScalePercent = normalizeScalePercent(query.scale, 100);
  const overlayScale =
    resolution === '1440p' ? 4 / 3 : resolution === 'custom' ? customScalePercent / 100 : 1;
  const transparentBackground =
    background === 'transparent' || parseBoolean(query.transparent, false);
  const customBackgroundColor = normalizeHexColor(query.bgColor);
  const customBackgroundOpacity = normalizeOpacityPercent(query.bgOpacity, 88);
  const useCustomBackground =
    !transparentBackground && background === 'custom' && customBackgroundColor !== null;
  const showPercent = parseBoolean(query.showPercent, true);
  const showRemaining = parseBoolean(query.showRemaining, true);
  const customLabel = normalizeLabel(query.label);
  const customAccentColor = normalizeHexColor(query.accentColor);
  const font = normalizeFont(query.font);
  const showTitle = parseBoolean(query.showTitle, true);
  const textColor = normalizeHexColor(query.textColor);
  const cardColor = normalizeHexColor(query.cardColor);
  const cardOpacity = normalizeOpacityPercent(query.cardOpacity, 45);
  const borderColor = normalizeHexColor(query.borderColor);
  const borderOpacity = normalizeOpacityPercent(query.borderOpacity, 12);
  const trackColor = normalizeHexColor(query.trackColor);
  const trackOpacity = normalizeOpacityPercent(query.trackOpacity, 20);
  const resolvedFont = FONT_CONFIG[font];
  const resolvedTokens: { bar: string; glow: string; text: string } =
    accent === 'custom' && customAccentColor
      ? buildCustomTokens(customAccentColor)
      : ACCENT_TOKENS[accent === 'custom' ? 'kappa' : accent];
  const overlayConfig = {
    accent,
    align,
    apiPath: `/api/streamer/${userId}/${mode}/kappa`,
    userId,
    container,
    customLabel,
    intervalMs,
    layout,
    metric,
    modeLabel: mode.toUpperCase(),
    overlayScale,
    background: useCustomBackground ? 'custom' : 'transparent',
    backgroundColor: useCustomBackground ? customBackgroundColor : null,
    backgroundOpacity: useCustomBackground ? customBackgroundOpacity : 88,
    showPercent,
    showRemaining,
    size,
    tokens: resolvedTokens,
    font,
    fontFamily: resolvedFont.family,
    showTitle,
    textColor,
    cardColor,
    cardOpacity,
    borderColor,
    borderOpacity,
    trackColor,
    trackOpacity,
  };
  const fontHref = resolvedFont.href;
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8');
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TarkovTracker Stream Overlay</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${fontHref}" rel="stylesheet" />
    <style>
      :root {
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: transparent;
        overflow: hidden;
        font-family: var(--font-family, 'Rajdhani', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
      }

      html.self-contained,
      body.self-contained {
        width: max-content;
        width: fit-content;
        height: max-content;
        height: fit-content;
      }

      body.self-contained {
        display: inline-block;
      }

      .overlay {
        width: 100%;
        height: 100%;
        display: flex;
        padding: 12px;
      }

      .overlay.self-contained {
        width: max-content;
        width: fit-content;
        height: max-content;
        height: fit-content;
      }

      .overlay.self-contained .widget {
        width: fit-content;
      }

      .overlay.background-transparent {
        padding: 0;
      }

      .overlay.valign-top {
        align-items: flex-start;
      }

      .overlay.valign-center {
        align-items: center;
      }

      .overlay.valign-bottom {
        align-items: flex-end;
      }

      .overlay.halign-left {
        justify-content: flex-start;
      }

      .overlay.halign-center {
        justify-content: center;
      }

      .overlay.halign-right {
        justify-content: flex-end;
      }

      .widget {
        --overlay-scale: 1;
        --title-size: calc(24px * var(--overlay-scale));
        --value-size: calc(52px * var(--overlay-scale));
        --percent-size: calc(30px * var(--overlay-scale));
        --meta-size: calc(14px * var(--overlay-scale));
        --progress-max-width: 100%;
        --text-size: calc(36px * var(--overlay-scale));
        width: 100%;
        max-width: calc(640px * var(--overlay-scale));
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
        background: linear-gradient(150deg, rgba(8, 12, 16, 0.92), rgba(17, 24, 39, 0.88));
        box-shadow: 0 14px 42px rgba(0, 0, 0, 0.5);
        border-radius: 14px;
        backdrop-filter: blur(4px);
        animation: fadeIn 400ms ease-out both;
      }

      .widget.card {
        width: fit-content;
        max-width: calc(560px * var(--overlay-scale));
        --progress-max-width: calc(360px * var(--overlay-scale));
      }

      .widget.card.size-sm {
        max-width: calc(500px * var(--overlay-scale));
        --progress-max-width: calc(330px * var(--overlay-scale));
      }

      .widget.card.size-lg {
        max-width: calc(620px * var(--overlay-scale));
        --progress-max-width: calc(400px * var(--overlay-scale));
      }

      .widget.size-sm {
        --title-size: calc(19px * var(--overlay-scale));
        --value-size: calc(38px * var(--overlay-scale));
        --percent-size: calc(21px * var(--overlay-scale));
        --meta-size: calc(12px * var(--overlay-scale));
        --text-size: calc(24px * var(--overlay-scale));
      }

      .widget.size-lg {
        --title-size: calc(29px * var(--overlay-scale));
        --value-size: calc(64px * var(--overlay-scale));
        --percent-size: calc(38px * var(--overlay-scale));
        --meta-size: calc(16px * var(--overlay-scale));
        --text-size: calc(42px * var(--overlay-scale));
      }

      .widget.transparent {
        background: transparent;
        border-color: transparent;
        box-shadow: none;
        backdrop-filter: none;
      }

      .widget.transparent .inner {
        padding-bottom: 0;
      }

      .widget.custom-background {
        background: var(--widget-custom-bg);
      }

      .widget.minimal {
        max-width: 560px;
        border-radius: 999px;
        border-left: 3px solid var(--accent-bar, #f59e0b);
      }

      .widget.text {
        width: auto;
        max-width: none;
        border: none;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        backdrop-filter: none;
      }

      .inner {
        padding: 20px 22px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .widget.minimal .inner {
        padding: 12px 18px;
        gap: 8px;
      }

      .widget.text .inner {
        padding: 0;
        gap: 6px;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .widget.card .header {
        width: min(100%, var(--progress-max-width));
      }

      .widget.text .header {
        display: none;
      }

      .title-group {
        min-width: 0;
      }

      .title {
        margin: 0;
        font-size: var(--title-size);
        line-height: 1;
        letter-spacing: 0.04em;
        color: var(--text-color, white);
        text-transform: uppercase;
        white-space: nowrap;
      }

      .mode-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.1);
        color: rgba(226, 232, 240, 0.9);
        vertical-align: middle;
        margin-left: 8px;
      }

      .header.header-hidden {
        display: none;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 8px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.68);
        color: var(--text-color, rgba(248, 250, 252, 0.98));
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        line-height: 1;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.72);
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #64748b;
        box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.22);
      }

      .dot.live {
        background: #22c55e;
        box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3), 0 0 8px rgba(34, 197, 94, 0.35);
      }

      .value-line {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
      }

      .card-metric-cluster {
        width: min(100%, var(--progress-max-width));
        display: grid;
        gap: 8px;
      }

      .value {
        margin: 0;
        color: var(--text-color, white);
        font-size: var(--value-size);
        font-weight: 700;
        line-height: 0.9;
      }

      .percent {
        margin: 0;
        color: var(--accent-text, #ffe7b8);
        font-size: var(--percent-size);
        font-weight: 700;
        line-height: 1;
      }

      .progress {
        width: 100%;
        height: 14px;
        border-radius: 999px;
        background: var(--progress-track, rgba(148, 163, 184, 0.2));
        overflow: hidden;
      }

      .fill {
        height: 100%;
        width: 0%;
        border-radius: 999px;
        background: var(--accent-bar, #f59e0b);
        box-shadow: 0 0 20px var(--accent-glow, rgba(245, 158, 11, 0.35));
        transition: width 500ms ease-out;
      }

      .meta {
        margin: 0;
        color: var(--text-muted, rgba(241, 245, 249, 0.96));
        font-size: var(--meta-size);
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .meta-left,
      .meta-right {
        min-width: 0;
      }

      .meta-right {
        color: var(--text-color, rgba(248, 250, 252, 0.99));
        font-weight: 700;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
      }

      .card-meta {
        font-size: calc(var(--meta-size) + 3px);
        font-weight: 700;
        letter-spacing: 0.01em;
        text-transform: none;
      }

      .card-meta .meta-left {
        color: var(--text-muted, rgba(241, 245, 249, 0.96));
        font-weight: 700;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.72);
      }

      .card-meta .meta-right {
        color: var(--text-color, rgba(255, 255, 255, 1));
        font-size: calc(var(--meta-size) + 3px);
        font-weight: 800;
        white-space: nowrap;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.76);
      }

      .summary-grid {
        display: grid;
        gap: 8px;
      }

      .summary-row {
        border: 1px solid var(--card-border, rgba(255, 255, 255, 0.08));
        border-radius: 10px;
        padding: 8px 10px;
        background: var(--card-bg, rgba(15, 23, 42, 0.45));
        display: grid;
        gap: 6px;
      }

      .summary-top {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
      }

      .summary-title {
        margin: 0;
        color: var(--text-muted, rgba(241, 245, 249, 0.95));
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .summary-value {
        margin: 0;
        color: var(--text-color, white);
        font-size: 22px;
        font-weight: 700;
      }

      .minimal-grid {
        display: grid;
        gap: 6px;
      }

      .minimal-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        flex-wrap: wrap;
      }

      .minimal-label {
        color: var(--text-muted, rgba(241, 245, 249, 0.95));
        font-size: var(--meta-size);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .minimal-value {
        color: var(--text-color, white);
        font-size: calc(var(--title-size) + 1px);
        font-weight: 700;
        line-height: 1;
      }

      .minimal-extra {
        color: var(--accent-text, #ffe7b8);
        font-size: var(--meta-size);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .text-line {
        margin: 0;
        color: var(--text-color, white);
        font-size: var(--text-size);
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0, 0, 0, 0.3);
      }

      .text-subline {
        margin: 0;
        color: var(--accent-text, #ffe7b8);
        font-size: calc(var(--meta-size) + 2px);
        font-weight: 600;
        line-height: 1.2;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0, 0, 0, 0.3);
      }

      .tagline {
        margin: 0;
        margin-top: auto;
        align-self: flex-start;
        color: rgba(226, 232, 240, 0.84);
        font-size: clamp(12px, calc(var(--meta-size) - 1px), 15px);
        font-weight: 700;
        letter-spacing: 0.04em;
        line-height: 1.1;
        text-rendering: geometricPrecision;
        text-align: left;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.78), 0 2px 8px rgba(0, 0, 0, 0.5);
      }

      .tagline-brand {
        color: hsl(38 40% 76%);
        font-weight: 800;
      }

      .widget.minimal .tagline {
        font-size: clamp(11px, calc(var(--meta-size) - 1px), 13px);
      }

      .widget.text .tagline {
        margin-top: 2px;
        color: rgba(226, 232, 240, 0.88);
        font-size: calc(var(--meta-size) + 1px);
        letter-spacing: 0.04em;
        text-align: left;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.84), 0 2px 8px rgba(0, 0, 0, 0.58);
      }

      .error {
        margin: 0;
        color: rgba(254, 202, 202, 0.8);
        font-size: calc(var(--meta-size) + 1px);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.85;
      }

      .widget.text .error {
        color: rgba(255, 228, 230, 0.8);
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      }
    </style>
  </head>
  <body>
    <main class="overlay" id="overlay" aria-live="polite">
      <section class="widget" id="widget">
        <div class="inner">
          <div class="header">
            <div class="title-group">
              <h1 class="title">Kappa Progress <span class="mode-badge">${mode.toUpperCase()}</span></h1>
            </div>
            <div class="status">
              <span class="dot" id="dot"></span><span id="status-text">Connecting</span>
            </div>
          </div>
          <p class="error" id="error-text" hidden>Waiting for profile data</p>
          <div id="metric-root"></div>
          <p class="tagline" id="tagline">Powered by <span class="tagline-brand">TarkovTracker.org</span></p>
        </div>
      </section>
    </main>
    <script>
      const CONFIG = ${JSON.stringify(overlayConfig)};
      const overlay = document.getElementById('overlay');
      const widget = document.getElementById('widget');
      const dot = document.getElementById('dot');
      const statusText = document.getElementById('status-text');
      const metricRoot = document.getElementById('metric-root');
      const errorText = document.getElementById('error-text');
      const tagline = document.getElementById('tagline');

      const isSelfContained = CONFIG.container === 'self-contained';
      if (isSelfContained) {
        document.documentElement.classList.add('self-contained');
        document.body.classList.add('self-contained');
        overlay.classList.add('self-contained');
      } else {
        const [valign, halign] = CONFIG.align === 'center'
          ? ['center', 'center']
          : CONFIG.align.split('-');
        overlay.classList.add('valign-' + valign, 'halign-' + halign);
      }
      widget.classList.add(CONFIG.layout);
      widget.classList.add('size-' + CONFIG.size);
      if (Number.isFinite(CONFIG.overlayScale)) {
        const normalizedScale = Math.max(0.5, Math.min(2.5, CONFIG.overlayScale));
        widget.style.setProperty('--overlay-scale', String(normalizedScale));
      }

      if (CONFIG.background === 'transparent') {
        overlay.classList.add('background-transparent');
        widget.classList.add('transparent');
      }

      if (CONFIG.background === 'custom' && typeof CONFIG.backgroundColor === 'string') {
        const normalized = CONFIG.backgroundColor.toLowerCase();
        const match = /^#([0-9a-f]{6})$/.exec(normalized);
        if (match) {
          const channelHex = match[1];
          const red = Number.parseInt(channelHex.slice(0, 2), 16);
          const green = Number.parseInt(channelHex.slice(2, 4), 16);
          const blue = Number.parseInt(channelHex.slice(4, 6), 16);
          const alphaPercent = Number(CONFIG.backgroundOpacity);
          const alpha = Number.isFinite(alphaPercent)
            ? Math.max(0, Math.min(100, alphaPercent)) / 100
            : 0.88;
          widget.style.setProperty(
            '--widget-custom-bg',
            'rgba(' +
              red +
              ', ' +
              green +
              ', ' +
              blue +
              ', ' +
              alpha.toFixed(2) +
              ')'
          );
          widget.classList.add('custom-background');
        }
      }

      document.documentElement.style.setProperty('--accent-bar', CONFIG.tokens.bar);
      document.documentElement.style.setProperty('--accent-glow', CONFIG.tokens.glow);
      document.documentElement.style.setProperty('--accent-text', CONFIG.tokens.text);

      if (CONFIG.fontFamily) {
        document.documentElement.style.setProperty('--font-family', CONFIG.fontFamily);
      }

      const hexToRgbClient = (hex) => [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
      ];

      if (typeof CONFIG.textColor === 'string' && /^#[0-9a-f]{6}$/.test(CONFIG.textColor)) {
        const [r, g, b] = hexToRgbClient(CONFIG.textColor);
        document.documentElement.style.setProperty('--text-color', CONFIG.textColor);
        document.documentElement.style.setProperty('--text-muted', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.85)');
      }

      if (typeof CONFIG.cardColor === 'string' && /^#[0-9a-f]{6}$/.test(CONFIG.cardColor)) {
        const [r, g, b] = hexToRgbClient(CONFIG.cardColor);
        const alphaPercent = Number(CONFIG.cardOpacity);
        const alpha = Number.isFinite(alphaPercent)
          ? Math.max(0, Math.min(100, alphaPercent)) / 100
          : 0.45;
        document.documentElement.style.setProperty(
          '--card-bg',
          'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha.toFixed(2) + ')'
        );
        document.documentElement.style.setProperty(
          '--card-border',
          'rgba(' + r + ', ' + g + ', ' + b + ', ' + Math.min(1, alpha + 0.15).toFixed(2) + ')'
        );
      }

      if (typeof CONFIG.borderColor === 'string' && /^#[0-9a-f]{6}$/.test(CONFIG.borderColor)) {
        const [r, g, b] = hexToRgbClient(CONFIG.borderColor);
        const alphaPercent = Number(CONFIG.borderOpacity);
        const alpha = Number.isFinite(alphaPercent)
          ? Math.max(0, Math.min(100, alphaPercent)) / 100
          : 0.12;
        document.documentElement.style.setProperty(
          '--border-color',
          'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha.toFixed(2) + ')'
        );
      }

      if (typeof CONFIG.trackColor === 'string' && /^#[0-9a-f]{6}$/.test(CONFIG.trackColor)) {
        const [r, g, b] = hexToRgbClient(CONFIG.trackColor);
        const trackAlphaPercent = Number(CONFIG.trackOpacity);
        const trackAlpha = Number.isFinite(trackAlphaPercent)
          ? Math.max(0, Math.min(100, trackAlphaPercent)) / 100
          : 0.2;
        document.documentElement.style.setProperty(
          '--progress-track',
          'rgba(' + r + ', ' + g + ', ' + b + ', ' + trackAlpha.toFixed(2) + ')'
        );
      }

      if (!CONFIG.showTitle) {
        const header = document.querySelector('.header');
        if (header) {
          header.classList.add('header-hidden');
        }
      }

      const formatPercent = (value) => {
        if (!Number.isFinite(value)) {
          return '0.0';
        }

        return Math.max(0, Math.min(100, value)).toFixed(1);
      };

      const getTitle = () => {
        if (CONFIG.customLabel) {
          return CONFIG.customLabel;
        }

        if (CONFIG.metric === 'items') {
          return 'Kappa Items';
        }

        if (CONFIG.metric === 'tasks') {
          return 'Kappa Tasks';
        }

        return 'Kappa Progress';
      };

      const getExtras = (percentage, remaining, remainingLabel) => {
        const extras = [];

        if (CONFIG.showPercent) {
          extras.push(formatPercent(percentage) + '%');
        }

        if (CONFIG.showRemaining) {
          extras.push(remaining + ' ' + remainingLabel + ' left');
        }

        return extras;
      };

      const createProgressNode = (pct) => {
        const numericPct = Number(pct) || 0;
        const progress = document.createElement('div');
        progress.className = 'progress';
        progress.setAttribute('role', 'progressbar');
        progress.setAttribute('aria-valuemin', '0');
        progress.setAttribute('aria-valuemax', '100');
        progress.setAttribute('aria-valuenow', String(numericPct));
        const fill = document.createElement('div');
        fill.className = 'fill';
        fill.style.width = numericPct + '%';
        progress.appendChild(fill);
        return progress;
      };

      const setMetricContent = (...nodes) => {
        metricRoot.replaceChildren(...nodes);
      };

      const createSummaryRow = (title, valueText, pct, label, extrasText) => {
        const row = document.createElement('article');
        row.className = 'summary-row';

        const top = document.createElement('div');
        top.className = 'summary-top';

        const titleNode = document.createElement('p');
        titleNode.className = 'summary-title';
        titleNode.textContent = title;

        const valueNode = document.createElement('p');
        valueNode.className = 'summary-value';
        valueNode.textContent = valueText;
        top.append(titleNode, valueNode);

        const meta = document.createElement('p');
        meta.className = 'meta';

        const metaLeft = document.createElement('span');
        metaLeft.className = 'meta-left';
        metaLeft.textContent = label;

        const metaRight = document.createElement('span');
        metaRight.className = 'meta-right';
        metaRight.textContent = extrasText;
        meta.append(metaLeft, metaRight);

        row.append(top, createProgressNode(pct), meta);
        return row;
      };

      const createMinimalRow = (label, valueText, extras) => {
        const row = document.createElement('div');
        row.className = 'minimal-row';

        const labelNode = document.createElement('span');
        labelNode.className = 'minimal-label';
        labelNode.textContent = label + ':';
        row.appendChild(labelNode);

        const valueNode = document.createElement('span');
        valueNode.className = 'minimal-value';
        valueNode.textContent = valueText;
        row.appendChild(valueNode);

        for (const extra of extras) {
          const extraNode = document.createElement('span');
          extraNode.className = 'minimal-extra';
          extraNode.textContent = extra;
          row.appendChild(extraNode);
        }

        return row;
      };

      const renderCardMetric = (label, current, total, percentage, remaining, remainingLabel) => {
        const pct = formatPercent(percentage);
        const remainingText = CONFIG.showRemaining ? remaining + ' ' + remainingLabel + ' left' : '';

        const cluster = document.createElement('div');
        cluster.className = 'card-metric-cluster';

        const valueLine = document.createElement('div');
        valueLine.className = 'value-line';

        const valueNode = document.createElement('p');
        valueNode.className = 'value';
        valueNode.textContent = current + '/' + total;
        valueLine.appendChild(valueNode);

        if (CONFIG.showPercent) {
          const percentNode = document.createElement('p');
          percentNode.className = 'percent';
          percentNode.textContent = pct + '%';
          valueLine.appendChild(percentNode);
        }

        const meta = document.createElement('p');
        meta.className = 'meta card-meta';

        const metaLeft = document.createElement('span');
        metaLeft.className = 'meta-left';
        metaLeft.append('Powered by ');

        const brand = document.createElement('span');
        brand.className = 'tagline-brand';
        brand.textContent = 'TarkovTracker.org';
        metaLeft.appendChild(brand);

        const metaRight = document.createElement('span');
        metaRight.className = 'meta-right';
        metaRight.textContent = remainingText;
        meta.append(metaLeft, metaRight);

        cluster.append(valueLine, createProgressNode(pct), meta);
        setMetricContent(cluster);
      };

      const renderCardSummary = (tasks, items) => {
        const tasksPct = formatPercent(tasks.percentage);
        const itemsPct = formatPercent(items.percentage);
        const tasksExtras = getExtras(tasks.percentage, tasks.remaining, 'tasks').join(' · ');
        const itemsExtras = getExtras(items.percentage, items.remaining, 'items').join(' · ');

        const grid = document.createElement('div');
        grid.className = 'summary-grid';
        grid.append(
          createSummaryRow('Kappa Tasks', tasks.completed + '/' + tasks.total, tasksPct, 'Tasks', tasksExtras),
          createSummaryRow('Kappa Items', items.collected + '/' + items.total, itemsPct, 'Items', itemsExtras)
        );
        setMetricContent(grid);
      };

      const renderMinimalMetric = (
        label,
        current,
        total,
        percentage,
        remaining,
        remainingLabel
      ) => {
        const extras = getExtras(percentage, remaining, remainingLabel);
        const grid = document.createElement('div');
        grid.className = 'minimal-grid';
        grid.appendChild(createMinimalRow(label, current + '/' + total, extras));
        setMetricContent(grid);
      };

      const renderMinimalSummary = (tasks, items) => {
        const taskExtras = getExtras(tasks.percentage, tasks.remaining, 'tasks');
        const itemExtras = getExtras(items.percentage, items.remaining, 'items');

        const grid = document.createElement('div');
        grid.className = 'minimal-grid';
        grid.append(
          createMinimalRow('Tasks', tasks.completed + '/' + tasks.total, taskExtras),
          createMinimalRow('Items', items.collected + '/' + items.total, itemExtras)
        );
        setMetricContent(grid);
      };

      const renderTextMetric = (label, current, total, percentage, remaining, remainingLabel) => {
        const extras = getExtras(percentage, remaining, remainingLabel);
        const lineNode = document.createElement('p');
        lineNode.className = 'text-line';
        lineNode.textContent = label + ': ' + current + '/' + total;
        const nodes = [lineNode];

        if (extras.length > 0) {
          const sublineNode = document.createElement('p');
          sublineNode.className = 'text-subline';
          sublineNode.textContent = extras.join(' · ');
          nodes.push(sublineNode);
        }

        setMetricContent(...nodes);
      };

      const renderTextSummary = (tasks, items) => {
        const mainLine =
          'Tasks ' + tasks.completed + '/' + tasks.total + ' | Items ' + items.collected + '/' + items.total;

        const extras = [];

        if (CONFIG.showPercent) {
          extras.push('T ' + formatPercent(tasks.percentage) + '%');
          extras.push('I ' + formatPercent(items.percentage) + '%');
        }

        if (CONFIG.showRemaining) {
          extras.push(tasks.remaining + ' tasks left');
          extras.push(items.remaining + ' items left');
        }

        const lineNode = document.createElement('p');
        lineNode.className = 'text-line';
        lineNode.textContent = mainLine;
        const nodes = [lineNode];

        if (extras.length > 0) {
          const sublineNode = document.createElement('p');
          sublineNode.className = 'text-subline';
          sublineNode.textContent = extras.join(' · ');
          nodes.push(sublineNode);
        }

        setMetricContent(...nodes);
      };

      const renderByLayout = (payload) => {
        if (tagline) {
          tagline.hidden = CONFIG.layout === 'card' && CONFIG.metric !== 'summary';
        }

        if (CONFIG.metric === 'summary') {
          if (CONFIG.layout === 'text') {
            renderTextSummary(payload.tasks, payload.items);
            return;
          }

          if (CONFIG.layout === 'minimal') {
            renderMinimalSummary(payload.tasks, payload.items);
            return;
          }

          renderCardSummary(payload.tasks, payload.items);
          return;
        }

        const single =
          CONFIG.metric === 'items'
            ? {
                current: payload.items.collected,
                label: 'Kappa Items',
                percentage: payload.items.percentage,
                remaining: payload.items.remaining,
                remainingLabel: 'items',
                total: payload.items.total,
              }
            : {
                current: payload.tasks.completed,
                label: 'Kappa Tasks',
                percentage: payload.tasks.percentage,
                remaining: payload.tasks.remaining,
                remainingLabel: 'tasks',
                total: payload.tasks.total,
              };

        if (CONFIG.layout === 'text') {
          renderTextMetric(
            single.label,
            single.current,
            single.total,
            single.percentage,
            single.remaining,
            single.remainingLabel
          );
          return;
        }

        if (CONFIG.layout === 'minimal') {
          renderMinimalMetric(
            single.label,
            single.current,
            single.total,
            single.percentage,
            single.remaining,
            single.remainingLabel
          );
          return;
        }

        renderCardMetric(
          single.label,
          single.current,
          single.total,
          single.percentage,
          single.remaining,
          single.remainingLabel
        );
      };

      const setConnected = (connected) => {
        dot.classList.toggle('live', connected);
        statusText.textContent = connected ? 'Live' : 'Retrying';
      };

      const setError = (message) => {
        errorText.hidden = false;
        errorText.textContent = message;
      };

      const clearError = () => {
        errorText.hidden = true;
        errorText.textContent = '';
      };

      const resolveErrorMessage = (error) => {
        const message = typeof error?.message === 'string' ? error.message : '';

        if (message === 'HTTP_401') {
          return 'Overlay endpoint requires auth';
        }

        if (message === 'HTTP_403') {
          return 'Profile mode is private';
        }

        if (message === 'HTTP_404') {
          return 'Shared profile not found';
        }

        if (message === 'HTTP_503') {
          return 'Shared profiles unavailable';
        }

        return 'Waiting for public profile share';
      };

      const applyTitle = () => {
        const titleNode = document.querySelector('.title');
        const title = getTitle();

        if (titleNode) {
          titleNode.textContent = title;
        }
      };

      applyTitle();

      let timerId = null;
      let abortController = null;
      let stopped = false;
      let lastFetchTime = 0;

      const fetchMetrics = async () => {
        if (stopped) {
          return;
        }

        if (abortController) {
          abortController.abort();
        }

        if (stopped) {
          return;
        }

        abortController = new AbortController();
        lastFetchTime = Date.now();

        try {
          const refreshUrl = CONFIG.apiPath + '?_=' + Date.now();
          const response = await fetch(refreshUrl, {
            cache: 'no-store',
            signal: abortController.signal,
          });

          if (!response.ok) {
            throw new Error('HTTP_' + response.status);
          }

          const payload = await response.json();
          clearError();
          setConnected(true);
          renderByLayout(payload);
        } catch (error) {
          if (error && error.name === 'AbortError') {
            return;
          }

          setConnected(false);
          setError(resolveErrorMessage(error));
        } finally {
          if (!stopped) {
            if (timerId) {
              window.clearTimeout(timerId);
            }
            timerId = window.setTimeout(fetchMetrics, CONFIG.intervalMs);
          }
        }
      };

      fetchMetrics();

      const refreshOnWake = () => {
        if (stopped || document.hidden) {
          return;
        }

        const elapsed = Date.now() - lastFetchTime;

        if (elapsed < CONFIG.intervalMs * 0.8) {
          return;
        }

        if (timerId) {
          window.clearTimeout(timerId);
          timerId = null;
        }

        fetchMetrics();
      };

      document.addEventListener('visibilitychange', refreshOnWake);
      window.addEventListener('online', refreshOnWake);

      let progressChannel = null;

      if (typeof BroadcastChannel !== 'undefined') {
        progressChannel = new BroadcastChannel('tarkov-progress:' + CONFIG.userId);

        progressChannel.onmessage = function () {
          if (stopped || document.hidden) {
            return;
          }

          if (timerId) {
            window.clearTimeout(timerId);
            timerId = null;
          }

          fetchMetrics();
        };
      }

      const stopFetchLoop = () => {
        stopped = true;

        if (timerId) {
          window.clearTimeout(timerId);
          timerId = null;
        }

        if (abortController) {
          abortController.abort();
          abortController = null;
        }

        if (typeof progressChannel !== 'undefined' && progressChannel != null) {
          progressChannel.onmessage = null;
          progressChannel.close();
          progressChannel = null;
        }
      };

      window.addEventListener('beforeunload', stopFetchLoop);
      window.addEventListener('unload', stopFetchLoop);
    </script>
  </body>
</html>`;
});
