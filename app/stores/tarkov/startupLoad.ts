import { defaultState, type UserProgressData, type UserState } from '@/stores/progressState';
import {
  blockAccountRecoveryRetentionForOwner,
  preserveForeignActiveCopy,
} from '@/stores/tarkov/accountRecovery';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import {
  clearActiveProgressStorage,
  cloneStateSnapshot,
  patchStoreState,
  persistActiveProgressValue,
  progressStorageSerializer,
  readPersistedProgressState,
  safeGetItem,
  setActiveProgressWritesBlocked,
  type PersistedProgressSnapshot,
} from '@/stores/tarkov/localStorage';
import {
  coerceGameMode,
  hasProgress,
  hasRetainableModeProgress,
  toProgressEpoch,
} from '@/stores/tarkov/progressMerge';
import {
  loadModeProgress,
  syncProgressState,
  type ModeProgressClient,
} from '@/stores/tarkov/progressPersistence';
import { getStoryProgressScore, resolveInitialSyncState } from '@/stores/tarkov/resetEngine';
import { saveSupersededProgressCopy } from '@/stores/tarkov/supersededProgress';
import { recordLocalSyncTime } from '@/stores/tarkov/syncTimeline';
import { delay } from '@/utils/async';
import { GAME_MODES, GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { hasMaterializedProgress } from '@/utils/modeProgressFallback';
import {
  hasDeprecatedTarkovDevProfileData,
  sanitizeGameEdition,
  sanitizeOwnedUserState,
  sanitizeTarkovUid,
} from '@/utils/progressSanitizers';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
import type { LocalIgnoredReason } from '@/composables/useToastI18n';
import type { StartupOwnershipGuard } from '@/stores/tarkov/startupOwnership';
import type { SupabaseUser } from '@/types/supabase-plugin';
import type { SupabaseClient } from '@supabase/supabase-js';
const ISSUE_71_ACCOUNT_AGE_THRESHOLD_MS = 5000;
const LOAD_RETRY_COUNT = 3;
const LOAD_RETRY_DELAY_MS = 500;
const NO_ROWS_ERROR_CODE = 'PGRST116';
export type StartupLoadResult = {
  hadRemoteData: boolean;
  /** Local progress was uploaded to an account with no cloud record. */
  migratedLocalState: boolean;
  needsRemoteCleanup: boolean;
  ok: boolean;
};
type ProgressStore = { $state: UserState; $patch(mutator: (state: UserState) => void): void };
export type StartupLoadContext = {
  store: ProgressStore;
  client: SupabaseClient;
  userId: string;
  account: Pick<SupabaseUser, 'createdAt' | 'providers'>;
  isCurrent: StartupOwnershipGuard;
  preservedSnapshot: PersistedProgressSnapshot | null;
  notifyLocalIgnored: (reason: LocalIgnoredReason) => void;
  showLoadFailed: () => void;
};
type UserProgressRow = {
  current_game_mode: string | null;
  game_edition: number | null;
  tarkov_uid: number | null;
  pvp_data?: UserProgressData | null;
  pve_data?: UserProgressData | null;
  updated_at: string | null;
};
type QueryError = { code?: string; message?: string } | null;
type LocalMeta = {
  storedUserId: string | null;
  timestamp: number | null;
  metadataTimestamp?: number;
  modeTimestamps?: Partial<Record<GameMode, number>>;
} | null;
type LocalProgress = {
  meta: LocalMeta;
  state: UserState;
  hasProgress: boolean;
  shouldPersistSanitized: boolean;
};
type ModeProgressResult = Awaited<ReturnType<typeof loadModeProgress>>;
type RemoteProgress = {
  row: UserProgressRow | null;
  modes: ModeProgressResult;
  state: UserState;
};
type Resolution = { state: UserState | null; needsRemoteCleanup: boolean; migrated?: boolean };
const FAILED: StartupLoadResult = {
  hadRemoteData: false,
  migratedLocalState: false,
  needsRemoteCleanup: false,
  ok: false,
};
/** Thrown when a newer startup or auth change supersedes this one; never an active failure. */
class StartupSuperseded extends Error {}
const ensureCurrent = (ctx: StartupLoadContext): void => {
  if (!ctx.isCurrent()) throw new StartupSuperseded();
};
const assignProgress = (store: ProgressStore, next: UserState): void =>
  store.$patch((state) => {
    state.currentGameMode = next.currentGameMode;
    state.gameEdition = next.gameEdition;
    state.tarkovUid = next.tarkovUid;
    state.pvp = next.pvp;
    state.pve = next.pve;
    state.seasonal = next.seasonal;
  });
const resetStoreToDefault = (store: ProgressStore): void =>
  assignProgress(store, structuredClone(defaultState));
const readLocalMeta = (preserved: PersistedProgressSnapshot | null): LocalMeta => {
  if (preserved) {
    const { storedUserId, timestamp, metadataTimestamp, modeTimestamps } = preserved;
    return { storedUserId, timestamp, metadataTimestamp, modeTimestamps };
  }
  if (typeof window === 'undefined') return null;
  const raw = safeGetItem(STORAGE_KEYS.progress);
  if (!raw) return null;
  try {
    const parsed = parseUserScopedStorage<UserState>(raw);
    if (!parsed) return { storedUserId: null, timestamp: null };
    return {
      storedUserId: parsed._userId,
      timestamp: parsed._timestamp ?? null,
      metadataTimestamp: parsed._metadataTimestamp,
      modeTimestamps: parsed._modeTimestamps,
    };
  } catch {
    return null;
  }
};
/** Resets the serializer baseline; callers must do this before patching the persisted store. */
const adoptSnapshot = (
  local: LocalProgress,
  snapshot: PersistedProgressSnapshot,
  state: UserState
): LocalProgress => {
  progressStorageSerializer.reset(snapshot);
  return {
    ...local,
    state,
    hasProgress: hasProgress(state),
    shouldPersistSanitized: local.shouldPersistSanitized || snapshot.hadDeprecatedProgressData,
  };
};
const patchIfChanged = (store: ProgressStore, state: UserState): void => {
  if (!deepEqual(state, store.$state)) patchStoreState(store, state);
};
const adoptPreservedSnapshot = (
  ctx: StartupLoadContext,
  local: LocalProgress,
  snapshot: PersistedProgressSnapshot
): LocalProgress => {
  const adopted = adoptSnapshot(local, snapshot, sanitizeOwnedUserState(snapshot.state));
  patchIfChanged(ctx.store, adopted.state);
  return adopted;
};
/** Guest progress or this user's own; the current user's scoped copy wins over a guest copy. */
const readAdoptablePersisted = (ctx: StartupLoadContext, storedUserId: string | null) => {
  if (storedUserId !== ctx.userId && storedUserId !== null) return null;
  const own = readPersistedProgressState(ctx.userId);
  return own ?? (storedUserId === null ? readPersistedProgressState(null) : null);
};
const adoptPersistedProgress = (ctx: StartupLoadContext, local: LocalProgress): LocalProgress => {
  if (local.hasProgress) return local;
  const persisted = readAdoptablePersisted(ctx, local.meta?.storedUserId ?? null);
  if (!persisted) return local;
  const adopted = adoptSnapshot(local, persisted, persisted.state);
  if (adopted.hasProgress) patchStoreState(ctx.store, adopted.state);
  return adopted;
};
/** Adopt the snapshot preserved across an auth handoff, else this user's persisted progress. */
const adoptStoredProgress = (ctx: StartupLoadContext, local: LocalProgress): LocalProgress =>
  ctx.preservedSnapshot
    ? adoptPreservedSnapshot(ctx, local, ctx.preservedSnapshot)
    : adoptPersistedProgress(ctx, local);
/** Returns false when another account's active copy could not be retained as its recovery copy. */
const discardForeignProgress = (ctx: StartupLoadContext, storedUserId: string | null): boolean => {
  if (!storedUserId || storedUserId === ctx.userId) return true;
  logger.warn('[TarkovStore] Local progress belongs to a different user; retaining it');
  if (!preserveForeignActiveCopy(ctx.userId)) {
    setActiveProgressWritesBlocked(true);
    return false;
  }
  setActiveProgressWritesBlocked(false);
  clearActiveProgressStorage();
  resetStoreToDefault(ctx.store);
  ctx.notifyLocalIgnored('other_account');
  return true;
};
const discardUnpersistedProgress = (
  ctx: StartupLoadContext,
  local: LocalProgress
): LocalProgress => {
  if (!local.hasProgress || local.meta) return local;
  logger.warn('[TarkovStore] Local progress exists in memory without persistence; resetting');
  resetStoreToDefault(ctx.store);
  ctx.notifyLocalIgnored('unsaved');
  return { ...local, state: ctx.store.$state, hasProgress: hasProgress(ctx.store.$state) };
};
const resolveLocalProgress = (ctx: StartupLoadContext): LocalProgress | null => {
  const meta = readLocalMeta(ctx.preservedSnapshot);
  const shouldPersistSanitized = hasDeprecatedTarkovDevProfileData(ctx.store.$state);
  if (!discardForeignProgress(ctx, meta?.storedUserId ?? null)) return null;
  const state = sanitizeOwnedUserState(ctx.store.$state);
  patchIfChanged(ctx.store, state);
  const local = { meta, state, hasProgress: hasProgress(state), shouldPersistSanitized };
  return discardUnpersistedProgress(ctx, adoptStoredProgress(ctx, local));
};
const retryLoad = async <T>(
  ctx: StartupLoadContext,
  load: () => PromiseLike<T>,
  shouldRetry: (result: T) => boolean,
  retryLabel = 'Retry attempt'
): Promise<T> => {
  let result = await load();
  ensureCurrent(ctx);
  for (let attempt = 1; attempt < LOAD_RETRY_COUNT && shouldRetry(result); attempt++) {
    logger.debug(`[TarkovStore] ${retryLabel} ${attempt + 1}/${LOAD_RETRY_COUNT}`);
    await delay(LOAD_RETRY_DELAY_MS);
    ensureCurrent(ctx);
    result = await load();
    ensureCurrent(ctx);
  }
  return result;
};
const isRealError = (error: QueryError): boolean =>
  Boolean(error) && error?.code !== NO_ROWS_ERROR_CODE;
const hasError = (result: { error: unknown }): boolean => Boolean(result.error);
const selectAccountRow = (ctx: StartupLoadContext, columns: string) =>
  ctx.client.from('user_progress').select(columns).eq('user_id', ctx.userId).single();
/** Account metadata row; a missing row ("no rows") is retried to ride out signup races. */
const fetchAccountRow = async (ctx: StartupLoadContext) => {
  const result = await retryLoad(
    ctx,
    () => selectAccountRow(ctx, 'user_id,current_game_mode,game_edition,tarkov_uid,updated_at'),
    (row) => !row.data && !isRealError(row.error as QueryError)
  );
  const error = result.error as QueryError;
  logger.debug('[TarkovStore] Supabase query result:', {
    hasData: !!result.data,
    error: error?.code ?? null,
    errorMessage: error?.message ?? null,
  });
  return { row: result.data as unknown as UserProgressRow | null, error };
};
const fetchModeProgress = (ctx: StartupLoadContext) =>
  retryLoad(
    ctx,
    () => loadModeProgress(ctx.client as unknown as ModeProgressClient, ctx.userId, ctx.isCurrent),
    hasError,
    'Retrying normalized mode progress load'
  );
/** Read legacy account-row payloads only for modes without normalized progress. */
const withLegacyPayloads = async (
  ctx: StartupLoadContext,
  row: UserProgressRow,
  modes: ModeProgressResult
): Promise<UserProgressRow | null> => {
  const missing = (['pvp', 'pve'] as const)
    .filter((mode) => modes.data[mode] == null)
    .map((mode) => `${mode}_data`);
  if (missing.length === 0) return row;
  const legacy = await retryLoad(ctx, () => selectAccountRow(ctx, missing.join(',')), hasError);
  if (legacy.error) return null;
  return { ...row, ...(legacy.data as unknown as Partial<UserProgressRow>) };
};
const remoteModePayloads = (row: UserProgressRow | null, modes: ModeProgressResult) => ({
  pvp: modes.data.pvp ?? row?.pvp_data,
  pve: modes.data.pve ?? row?.pve_data,
  seasonal: modes.data.seasonal,
});
const toRemoteState = (
  row: UserProgressRow | null,
  modes: ModeProgressResult
): UserState | null => {
  if (!row && Object.keys(modes.data).length === 0) return null;
  return sanitizeOwnedUserState({
    currentGameMode: coerceGameMode(row?.current_game_mode),
    gameEdition: sanitizeGameEdition(row?.game_edition),
    tarkovUid: sanitizeTarkovUid(row?.tarkov_uid),
    ...remoteModePayloads(row, modes),
  } as UserState);
};
type RemoteLoad =
  { ok: false } | { ok: true; hadRemoteData: boolean; remote: RemoteProgress | null };
const loadRemoteProgress = async (ctx: StartupLoadContext): Promise<RemoteLoad> => {
  const account = await fetchAccountRow(ctx);
  if (isRealError(account.error)) {
    logger.error('[TarkovStore] Error loading data from Supabase:', account.error);
    return { ok: false };
  }
  const modes = await fetchModeProgress(ctx);
  if (modes.error) {
    logger.error('[TarkovStore] Could not load normalized mode progress', modes.error);
    return { ok: false };
  }
  const row = account.row ? await withLegacyPayloads(ctx, account.row, modes) : null;
  if (account.row && !row) return { ok: false };
  const state = toRemoteState(row, modes);
  return { ok: true, hadRemoteData: Boolean(account.row), remote: state && { row, modes, state } };
};
const progressScore = (state: UserState): number =>
  GAME_MODE_VALUES.reduce((score, mode) => score + modeScore(state[mode]), 0);
const modeScore = (mode: UserProgressData | undefined): number => {
  if (!mode) return 0;
  const counted = [
    mode.taskCompletions,
    mode.taskObjectives,
    mode.hideoutModules,
    mode.hideoutParts,
  ];
  return (
    counted.reduce((sum, entries) => sum + Object.keys(entries || {}).length, 0) +
    getStoryProgressScore(mode) +
    (mode.level > 1 ? 1 : 0) +
    (mode.prestigeLevel || 0)
  );
};
const accountUpdatedAt = (row: UserProgressRow | null): number =>
  row?.updated_at ? Date.parse(row.updated_at) : 0;
/**
 * Account metadata and each mode have independent freshness. Only a payload actually read from
 * the legacy account row inherits that row's clock; a historical normalized row stays unknown.
 */
const remoteFreshness = ({ row, modes }: RemoteProgress) => {
  const updatedAt = accountUpdatedAt(row);
  const metadataUpdatedAt = Number.isFinite(updatedAt) ? updatedAt || null : null;
  const byMode = { ...modes.updatedAtByMode };
  for (const mode of ['pvp', 'pve'] as const) {
    const fromLegacyRow =
      modes.data[mode] == null && hasMaterializedProgress(row?.[`${mode}_data`]);
    if (metadataUpdatedAt !== null && fromLegacyRow) byMode[mode] = metadataUpdatedAt;
  }
  return { metadataUpdatedAt, byMode };
};
const perMode = <T>(read: (mode: GameMode) => T): Record<GameMode, T> =>
  Object.fromEntries(GAME_MODE_VALUES.map((mode) => [mode, read(mode)])) as Record<GameMode, T>;
const acceptRemote = (
  ctx: StartupLoadContext,
  remote: RemoteProgress,
  state: UserState,
  next: UserState
): void => {
  const freshness = remoteFreshness(remote);
  progressStorageSerializer.acceptRemote({
    state,
    userId: ctx.userId,
    remote: remote.state,
    metadataTimestamp: freshness.metadataUpdatedAt ?? 0,
    next,
    updatedAtByMode: perMode((mode) => freshness.byMode[mode] ?? 0),
  });
};
const logStartupMerge = (local: UserState, remote: UserState): void =>
  logger.warn('[TarkovStore] Startup sync merged local and remote progress', {
    localPveEpoch: toProgressEpoch(local.pve),
    localPvpEpoch: toProgressEpoch(local.pvp),
    localSeasonalEpoch: toProgressEpoch(local.seasonal),
    localScore: progressScore(local),
    remotePveEpoch: toProgressEpoch(remote.pve),
    remotePvpEpoch: toProgressEpoch(remote.pvp),
    remoteSeasonalEpoch: toProgressEpoch(remote.seasonal),
    remoteScore: progressScore(remote),
  });
const upload = async (ctx: StartupLoadContext, state: UserState, failure: string) => {
  recordLocalSyncTime();
  const { error } = await syncProgressState(ctx.client, ctx.userId, state);
  ensureCurrent(ctx);
  if (error) logger.error(failure, error);
  return !error;
};
const resolveAgainstRemote = (local: LocalProgress, remote: RemoteProgress): UserState => {
  const freshness = remoteFreshness(remote);
  const localTimestamp = local.meta?.timestamp ?? null;
  return resolveInitialSyncState(
    local.state,
    remote.state,
    local.meta?.metadataTimestamp ?? localTimestamp,
    freshness.metadataUpdatedAt,
    progressScore(local.state),
    progressScore(remote.state),
    {
      mergeModeSnapshots: (remote.modes.updatedAt ?? 0) > (accountUpdatedAt(remote.row) || 0),
      modeUpdatedAt: freshness.byMode,
      localModeTimestamps: perMode(
        (mode) => local.meta?.modeTimestamps?.[mode] ?? localTimestamp ?? 0
      ),
    }
  );
};
const wasDisplacedByRemote = (
  mode: GameMode,
  local: UserState,
  remote: UserState,
  resolved: UserState
): boolean =>
  hasRetainableModeProgress(local[mode]) &&
  toProgressEpoch(remote[mode]) > toProgressEpoch(local[mode]) &&
  toProgressEpoch(resolved[mode]) === toProgressEpoch(remote[mode]);
const archiveModeCopy = (userId: string, local: UserState, mode: GameMode): boolean => {
  const seasonNumber = mode === GAME_MODES.SEASONAL ? (local.seasonalSeasonNumber ?? null) : null;
  if (saveSupersededProgressCopy(userId, mode, seasonNumber, cloneStateSnapshot(local[mode]))) {
    return true;
  }
  blockAccountRecoveryRetentionForOwner(userId);
  setActiveProgressWritesBlocked(true);
  logger.error('[TarkovStore] Could not retain progress displaced by a remote reset', { mode });
  return false;
};
/** Keep a copy of each local mode a newer remote reset replaced; false blocks the startup. */
const archiveDisplacedProgress = (
  userId: string,
  local: UserState,
  remote: UserState,
  resolved: UserState
): boolean =>
  GAME_MODE_VALUES.filter((mode) => wasDisplacedByRemote(mode, local, remote, resolved)).every(
    (mode) => archiveModeCopy(userId, local, mode)
  );
const remoteHadDeprecatedData = (remote: RemoteProgress): boolean =>
  hasDeprecatedTarkovDevProfileData(remoteModePayloads(remote.row, remote.modes));
/** Merge this user's own local progress with remote; upload when the result differs. */
const mergeWithRemote = async (
  ctx: StartupLoadContext,
  local: LocalProgress,
  remote: RemoteProgress
): Promise<Resolution | null> => {
  const resolved = resolveAgainstRemote(local, remote);
  if (!archiveDisplacedProgress(ctx.userId, local.state, remote.state, resolved)) return null;
  let needsRemoteCleanup = remoteHadDeprecatedData(remote);
  if (deepEqual(resolved, remote.state)) {
    logger.debug('[TarkovStore] Startup sync resolved to existing remote state');
  } else {
    logStartupMerge(local.state, remote.state);
    const failure = '[TarkovStore] Error syncing merged progress to Supabase:';
    if (!(await upload(ctx, resolved, failure))) return null;
    needsRemoteCleanup = false;
  }
  acceptRemote(ctx, remote, local.state, resolved);
  if (!deepEqual(resolved, local.state)) assignProgress(ctx.store, resolved);
  return { state: resolved, needsRemoteCleanup };
};
const adoptRemote = (ctx: StartupLoadContext, remote: RemoteProgress): Resolution => {
  logger.debug('[TarkovStore] Loading data from Supabase (user exists in DB)');
  acceptRemote(ctx, remote, ctx.store.$state, remote.state);
  const next = remote.state;
  ctx.store.$patch((state) => {
    state.currentGameMode = next.currentGameMode ?? state.currentGameMode;
    state.gameEdition = next.gameEdition ?? state.gameEdition;
    if (Object.prototype.hasOwnProperty.call(next, 'tarkovUid')) state.tarkovUid = next.tarkovUid;
    state.pvp = next.pvp ?? state.pvp;
    state.pve = next.pve ?? state.pve;
    state.seasonal = next.seasonal ?? state.seasonal;
  });
  return { state: next, needsRemoteCleanup: remoteHadDeprecatedData(remote) };
};
const resolveWithRemote = async (
  ctx: StartupLoadContext,
  local: LocalProgress,
  remote: RemoteProgress
): Promise<Resolution | null> => {
  const storedUserId = local.meta?.storedUserId ?? null;
  if (local.hasProgress && storedUserId === null) ctx.notifyLocalIgnored('guest');
  if (local.hasProgress && storedUserId === ctx.userId) {
    return mergeWithRemote(ctx, local, remote);
  }
  return adoptRemote(ctx, remote);
};
/** No remote record, but persisted local progress exists: migrate it to Supabase. */
const uploadLocalProgress = async (
  ctx: StartupLoadContext,
  local: LocalProgress
): Promise<Resolution | null> => {
  logger.debug('[TarkovStore] Migrating localStorage data to Supabase');
  const failure = '[TarkovStore] Error migrating local data to Supabase:';
  if (!(await upload(ctx, local.state, failure))) return null;
  logger.debug('[TarkovStore] Migration complete');
  return { state: local.state, needsRemoteCleanup: false, migrated: true };
};
/**
 * Issue #71: linking a second OAuth provider can race into a false "no data" read. A
 * multi-provider account with no progress must never be treated as new, or it would overwrite.
 */
const acceptNewUser = (ctx: StartupLoadContext): Resolution | null => {
  const createdAt = ctx.account.createdAt;
  const accountAgeMs = createdAt ? Date.now() - Date.parse(createdAt) : 0;
  const linkedProviders = ctx.account.providers || [];
  if (linkedProviders.length > 1) {
    logger.error(
      '[TarkovStore] SAFETY ABORT: Multi-provider account with no progress data (Issue #71)',
      {
        accountAgeMs,
        isRecentlyCreated: accountAgeMs < ISSUE_71_ACCOUNT_AGE_THRESHOLD_MS,
        linkedProviders,
        hasMultipleProviders: true,
        userId: ctx.userId,
      }
    );
    resetStoreToDefault(ctx.store);
    ctx.showLoadFailed();
    return null;
  }
  logger.debug('[TarkovStore] New user - no existing progress found', {
    accountAgeMs,
    linkedProviders,
  });
  return { state: null, needsRemoteCleanup: false };
};
const resolveStartupProgress = (
  ctx: StartupLoadContext,
  local: LocalProgress,
  remote: RemoteProgress | null
): Promise<Resolution | null> | Resolution | null => {
  if (remote) return resolveWithRemote(ctx, local, remote);
  if (local.hasProgress && local.meta) return uploadLocalProgress(ctx, local);
  return acceptNewUser(ctx);
};
const persistLocalOwnership = (
  ctx: StartupLoadContext,
  state: UserState,
  timestamp: number | null
) => {
  if (typeof window === 'undefined') return;
  const serialized = progressStorageSerializer.serialize(
    cloneStateSnapshot(sanitizeOwnedUserState(state)),
    ctx.userId,
    timestamp ?? Date.now()
  );
  if (!persistActiveProgressValue(serialized)) {
    logger.warn('[TarkovStore] Could not persist local ownership metadata');
  }
};
const needsOwnershipPersist = (local: LocalProgress, resolved: UserState | null): boolean => {
  if (!local.meta) return false;
  return local.shouldPersistSanitized || (local.meta.storedUserId === null && resolved !== null);
};
const loadStartupProgress = async (ctx: StartupLoadContext): Promise<StartupLoadResult> => {
  const local = resolveLocalProgress(ctx);
  if (!local) return FAILED;
  logger.debug('[TarkovStore] Initial load starting...', {
    userId: ctx.userId,
    hasLocalProgress: local.hasProgress,
  });
  const loaded = await loadRemoteProgress(ctx);
  if (!loaded.ok) return FAILED;
  const resolution = await resolveStartupProgress(ctx, local, loaded.remote);
  if (!resolution) return FAILED;
  if (needsOwnershipPersist(local, resolution.state)) {
    persistLocalOwnership(ctx, resolution.state ?? local.state, local.meta?.timestamp ?? null);
  }
  logger.debug('[TarkovStore] Initial load complete');
  return {
    hadRemoteData: loaded.hadRemoteData,
    migratedLocalState: resolution.migrated === true,
    needsRemoteCleanup: resolution.needsRemoteCleanup,
    ok: true,
  };
};
/**
 * Load, reconcile, and persist startup progress before sync starts, so an empty local state can
 * never overwrite server data. A superseded startup resolves as not-ok; callers re-check ownership.
 */
export async function loadInitialProgress(ctx: StartupLoadContext): Promise<StartupLoadResult> {
  try {
    return await loadStartupProgress(ctx);
  } catch (error) {
    if (error instanceof StartupSuperseded) return FAILED;
    throw error;
  }
}
