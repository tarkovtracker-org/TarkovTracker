import { logger } from '@/utils/logger';
type PerfMeta = Record<string, unknown>;
const rawPerfFlag = import.meta.env.VITE_PERF_DEBUG;
const PERF_ENABLED =
  typeof rawPerfFlag === 'string' && ['1', 'true', 'yes', 'on'].includes(rawPerfFlag.toLowerCase());
export type PerfTimer = {
  label: string;
  start: number;
  meta?: PerfMeta;
};
export const perfEnabled = (): boolean => PERF_ENABLED;
// Compute a consistent time origin offset at module load to avoid mixing time origins
// If performance.now() is available, we use performance.timeOrigin + performance.now() for consistent epoch-based times
const perfTimeOrigin: number =
  typeof performance !== 'undefined' &&
  typeof performance.now === 'function' &&
  typeof performance.timeOrigin === 'number' &&
  Number.isFinite(performance.timeOrigin)
    ? performance.timeOrigin
    : 0;
// Only use performance.now() when we have a valid time origin for epoch-based timestamps
const usePerfNow = perfTimeOrigin !== 0;
export const perfNow = (): number => {
  if (usePerfNow) {
    return perfTimeOrigin + performance.now();
  }
  return Date.now();
};
export const roundPerfMs = (value: number): number => Math.round(value * 100) / 100;
export const perfStart = (label: string, meta?: PerfMeta): PerfTimer | null => {
  if (!PERF_ENABLED) return null;
  return { label, start: perfNow(), meta };
};
export const perfEnd = (timer: PerfTimer | null, meta?: PerfMeta): number | null => {
  // Guard: skip logging when perf is disabled (handles manually created timers)
  if (!PERF_ENABLED) return null;
  if (!timer) return null;
  const durationMs = perfNow() - timer.start;
  const payload = meta ? { ...(timer.meta ?? {}), ...meta } : timer.meta;
  const durationLabel = `${durationMs.toFixed(2)}ms`;
  if (payload) {
    logger.debug(`[Perf] ${timer.label} ${durationLabel}`, payload);
  } else {
    logger.debug(`[Perf] ${timer.label} ${durationLabel}`);
  }
  return durationMs;
};
