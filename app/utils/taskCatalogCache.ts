// Browser namespaces for task snapshots. Server snapshots are versioned by the release manifest.
export const taskCoreCacheKey = (mode: string): string => `neutral-v2-${mode}`;
export const TASK_OBJECTIVES_CACHE_VERSION = 'neutral-v2';
export const TASK_OBJECTIVES_PURGE_CHECK_TTL_MS = 60_000;
