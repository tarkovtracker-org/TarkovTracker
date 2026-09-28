import { delay } from '@/utils/async';
import { debounce, isDebounceRejection } from '@/utils/debounce';
import { logger } from '@/utils/logger';
import {
  createPendingStateTracker,
  snapshotSyncState,
  type RemoteStateMerge,
  type WithRemoteSnapshot,
} from '@/utils/pendingState';
import type {
  CloudSaveFailure,
  CloudSaveState,
  CloudSaveStatus,
} from '@/stores/tarkov/progressSaveStatus';
import type { StateTree, Store } from 'pinia';
import type { UserProgressData } from '~/stores/progressState';
type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};
type SupabaseSyncPayload = Record<string, unknown> & {
  user_id?: string | null;
};
const ABORT_RETRY_DELAY_MS = 150;
export interface SupabaseSyncConfig<
  TState extends StateTree = StateTree,
  TPayload extends SupabaseSyncPayload = SupabaseSyncPayload,
> {
  store: Store<string, TState>;
  table: string;
  transform?: (state: TState) => TPayload | null;
  sync?: (payload: TPayload) => Promise<{ error: SupabaseErrorLike | null }>;
  debounceMs?: number;
  onSynced?: () => void;
  /** Delays for automatic retries after a failed write; empty disables them. */
  retryDelaysMs?: readonly number[];
  /**
   * Merges changes made elsewhere into the pending state before a retry uploads it; rejects when
   * the remote state cannot be read, so the retry does not overwrite it with a stale snapshot.
   */
  reconcileBeforeRetry?: () => Promise<void>;
  /** Observes cloud save status: pending until the service acknowledges the latest changes. */
  onSaveStatusChange?: (status: CloudSaveStatus) => void;
}
export interface SupabaseSyncReturn<
  TState extends StateTree = StateTree,
  TPayload extends SupabaseSyncPayload = SupabaseSyncPayload,
> {
  hasPendingChanges?: () => boolean;
  captureRemoteMerge?: () => RemoteStateMerge;
  withSnapshot?: WithRemoteSnapshot;
  isSyncing: Ref<boolean>;
  isPaused: Ref<boolean>;
  saveStatus: Ref<CloudSaveStatus>;
  /** Resets the retry budget and saves now; resolves `true` once nothing is pending. */
  retryNow: () => Promise<boolean>;
  cleanup: () => void;
  pause: () => void;
  resume: () => void;
  syncToSupabase: (state?: TState) => Promise<TPayload | null>;
}
// Type for the transformed data that gets sent to Supabase
interface SupabaseUserData {
  user_id?: string;
  current_game_mode?: string;
  game_edition?: number;
  pvp_data?: UserProgressData;
  pve_data?: UserProgressData;
  [key: string]: unknown;
}
// Fast hash for change detection - avoids full JSON comparison
function hashState(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}
function getMissingColumnName(error: SupabaseErrorLike): string | null {
  const combined = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
  const schemaCacheMatch = combined.match(/could not find the ['"]([^'"]+)['"] column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
  const quotedColumnMatch = combined.match(/column ['"]([^'"]+)['"] does not exist/i);
  if (quotedColumnMatch?.[1]) return quotedColumnMatch[1];
  const bareColumnMatch = combined.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  if (bareColumnMatch?.[1]) return bareColumnMatch[1];
  return null;
}
function isMissingColumnError(error: SupabaseErrorLike): boolean {
  if (error.code === 'PGRST204') return true;
  const combined =
    `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return combined.includes('column') && combined.includes('does not exist');
}
function isAbortRequestError(error: SupabaseErrorLike): boolean {
  const combined =
    `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return (
    combined.includes('aborterror') ||
    combined.includes('aborted') ||
    combined.includes('signal is aborted') ||
    combined.includes('request was aborted')
  );
}
function getFallbackPayload(
  payload: Record<string, unknown>,
  missingColumn: string
): Record<string, unknown> | null {
  if (!(missingColumn in payload)) {
    return null;
  }
  const missingValue = payload[missingColumn];
  const fallbackPayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== missingColumn)
  );
  if (
    missingColumn === 'only_tasks_with_required_keys' &&
    !('only_tasks_with_suggested_keys' in fallbackPayload)
  ) {
    fallbackPayload.only_tasks_with_suggested_keys = missingValue;
  }
  return fallbackPayload;
}
function formatSupabaseError(error: SupabaseErrorLike) {
  return {
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    message: error.message ?? null,
  };
}
/** Outcome of one write, including any columns dropped to satisfy an older schema. */
type SupabaseSyncAttempt = {
  synced: boolean;
  error: SupabaseErrorLike | null;
  removedMissingColumns: Set<string>;
};
const NETWORK_FAILURE_PATTERNS = ['failed to fetch', 'networkerror', 'network request failed'];
const AUTH_FAILURE_PATTERNS = ['not authenticated', 'jwt', 'invalid token'];
const describeFailure = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === 'object') {
    const { message, details, hint } = error as SupabaseErrorLike;
    return `${message ?? ''} ${details ?? ''} ${hint ?? ''}`;
  }
  return String(error ?? '');
};
const isBrowserOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;
const matchesAny = (text: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => text.includes(pattern));
const classifyKnownFailure = (text: string): CloudSaveFailure => {
  if (text.includes('rate limit')) return 'rate_limited';
  if (matchesAny(text, AUTH_FAILURE_PATTERNS)) return 'auth';
  return matchesAny(text, NETWORK_FAILURE_PATTERNS) ? 'offline' : 'unknown';
};
/** Distinguishes a known cause from an unknown one so recovery guidance stays truthful. */
export const classifyCloudSaveFailure = (error: unknown): CloudSaveFailure =>
  isBrowserOffline() ? 'offline' : classifyKnownFailure(describeFailure(error).toLowerCase());
const sameSaveStatus = (left: CloudSaveStatus, right: CloudSaveStatus): boolean =>
  left.state === right.state &&
  left.failure === right.failure &&
  left.retryAttempt === right.retryAttempt &&
  left.nextRetryAt === right.nextRetryAt;
/** An aborted write is worth one retry; every other failure is reported as-is. */
const wasWriteAborted = (attempt: SupabaseSyncAttempt): boolean =>
  !attempt.synced && attempt.error !== null && isAbortRequestError(attempt.error);
const countModeTasks = (mode: UserProgressData | undefined): number =>
  Object.keys(mode?.taskCompletions || {}).length;
const describeProgressPayload = (userData: SupabaseUserData) => ({
  gameMode: userData.current_game_mode,
  pvpLevel: userData.pvp_data?.level,
  pvpTasksCompleted: countModeTasks(userData.pvp_data),
  pveLevel: userData.pve_data?.level,
  pveTasksCompleted: countModeTasks(userData.pve_data),
});
export function useSupabaseSync<
  TState extends StateTree = StateTree,
  TPayload extends SupabaseSyncPayload = SupabaseSyncPayload,
>({
  store,
  table,
  transform,
  sync,
  debounceMs = 1000,
  onSynced,
  retryDelaysMs = [],
  reconcileBeforeRetry,
  onSaveStatusChange,
}: SupabaseSyncConfig<TState, TPayload>): SupabaseSyncReturn<TState, TPayload> {
  logger.debug(`[Sync] useSupabaseSync initialized for table: ${table}, debounce: ${debounceMs}ms`);
  const { $supabase } = useNuxtApp();
  const isSyncing = ref(false);
  const isPaused = ref(false);
  let snapshotDepth = 0;
  let lastSyncedHash: string | null = null;
  let pendingLocalChanges = false;
  let localVersion = 0;
  const pendingState = createPendingStateTracker(() => store.$state);
  let disposed = false;
  let syncQueue: Promise<TPayload | null> | null = null;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let nextRetryAt: number | null = null;
  let retriesExhausted = false;
  let lastFailure: CloudSaveFailure | null = null;
  const saveStatus = ref<CloudSaveStatus>({
    state: 'idle',
    failure: null,
    retryAttempt: 0,
    nextRetryAt: null,
  });
  const resolveSaveState = (): CloudSaveState => {
    if (!pendingLocalChanges) return 'idle';
    if (isSyncing.value) return 'saving';
    if (retryTimer) return 'retry_scheduled';
    return retriesExhausted ? 'failed' : 'pending';
  };
  const publishSaveStatus = () => {
    if (disposed) return;
    const state = resolveSaveState();
    const next: CloudSaveStatus = {
      state,
      failure: state === 'idle' ? null : lastFailure,
      retryAttempt,
      nextRetryAt,
    };
    if (sameSaveStatus(saveStatus.value, next)) return;
    saveStatus.value = next;
    onSaveStatusChange?.(next);
  };
  const clearRetryTimer = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    nextRetryAt = null;
  };
  const resetRetryBudget = () => {
    clearRetryTimer();
    retryAttempt = 0;
    retriesExhausted = false;
  };
  /** Transmission is gated while paused or while a remote snapshot is in flight. */
  const isSyncSuspended = (): boolean => isPaused.value || snapshotDepth > 0;
  const syncOwnerId = (): string | null => ($supabase.user.loggedIn ? $supabase.user.id : null);
  /**
   * The user id this write may be sent for, or `null` when it must be dropped.
   *
   * Sync is gated rather than queued: the next store change re-triggers it.
   */
  const resolveSyncOwner = (): string | null => {
    if (isSyncSuspended()) {
      logger.debug('[Sync] Skipping - sync is paused');
      return null;
    }
    const ownerId = syncOwnerId();
    if (!ownerId) logger.debug('[Sync] Skipping - user not logged in');
    return ownerId;
  };
  const canQueueSync = (): boolean => !disposed && !isSyncSuspended() && syncOwnerId() !== null;
  const logPayload = (dataToSave: TPayload) => {
    // Development-only diagnostics; production builds skip the payload walk.
    if (!import.meta.env.DEV) return;
    if (table !== 'user_progress') {
      logger.debug('[Sync] About to upsert to', table);
      return;
    }
    logger.debug(
      `[Sync] About to upsert to ${table}:`,
      describeProgressPayload(dataToSave as SupabaseUserData)
    );
  };
  const upsert = async (payload: Record<string, unknown>) =>
    sync ? sync(payload as TPayload) : $supabase.client.from(table).upsert(payload);
  const upsertWithFallback = async (
    payload: Record<string, unknown>
  ): Promise<SupabaseSyncAttempt> => {
    let payloadToSync: Record<string, unknown> | null = payload;
    let error: SupabaseErrorLike | null = null;
    let synced = false;
    const removedMissingColumns = new Set<string>();
    while (payloadToSync) {
      const { error: syncError } = await upsert(payloadToSync);
      if (!syncError) {
        synced = true;
        break;
      }
      error = syncError;
      if (!isMissingColumnError(syncError)) {
        break;
      }
      const missingColumn = getMissingColumnName(syncError);
      if (!missingColumn || removedMissingColumns.has(missingColumn)) {
        break;
      }
      const fallbackPayload = getFallbackPayload(payloadToSync, missingColumn);
      if (!fallbackPayload) {
        break;
      }
      removedMissingColumns.add(missingColumn);
      payloadToSync = fallbackPayload;
    }
    return { synced, error, removedMissingColumns };
  };
  /** A retry is only valid while the same signed-in user still owns this write. */
  const canRetryAbortedWrite = (ownerId: string): boolean =>
    !isPaused.value && $supabase.user.loggedIn && $supabase.user.id === ownerId && !disposed;
  const reportFailedWrite = (error: SupabaseErrorLike) => {
    if (isAbortRequestError(error)) {
      logger.warn(`[Sync] Sync to ${table} was aborted; retry did not succeed yet`, {
        ...formatSupabaseError(error),
        retryDelayMs: ABORT_RETRY_DELAY_MS,
      });
      return;
    }
    logger.error(`[Sync] Error syncing to ${table}:`, formatSupabaseError(error));
  };
  const reportWriteOutcome = (attempt: SupabaseSyncAttempt) => {
    if (attempt.synced) {
      if (attempt.removedMissingColumns.size) {
        logger.warn(
          `[Sync] ${table} fallback sync succeeded after removing missing columns: ${Array.from(attempt.removedMissingColumns).join(', ')}`
        );
      }
      return;
    }
    if (attempt.error) reportFailedWrite(attempt.error);
  };
  const writePayload = async (
    dataToSave: TPayload,
    ownerId: string
  ): Promise<SupabaseSyncAttempt> => {
    let attempt = await upsertWithFallback(dataToSave);
    if (wasWriteAborted(attempt) && !isPaused.value) {
      await delay(ABORT_RETRY_DELAY_MS);
      if (canRetryAbortedWrite(ownerId)) attempt = await upsertWithFallback(dataToSave);
    }
    reportWriteOutcome(attempt);
    return attempt;
  };
  const runScheduledRetry = () => {
    retryTimer = null;
    nextRetryAt = null;
    publishSaveStatus();
    void reconcileThenSync().catch((error) => {
      logger.error(`[Sync] Scheduled retry failed for ${table}:`, error);
    });
  };
  /** Transient failures get a bounded schedule; exhaustion keeps the changes pending. */
  const scheduleRetry = () => {
    if (disposed || retryTimer) return;
    const delayMs = retryDelaysMs[retryAttempt];
    if (delayMs === undefined) {
      retriesExhausted = true;
      return;
    }
    retryAttempt += 1;
    nextRetryAt = Date.now() + delayMs;
    retryTimer = setTimeout(runScheduledRetry, delayMs);
  };
  const handleWriteFailure = (error: unknown) => {
    lastFailure = classifyCloudSaveFailure(error);
    scheduleRetry();
  };
  const clearPendingVersion = (syncVersion: number) => {
    if (syncVersion !== localVersion) return;
    pendingLocalChanges = false;
    resetRetryBudget();
    lastFailure = null;
  };
  const buildSyncPayload = (transformedState: TPayload, ownerId: string): TPayload => {
    const dataToSave: TPayload = { ...transformedState };
    if (!dataToSave.user_id) dataToSave.user_id = ownerId;
    return dataToSave;
  };
  /**
   * A sign-out or teardown during the write means this payload no longer
   * describes the signed-in user, so it must not be acknowledged.
   */
  const canCommitWrite = (ownerId: string): boolean => !disposed && $supabase.user.id === ownerId;
  const commitSync = (currentHash: string, syncVersion: number, acknowledge: () => void) => {
    const recoveredFromFailure = lastFailure !== null;
    acknowledge();
    lastSyncedHash = currentHash;
    clearPendingVersion(syncVersion);
    resetRetryBudget();
    lastFailure = null;
    logger.debug(`[Sync] ✅ Successfully synced to ${table}`);
    onSynced?.();
    // Edits made during the recovering upload armed a retry that the reset above cleared.
    if (recoveredFromFailure) schedulePendingSync();
  };
  const writeAndCommit = async (
    dataToSave: TPayload,
    transformedState: TPayload,
    currentHash: string,
    syncVersion: number,
    acknowledge: () => void,
    ownerId: string
  ): Promise<TPayload | null> => {
    logPayload(dataToSave);
    const attempt = await writePayload(dataToSave, ownerId);
    if (!attempt.synced) {
      handleWriteFailure(attempt.error);
      return null;
    }
    if (canCommitWrite(ownerId)) commitSync(currentHash, syncVersion, acknowledge);
    return transformedState;
  };
  const runSyncToSupabase = async (
    transformedState: TPayload,
    syncVersion: number,
    acknowledge: () => void,
    ownerId: string
  ): Promise<TPayload | null> => {
    const dataToSave = buildSyncPayload(transformedState, ownerId);
    // Skip unchanged writes; this is what keeps egress down.
    const currentHash = hashState(dataToSave);
    if (currentHash === lastSyncedHash) {
      acknowledge();
      clearPendingVersion(syncVersion);
      logger.debug('[Sync] Skipping - data unchanged');
      return null;
    }
    return await writeAndCommit(
      dataToSave,
      transformedState,
      currentHash,
      syncVersion,
      acknowledge,
      ownerId
    );
  };
  const syncToSupabase = async (
    transformedState: TPayload | null,
    syncVersion: number,
    acknowledge: () => void
  ): Promise<TPayload | null> => {
    logger.debug('[Sync] syncToSupabase called', {
      loggedIn: $supabase.user.loggedIn,
      isPaused: isPaused.value,
    });
    const ownerId = resolveSyncOwner();
    if (!ownerId) return null;
    // Skip if transform returned null (e.g., during initial load)
    if (!transformedState) {
      logger.debug('[Sync] Skipping - transform returned null');
      return null;
    }
    isSyncing.value = true;
    publishSaveStatus();
    try {
      return await runSyncToSupabase(transformedState, syncVersion, acknowledge, ownerId);
    } catch (err) {
      logger.error('[Sync] Unexpected error:', err);
      handleWriteFailure(err);
      return null;
    } finally {
      isSyncing.value = false;
      publishSaveStatus();
    }
  };
  const capturePayload = (state: TState): TPayload | null => {
    try {
      const payload = transform ? transform(state) : (state as unknown as TPayload);
      if (!payload) return null;
      // Capture the JSON wire representation, not a clone of reactive references.
      const serializedPayload = JSON.stringify(payload);
      return JSON.parse(serializedPayload) as TPayload;
    } catch (error) {
      logger.error('[Sync] Unexpected error:', error);
      return null;
    }
  };
  const enqueueSync = (state = store.$state as TState): Promise<TPayload | null> => {
    // Capture each request before queuing: later mutations must not change an
    // earlier payload, and resumed writes must not overtake an in-flight save.
    if (!canQueueSync()) return Promise.resolve(null);
    const version = localVersion;
    const acknowledge = pendingState.captureAcknowledgement(snapshotSyncState(state));
    const snapshot = capturePayload(state);
    const ownerId = $supabase.user.id;
    const run = () => {
      if (disposed || $supabase.user.id !== ownerId) return Promise.resolve(null);
      return syncToSupabase(snapshot, version, acknowledge);
    };
    const result = syncQueue ? syncQueue.then(run, run) : run();
    syncQueue = result;
    void result.finally(() => {
      if (syncQueue === result) syncQueue = null;
    });
    return result;
  };
  const debouncedSync = debounce(enqueueSync, debounceMs);
  /** A retry uploads only after the latest remote state was merged into the pending changes. */
  const reconcileThenSync = async (): Promise<TPayload | null> => {
    try {
      await reconcileBeforeRetry?.();
    } catch (error) {
      logger.warn(`[Sync] Remote state unavailable before retrying ${table}`, error);
      handleWriteFailure(error);
      publishSaveStatus();
      return null;
    }
    return enqueueSync();
  };
  /**
   * After a failed write, Realtime may have missed remote updates, so only a reconciled retry
   * uploads. It captures the latest state when it runs, carrying every edit made meanwhile.
   */
  const defersToReconciledRetry = (): boolean =>
    lastFailure !== null && reconcileBeforeRetry !== undefined && retryDelaysMs.length > 0;
  /** A new edit restarts an exhausted schedule; merges inside a snapshot read do not. */
  const armReconciledRetry = () => {
    debouncedSync.cancel();
    if (retriesExhausted && snapshotDepth === 0) resetRetryBudget();
    scheduleRetry();
    publishSaveStatus();
  };
  const unsubscribe = store.$subscribe((_mutation, state) => {
    // Pausing gates transmission, not change tracking: a user can edit while
    // reconciliation is waiting to resume. The RPC suppresses unchanged writes.
    localVersion += 1;
    pendingLocalChanges = true;
    publishSaveStatus();
    if (defersToReconciledRetry()) {
      armReconciledRetry();
      return;
    }
    logger.debug(`[Sync] Store state changed for ${table}, triggering debounced sync`);
    void debouncedSync(state as TState).catch((error) => {
      if (isDebounceRejection(error)) return;
      logger.error(`[Sync] Debounced sync failed for ${table}:`, error);
    });
  });
  /** A manual retry restarts the bounded schedule; it never discards pending changes. */
  const retryNow = async (): Promise<boolean> => {
    if (!canQueueSync()) return false;
    resetRetryBudget();
    debouncedSync.cancel();
    publishSaveStatus();
    if (pendingLocalChanges) await reconcileThenSync();
    return !pendingLocalChanges;
  };
  const handleOnline = () => {
    if (pendingLocalChanges && !isSyncing.value) void retryNow();
  };
  const watchesConnectivity = retryDelaysMs.length > 0 && typeof window !== 'undefined';
  if (watchesConnectivity) window.addEventListener('online', handleOnline);
  const cleanup = () => {
    disposed = true;
    clearRetryTimer();
    debouncedSync.cancel();
    unsubscribe();
    if (watchesConnectivity) window.removeEventListener('online', handleOnline);
  };
  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }
  const pause = () => {
    logger.debug(`[Sync] Pausing sync for ${table}`);
    isPaused.value = true;
    debouncedSync.cancel();
  };
  /** Pending changes after a pause or snapshot read; a failed write re-arms its reconciled retry. */
  const schedulePendingSync = () => {
    if (disposed || !pendingLocalChanges) return;
    if (defersToReconciledRetry()) {
      scheduleRetry();
      publishSaveStatus();
      return;
    }
    void debouncedSync(store.$state as TState).catch((error) => {
      if (!isDebounceRejection(error)) logger.error('[Sync] Resumed sync failed', error);
    });
  };
  const resume = () => {
    logger.debug(`[Sync] Resuming sync for ${table}`);
    isPaused.value = false;
    schedulePendingSync();
  };
  const withSnapshot: WithRemoteSnapshot = async (read) => {
    snapshotDepth += 1;
    try {
      await syncQueue;
      return await read(pendingState.capture());
    } finally {
      snapshotDepth -= 1;
      schedulePendingSync();
    }
  };
  return {
    hasPendingChanges: () => pendingLocalChanges,
    captureRemoteMerge: pendingState.capture,
    withSnapshot,
    isSyncing,
    isPaused,
    saveStatus,
    retryNow,
    cleanup,
    pause,
    resume,
    syncToSupabase: (state) => {
      // Imperative saves can precede the subscription's first mutation.
      pendingLocalChanges = true;
      localVersion += 1;
      publishSaveStatus();
      return enqueueSync(state);
    },
  };
}
