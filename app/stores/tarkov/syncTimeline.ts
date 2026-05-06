const SELF_ORIGIN_THRESHOLD_MS = 3000;
const RECENT_LOCAL_SYNC_HISTORY_SIZE = 20;
const recentLocalSyncTimes: number[] = [];
let lastLocalSyncTime = 0;
export const recordLocalSyncTime = (): void => {
  const now = Date.now();
  lastLocalSyncTime = now;
  recentLocalSyncTimes.push(now);
  if (recentLocalSyncTimes.length > RECENT_LOCAL_SYNC_HISTORY_SIZE) {
    recentLocalSyncTimes.shift();
  }
};
export const isLikelySelfOriginUpdate = (updateTime: number): boolean => {
  if (!Number.isFinite(updateTime)) return false;
  return recentLocalSyncTimes.some((syncTime) => {
    return Math.abs(updateTime - syncTime) < SELF_ORIGIN_THRESHOLD_MS;
  });
};
export const getLastLocalSyncTime = (): number => lastLocalSyncTime;
export const resetSyncTimeline = (): void => {
  lastLocalSyncTime = 0;
  recentLocalSyncTimes.length = 0;
};
export const SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS = SELF_ORIGIN_THRESHOLD_MS;
