const SELF_ORIGIN_THRESHOLD_MS = 3000;
const RECENT_LOCAL_SYNC_HISTORY_SIZE = 20;
const recentLocalSyncTimes: number[] = [];
let lastLocalSyncTime = 0;
const pendingWrites = new Map<symbol, number>();
const recordSyncTime = (now: number): void => {
  lastLocalSyncTime = Math.max(lastLocalSyncTime, now);
  recentLocalSyncTimes.push(now);
  if (recentLocalSyncTimes.length > RECENT_LOCAL_SYNC_HISTORY_SIZE) {
    recentLocalSyncTimes.shift();
  }
};
export const recordLocalSyncTime = (): void => recordSyncTime(Date.now());
/** Mark only an actual write; failed requests leave no permanent timeline entry. */
export const beginLocalSync = (): ((succeeded: boolean) => void) => {
  const token = Symbol();
  const startedAt = Date.now();
  pendingWrites.set(token, startedAt);
  return (succeeded) => {
    if (!pendingWrites.delete(token)) return;
    if (succeeded) recordSyncTime(startedAt);
  };
};
export const isLikelySelfOriginUpdate = (updateTime: number): boolean => {
  if (!Number.isFinite(updateTime)) return false;
  return [...recentLocalSyncTimes, ...pendingWrites.values()].some((syncTime) => {
    return Math.abs(updateTime - syncTime) < SELF_ORIGIN_THRESHOLD_MS;
  });
};
export const getLastLocalSyncTime = (): number => lastLocalSyncTime;
export const resetSyncTimeline = (): void => {
  lastLocalSyncTime = 0;
  recentLocalSyncTimes.length = 0;
  pendingWrites.clear();
};
export const SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS = SELF_ORIGIN_THRESHOLD_MS;
