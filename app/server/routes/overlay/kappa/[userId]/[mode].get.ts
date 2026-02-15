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
type OverlayAccent = 'info' | 'kappa' | 'success' | 'warning';
type OverlayAlign = 'center' | 'left' | 'right';
type OverlayLayout = 'card' | 'minimal' | 'text';
type OverlaySize = 'lg' | 'md' | 'sm';
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
  if (normalized === 'info' || normalized === 'kappa' || normalized === 'success') {
    return normalized;
  }
  if (normalized === 'warning') {
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
const normalizeAlign = (value: unknown): OverlayAlign => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (normalized === 'left' || normalized === 'center' || normalized === 'right') {
    return normalized;
  }
  return 'left';
};
const normalizeSize = (value: unknown): OverlaySize => {
  const normalized = readScalarQueryValue(value).toLowerCase();
  if (normalized === 'sm' || normalized === 'md' || normalized === 'lg') {
    return normalized;
  }
  return 'md';
};
const normalizeIntervalMs = (value: unknown): number => {
  const raw = Number(readScalarQueryValue(value));
  if (!Number.isFinite(raw)) {
    return 60000;
  }
  return Math.min(600000, Math.max(60000, Math.round(raw)));
};
const normalizeLabel = (value: unknown): string | null => {
  const normalized = readScalarQueryValue(value);
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 60).replace(/[<>`]/g, '');
};
const ACCENT_TOKENS: Record<OverlayAccent, { bar: string; glow: string; text: string }> = {
  info: {
    bar: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.35)',
    text: '#d0f2ff',
  },
  kappa: {
    bar: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.35)',
    text: '#ffe7b8',
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
  const layout = normalizeLayout(query.layout);
  const size = normalizeSize(query.size);
  const intervalMs = normalizeIntervalMs(query.interval);
  const transparentBackground = parseBoolean(query.transparent, false);
  const showPercent = parseBoolean(query.showPercent, true);
  const showRemaining = parseBoolean(query.showRemaining, true);
  const customLabel = normalizeLabel(query.label);
  const overlayConfig = {
    accent,
    align,
    apiPath: `/api/streamer/${userId}/${mode}/kappa`,
    customLabel,
    intervalMs,
    layout,
    metric,
    modeLabel: mode.toUpperCase(),
    showPercent,
    showRemaining,
    size,
    tokens: ACCENT_TOKENS[accent],
    transparentBackground,
  };
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
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
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
        font-family: 'Rajdhani', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }

      .overlay {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        padding: 8px;
      }

      .overlay.align-left {
        justify-content: flex-start;
      }

      .overlay.align-center {
        justify-content: center;
      }

      .overlay.align-right {
        justify-content: flex-end;
      }

      .widget {
        --title-size: 24px;
        --value-size: 52px;
        --percent-size: 30px;
        --meta-size: 14px;
        --text-size: 36px;
        width: 100%;
        max-width: 680px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: linear-gradient(150deg, rgba(8, 12, 16, 0.92), rgba(17, 24, 39, 0.88));
        box-shadow: 0 14px 42px rgba(0, 0, 0, 0.5);
        border-radius: 14px;
        backdrop-filter: blur(4px);
        animation: fadeIn 400ms ease-out both;
      }

      .widget.size-sm {
        --title-size: 19px;
        --value-size: 38px;
        --percent-size: 21px;
        --meta-size: 12px;
        --text-size: 24px;
      }

      .widget.size-lg {
        --title-size: 29px;
        --value-size: 64px;
        --percent-size: 38px;
        --meta-size: 16px;
        --text-size: 42px;
      }

      .widget.transparent {
        background: rgba(2, 6, 23, 0.25);
        border-color: rgba(255, 255, 255, 0.06);
        box-shadow: none;
        backdrop-filter: none;
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
        color: white;
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

      .status {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: rgba(226, 232, 240, 0.8);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #94a3b8;
      }

      .dot.live {
        background: #22c55e;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
      }

      .value-line {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
      }

      .value {
        margin: 0;
        color: white;
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
        background: rgba(148, 163, 184, 0.2);
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
        color: rgba(226, 232, 240, 0.94);
        font-size: var(--meta-size);
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

      .summary-grid {
        display: grid;
        gap: 8px;
      }

      .summary-row {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        padding: 8px 10px;
        background: rgba(15, 23, 42, 0.45);
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
        color: rgba(241, 245, 249, 0.95);
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .summary-value {
        margin: 0;
        color: white;
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
        color: rgba(241, 245, 249, 0.95);
        font-size: var(--meta-size);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .minimal-value {
        color: white;
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
        color: white;
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

      overlay.classList.add('align-' + CONFIG.align);
      widget.classList.add(CONFIG.layout);
      widget.classList.add('size-' + CONFIG.size);

      if (CONFIG.transparentBackground) {
        widget.classList.add('transparent');
      }

      document.documentElement.style.setProperty('--accent-bar', CONFIG.tokens.bar);
      document.documentElement.style.setProperty('--accent-glow', CONFIG.tokens.glow);
      document.documentElement.style.setProperty('--accent-text', CONFIG.tokens.text);

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

      const renderCardMetric = (label, current, total, percentage, remaining, remainingLabel) => {
        const pct = formatPercent(percentage);
        const extras = getExtras(percentage, remaining, remainingLabel);

        let html = '';
        html += '<div class="value-line">';
        html += '<p class="value">' + current + '/' + total + '</p>';

        if (CONFIG.showPercent) {
          html += '<p class="percent">' + pct + '%</p>';
        }

        html += '</div>';
        html +=
          '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
          pct +
          '">';
        html += '<div class="fill" style="width:' + pct + '%"></div>';
        html += '</div>';
        html += '<p class="meta">';
        html += '<span class="meta-left">' + label + '</span>';
        html += '<span class="meta-right">' + extras.join(' · ') + '</span>';
        html += '</p>';

        metricRoot.innerHTML = html;
      };

      const renderCardSummary = (tasks, items) => {
        const tasksPct = formatPercent(tasks.percentage);
        const itemsPct = formatPercent(items.percentage);
        const tasksExtras = getExtras(tasks.percentage, tasks.remaining, 'tasks').join(' · ');
        const itemsExtras = getExtras(items.percentage, items.remaining, 'items').join(' · ');

        let html = '';
        html += '<div class="summary-grid">';

        html += '<article class="summary-row">';
        html += '<div class="summary-top">';
        html += '<p class="summary-title">Kappa Tasks</p>';
        html += '<p class="summary-value">' + tasks.completed + '/' + tasks.total + '</p>';
        html += '</div>';
        html +=
          '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
          tasksPct +
          '">';
        html += '<div class="fill" style="width:' + tasksPct + '%"></div>';
        html += '</div>';
        html += '<p class="meta"><span class="meta-left">Tasks</span><span class="meta-right">' + tasksExtras + '</span></p>';
        html += '</article>';

        html += '<article class="summary-row">';
        html += '<div class="summary-top">';
        html += '<p class="summary-title">Kappa Items</p>';
        html += '<p class="summary-value">' + items.collected + '/' + items.total + '</p>';
        html += '</div>';
        html +=
          '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
          itemsPct +
          '">';
        html += '<div class="fill" style="width:' + itemsPct + '%"></div>';
        html += '</div>';
        html += '<p class="meta"><span class="meta-left">Items</span><span class="meta-right">' + itemsExtras + '</span></p>';
        html += '</article>';

        html += '</div>';
        metricRoot.innerHTML = html;
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

        let html = '';
        html += '<div class="minimal-grid">';
        html += '<div class="minimal-row">';
        html += '<span class="minimal-label">' + label + ':</span>';
        html += '<span class="minimal-value">' + current + '/' + total + '</span>';

        for (const extra of extras) {
          html += '<span class="minimal-extra">' + extra + '</span>';
        }

        html += '</div>';
        html += '</div>';

        metricRoot.innerHTML = html;
      };

      const renderMinimalSummary = (tasks, items) => {
        const taskExtras = getExtras(tasks.percentage, tasks.remaining, 'tasks');
        const itemExtras = getExtras(items.percentage, items.remaining, 'items');

        let html = '';
        html += '<div class="minimal-grid">';

        html += '<div class="minimal-row">';
        html += '<span class="minimal-label">Tasks:</span>';
        html += '<span class="minimal-value">' + tasks.completed + '/' + tasks.total + '</span>';

        for (const extra of taskExtras) {
          html += '<span class="minimal-extra">' + extra + '</span>';
        }

        html += '</div>';

        html += '<div class="minimal-row">';
        html += '<span class="minimal-label">Items:</span>';
        html += '<span class="minimal-value">' + items.collected + '/' + items.total + '</span>';

        for (const extra of itemExtras) {
          html += '<span class="minimal-extra">' + extra + '</span>';
        }

        html += '</div>';
        html += '</div>';

        metricRoot.innerHTML = html;
      };

      const renderTextMetric = (label, current, total, percentage, remaining, remainingLabel) => {
        const extras = getExtras(percentage, remaining, remainingLabel);
        const line = label + ': ' + current + '/' + total;

        let html = '';
        html += '<p class="text-line">' + line + '</p>';

        if (extras.length > 0) {
          html += '<p class="text-subline">' + extras.join(' · ') + '</p>';
        }

        metricRoot.innerHTML = html;
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

        let html = '';
        html += '<p class="text-line">' + mainLine + '</p>';

        if (extras.length > 0) {
          html += '<p class="text-subline">' + extras.join(' · ') + '</p>';
        }

        metricRoot.innerHTML = html;
      };

      const renderByLayout = (payload) => {
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

      const fetchMetrics = async () => {
        if (abortController) {
          abortController.abort();
        }

        abortController = new AbortController();

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
          timerId = window.setTimeout(fetchMetrics, CONFIG.intervalMs);
        }
      };

      fetchMetrics();

      window.addEventListener('beforeunload', () => {
        if (timerId) {
          window.clearTimeout(timerId);
        }

        if (abortController) {
          abortController.abort();
        }
      });
    </script>
  </body>
</html>`;
});
