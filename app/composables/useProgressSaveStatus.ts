import {
  CLOUD_SAVE_RETRY_DELAYS_MS,
  progressSaveStatus,
  retryCloudSave,
  type CloudSaveFailure,
  type CloudSaveState,
  type LocalSaveFailure,
} from '@/stores/tarkov/progressSaveStatus';
export type ProgressSaveStatusKind =
  'cloud_pending' | 'cloud_retrying' | 'cloud_failed' | 'local_failed';
const CLOUD_STATE_KINDS: Record<CloudSaveState, ProgressSaveStatusKind | null> = {
  idle: null,
  pending: 'cloud_pending',
  saving: 'cloud_pending',
  retry_scheduled: 'cloud_retrying',
  failed: 'cloud_failed',
};
/** Unsaved (memory-only) changes outrank a cloud warning: they are the larger loss risk. */
const resolveKind = (): ProgressSaveStatusKind | null =>
  progressSaveStatus.local === 'failed'
    ? 'local_failed'
    : CLOUD_STATE_KINDS[progressSaveStatus.cloud.state];
const CLOUD_CAUSE_KEYS: Record<CloudSaveFailure, string> = {
  offline: 'progress_save_status.cause_offline',
  rate_limited: 'progress_save_status.cause_rate_limited',
  auth: 'progress_save_status.cause_auth',
  unknown: 'progress_save_status.cause_unknown',
};
const LOCAL_CAUSE_KEYS: Record<LocalSaveFailure, string> = {
  quota: 'progress_save_status.cause_quota',
  unavailable: 'progress_save_status.cause_unavailable',
  unknown: 'progress_save_status.cause_unknown',
};
const localCauseKey = (): string | null =>
  progressSaveStatus.localFailure ? LOCAL_CAUSE_KEYS[progressSaveStatus.localFailure] : null;
const cloudCauseKey = (): string | null =>
  progressSaveStatus.cloud.failure ? CLOUD_CAUSE_KEYS[progressSaveStatus.cloud.failure] : null;
/**
 * View model for the progress save indicator. It names the failed destination,
 * whether a confirmed local copy exists, and the known cause when there is one.
 */
export function useProgressSaveStatus() {
  const retrying = ref(false);
  const kind = computed(resolveKind);
  const cloudPending = computed(() => progressSaveStatus.cloud.state !== 'idle');
  const locallySaved = computed(() => progressSaveStatus.local === 'saved');
  const causeKey = computed(() =>
    kind.value === 'local_failed' ? localCauseKey() : cloudCauseKey()
  );
  const showsQuotaGuidance = computed(
    () => kind.value === 'local_failed' && progressSaveStatus.localFailure === 'quota'
  );
  const canRetry = computed(
    () => cloudPending.value && progressSaveStatus.cloud.state !== 'saving' && !retrying.value
  );
  const retryAttempt = computed(() => progressSaveStatus.cloud.retryAttempt);
  const retryTotal = CLOUD_SAVE_RETRY_DELAYS_MS.length;
  const retry = async (): Promise<boolean> => {
    retrying.value = true;
    try {
      return await retryCloudSave();
    } finally {
      retrying.value = false;
    }
  };
  return {
    kind,
    cloudPending,
    locallySaved,
    causeKey,
    showsQuotaGuidance,
    canRetry,
    retrying,
    retryAttempt,
    retryTotal,
    retry,
  };
}
