import { logger } from '@/utils/logger';
/**
 * Truthful save status for the signed-in player's progress (see `CONTEXT.md`).
 *
 * Local persistence and cloud acknowledgement are tracked as separate facts:
 * a cloud failure never implies the local save succeeded, and vice versa.
 */
/** Bounded automatic cloud-save retries; afterwards changes stay pending for manual retry. */
export const CLOUD_SAVE_RETRY_DELAYS_MS = [5000, 15000, 60000] as const;
export type CloudSaveState = 'idle' | 'pending' | 'saving' | 'retry_scheduled' | 'failed';
type LocalSaveState = 'unknown' | 'pending' | 'saved' | 'failed';
export type CloudSaveFailure = 'offline' | 'rate_limited' | 'auth' | 'unknown';
export type LocalSaveFailure = 'quota' | 'unavailable' | 'unknown';
export type CloudSaveStatus = {
  state: CloudSaveState;
  failure: CloudSaveFailure | null;
  retryAttempt: number;
  nextRetryAt: number | null;
};
type ProgressSaveStatusState = {
  cloud: CloudSaveStatus;
  local: LocalSaveState;
  localFailure: LocalSaveFailure | null;
  localSavedAt: number | null;
};
const createIdleCloudStatus = (): CloudSaveStatus => ({
  state: 'idle',
  failure: null,
  retryAttempt: 0,
  nextRetryAt: null,
});
const status = reactive<ProgressSaveStatusState>({
  cloud: createIdleCloudStatus(),
  local: 'unknown',
  localFailure: null,
  localSavedAt: null,
});
let cloudRetryHandler: (() => Promise<boolean>) | null = null;
let unacknowledgedLocalFailure = false;
let pendingLocalCloudHeld = false;
export const progressSaveStatus: Readonly<ProgressSaveStatusState> = readonly(status);
/** A queued write is held only in memory until the browser confirms it under the cross-tab lock. */
export const recordLocalSavePending = (cloudHeld = false): void => {
  status.local = 'pending';
  status.localFailure = null;
  pendingLocalCloudHeld = cloudHeld;
};
export const setCloudSaveStatus = (next: CloudSaveStatus): void => {
  if (status.cloud.state !== 'idle' && next.state === 'idle') {
    unacknowledgedLocalFailure = false;
    pendingLocalCloudHeld = true;
  }
  status.cloud = { ...next };
};
/** `cloudHeld` marks a write of state the cloud already holds: its failure loses no progress. */
export const recordLocalSave = (
  succeeded: boolean,
  failure: LocalSaveFailure | null = null,
  cloudHeld = false
): void => {
  cloudHeld ||= status.local === 'pending' && pendingLocalCloudHeld;
  status.local = succeeded ? 'saved' : 'failed';
  status.localFailure = succeeded ? null : (failure ?? 'unknown');
  if (succeeded || !cloudHeld) unacknowledgedLocalFailure = !succeeded;
  if (succeeded) status.localSavedAt = Date.now();
};
/** The retry handler belongs to one sync controller; stale owners cannot clear a newer one. */
export const registerCloudRetryHandler = (handler: () => Promise<boolean>): (() => void) => {
  cloudRetryHandler = handler;
  return () => {
    if (cloudRetryHandler === handler) cloudRetryHandler = null;
  };
};
export const retryCloudSave = async (): Promise<boolean> => {
  if (!cloudRetryHandler) return false;
  try {
    return await cloudRetryHandler();
  } catch (error) {
    logger.error('[ProgressSaveStatus] Manual cloud save retry failed:', error);
    return false;
  }
};
/**
 * Without a running sync controller nothing reaches the cloud, so a signed-in session whose
 * initial sync failed must stay visibly pending. `retry` restarts sync initialization.
 */
export const markCloudSyncUnavailable = (retry: () => Promise<boolean>): void => {
  status.cloud = { state: 'failed', failure: 'unknown', retryAttempt: 0, nextRetryAt: null };
  cloudRetryHandler = retry;
};
/** Cloud status belongs to the signed-in session; local status survives sign-out. */
export const resetCloudSaveStatus = (): void => {
  status.cloud = createIdleCloudStatus();
  cloudRetryHandler = null;
};
/** A successful startup load uploaded or matched the resolved state, so the cloud holds it. */
export const acknowledgeStartupSync = (): void => {
  resetCloudSaveStatus();
  unacknowledgedLocalFailure = false;
  pendingLocalCloudHeld = true;
};
export const hasPendingCloudChanges = (): boolean => status.cloud.state !== 'idle';
/** Pending cloud changes without a confirmed local save may be lost on reload or sign-out. */
export const hasUnsavedProgressChanges = (): boolean =>
  (status.local === 'pending' && !pendingLocalCloudHeld) ||
  ((status.local === 'failed' || status.local === 'pending') &&
    (unacknowledgedLocalFailure || hasPendingCloudChanges()));
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (status.local !== 'pending' || !hasUnsavedProgressChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}
const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);
const UNAVAILABLE_ERROR_NAMES = new Set(['SecurityError', 'InvalidStateError']);
const errorName = (error: unknown): string =>
  error !== null && typeof error === 'object' && 'name' in error ? String(error.name) : '';
export const classifyLocalSaveFailure = (error: unknown): LocalSaveFailure => {
  const name = errorName(error);
  if (QUOTA_ERROR_NAMES.has(name)) return 'quota';
  if (UNAVAILABLE_ERROR_NAMES.has(name)) return 'unavailable';
  return 'unknown';
};
