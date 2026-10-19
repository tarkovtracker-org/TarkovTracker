import { hasMaterializedProgress } from '@tarkovtracker/progress-contracts/modeProgress';
import {
  beginAcknowledgement,
  invalidateAcknowledgedModes,
  selectChangedModes,
  type ModeProgressMap,
  type ProgressSyncSnapshot,
} from '@/stores/tarkov/acknowledgedModes';
import { buildUpsertPayload } from '@/stores/tarkov/progressMerge';
import {
  ACTIVE_SEASON_NUMBER,
  GAME_MODES,
  GAME_MODE_VALUES,
  getGameModeSeasonNumber,
  isGameMode,
  type GameMode,
} from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  isProgressPayloadTooLarge,
  PROGRESS_SYNC_INTERRUPTED as SPLIT_SYNC_INTERRUPTED,
} from '@/utils/progressPayload';
import { reportProgressPayload } from '@/utils/progressPayloadDiagnostics';
import { isRecord, sanitizeTarkovUid } from '@/utils/progressSanitizers';
import type { UserProgressData, UserState } from '@/stores/progressState';
type SupabaseError = { code?: string; message: string };
export type ProgressRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ error: SupabaseError | null }>;
};
type ModeProgressRow = {
  game_mode: string;
  progress_data: unknown;
  season_number: number;
  progress_updated_at?: string | null;
};
type ModeProgressQuery = PromiseLike<{
  data: ModeProgressRow[] | null;
  error: SupabaseError | null;
}>;
type ModeProgressFilter = {
  in: (
    column: string,
    values: readonly (number | string)[]
  ) => ModeProgressFilter & ModeProgressQuery;
};
export type ModeProgressClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => ModeProgressFilter & ModeProgressQuery;
    };
  };
};
const isMissingProgressFreshness = (error: SupabaseError | null): boolean =>
  error !== null &&
  ['42703', 'PGRST204'].includes(error.code ?? '') &&
  /\bprogress_updated_at\b/.test(error.message);
/** Retry only the additive freshness column; all other read failures stay visible. */
export const readWithProgressFreshness = async <T extends { error: SupabaseError | null }>(
  read: (includeFreshness: boolean) => PromiseLike<T>,
  canContinue: () => boolean = () => true
): Promise<T> => {
  const result = await read(true);
  if (!canContinue()) return result;
  if (isMissingProgressFreshness(result.error)) {
    return await read(false);
  }
  return result;
};
const getPersistenceErrorCode = (error: unknown): string | undefined => {
  try {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
};
const getPersistenceErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const getActiveModeProgress = (
  row: ModeProgressRow
): { mode: GameMode; progress: UserProgressData } | null => {
  if (!isGameMode(row.game_mode)) return null;
  if (row.season_number !== getGameModeSeasonNumber(row.game_mode)) return null;
  if (!hasMaterializedProgress(row.progress_data)) return null;
  return { mode: row.game_mode, progress: row.progress_data as UserProgressData };
};
const normalizePersistenceError = (error: unknown): SupabaseError => ({
  code: getPersistenceErrorCode(error),
  message: getPersistenceErrorMessage(error),
});
export type ProgressSyncPayload = {
  current_game_mode: GameMode;
  game_edition: UserState['gameEdition'];
  tarkov_uid: number | null;
  pvp_data: UserProgressData;
  pve_data: UserProgressData;
  seasonal_data: UserProgressData;
};
/** Conservative wire threshold; JSONB storage differs. Large saves send one mode per request. */
const SINGLE_REQUEST_MODES_LIMIT = 256 * 1024;
const byteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;
const toModeBatches = (modes: ModeProgressMap): ModeProgressMap[] => {
  const entries = Object.entries(modes);
  if (entries.length < 2 || byteLength(modes) <= SINGLE_REQUEST_MODES_LIMIT) {
    return [modes];
  }
  return entries.map(([mode, progress]) => ({ [mode]: progress }));
};
type RejectedMode = { wire: string; error: unknown };
// One current owner per SDK client, at most three rejected snapshots. Never persisted or logged.
const rejectedPayloads = new WeakMap<object, { owner: string; modes: Map<string, RejectedMode> }>();
const rejectedModesFor = (client: object, owner: string): Map<string, RejectedMode> => {
  let rejected = rejectedPayloads.get(client);
  if (rejected?.owner !== owner) {
    rejected = { owner, modes: new Map() };
    rejectedPayloads.set(client, rejected);
  }
  return rejected.modes;
};
const rejectedBatch = (batch: ModeProgressMap, rejected: Map<string, RejectedMode>) => {
  for (const [mode, progress] of Object.entries(batch)) {
    const previous = rejected.get(mode);
    if (previous?.wire === JSON.stringify(progress)) return previous;
  }
};
type ProgressSyncResult<TError> = {
  error: TError | typeof SPLIT_SYNC_INTERRUPTED;
  tarkovUidConflict?: TarkovUidConflict;
};
type ProgressSyncClient<TError> = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data?: unknown; error: TError }>;
};
/** The sync RPC kept `storedUid` because another account already owns `rejectedUid`. */
type TarkovUidConflict = { rejectedUid: number; storedUid: number | null };
type TarkovUidConflictListener = (userId: string, conflict: TarkovUidConflict) => void;
const tarkovUidConflictListeners = new Set<TarkovUidConflictListener>();
export const onTarkovUidConflict = (listener: TarkovUidConflictListener): (() => void) => {
  tarkovUidConflictListeners.add(listener);
  return () => tarkovUidConflictListeners.delete(listener);
};
const reportTarkovUidConflict = (userId: string, data: unknown, rejectedUid: number | null) => {
  if (rejectedUid === null || !isRecord(data) || data.tarkov_uid_conflict !== true) return;
  const conflict = { rejectedUid, storedUid: sanitizeTarkovUid(data.tarkov_uid) };
  for (const listener of tarkovUidConflictListeners) listener(userId, conflict);
  return conflict;
};
type ProgressAcknowledgement = ReturnType<typeof beginAcknowledgement>;
/** Keep an outstanding account write ordered even across sign-out and same-account startup. */
const progressSyncQueues = new Map<string, Promise<void>>();
const enqueueProgressSync = <T>(userId: string, send: () => Promise<T>): Promise<T> => {
  const previous = progressSyncQueues.get(userId);
  const result = previous ? previous.then(send) : send();
  const settled = result.then(
    () => {},
    () => {}
  );
  progressSyncQueues.set(userId, settled);
  void settled.then(() => {
    if (progressSyncQueues.get(userId) === settled) progressSyncQueues.delete(userId);
  });
  return result;
};
type ProgressMutation<TResult> = {
  expected: ProgressSyncSnapshot;
  modes: ModeProgressMap;
  send: () => PromiseLike<TResult>;
  canContinue: () => boolean;
  onSuccess: () => void;
};
const sendProgressMutation = async <TResult extends { error: unknown }>(
  userId: string,
  mutation: ProgressMutation<TResult>,
  sync: ProgressAcknowledgement
): Promise<TResult | { error: typeof SPLIT_SYNC_INTERRUPTED }> => {
  const isCurrent = () => sync.isCurrent() && mutation.canContinue();
  if (!isCurrent()) return { error: SPLIT_SYNC_INTERRUPTED };
  invalidateAcknowledgedModes(userId, mutation.modes);
  let result: TResult;
  try {
    result = await mutation.send();
  } finally {
    invalidateAcknowledgedModes(userId, mutation.modes);
  }
  if (!mutation.canContinue()) return { error: SPLIT_SYNC_INTERRUPTED };
  if (result.error) return result;
  if (!sync.commit(mutation.modes)) return { error: SPLIT_SYNC_INTERRUPTED };
  mutation.onSuccess();
  return result;
};
/** Atomic progress RPCs supersede older splits and settle before later account writes. */
export const executeProgressMutation = <TResult extends { error: unknown }>(
  userId: string,
  mutation: ProgressMutation<TResult>
): Promise<TResult | { error: typeof SPLIT_SYNC_INTERRUPTED }> => {
  const sync = beginAcknowledgement(userId, mutation.expected);
  return enqueueProgressSync(userId, async () => {
    try {
      return await sendProgressMutation(userId, mutation, sync);
    } finally {
      sync.finish();
    }
  });
};
const sendModeBatch = async <TError>(
  client: ProgressSyncClient<TError>,
  userId: string,
  payload: ProgressSyncPayload,
  batch: ModeProgressMap,
  sync: ProgressAcknowledgement
): Promise<ProgressSyncResult<TError>> => {
  if (!sync.isCurrent()) return { error: SPLIT_SYNC_INTERRUPTED };
  sync.beginBatch();
  invalidateAcknowledgedModes(userId, batch);
  let result: { data?: unknown; error: TError };
  try {
    result = await client.rpc('sync_user_game_mode_progress', {
      p_current_game_mode: payload.current_game_mode,
      p_game_edition: payload.game_edition,
      p_seasonal_season_number: ACTIVE_SEASON_NUMBER,
      p_tarkov_uid: payload.tarkov_uid,
      p_modes: batch,
    });
  } finally {
    // Realtime or a fresh same-account startup may have seeded a baseline during the request.
    // An uncertain/stale result must not leave that copy looking acknowledged.
    invalidateAcknowledgedModes(userId, batch);
  }
  // A newer write may supersede this snapshot, but a reset ends its ownership entirely.
  const tarkovUidConflict = sync.isOwned()
    ? reportTarkovUidConflict(userId, result.data, payload.tarkov_uid)
    : undefined;
  if (tarkovUidConflict) {
    payload.tarkov_uid = tarkovUidConflict.storedUid;
  }
  if (isRecord(result.data) && Object.hasOwn(result.data, 'tarkov_uid')) {
    sync.acceptUid(sanitizeTarkovUid(result.data.tarkov_uid), result.data.metadata_write_id);
  }
  return sync.isCurrent() ? { ...result, tarkovUidConflict } : { error: SPLIT_SYNC_INTERRUPTED };
};
type BatchSync<TError> = {
  client: ProgressSyncClient<TError>;
  userId: string;
  payload: ProgressSyncPayload;
  sync: ProgressAcknowledgement;
  modes: ModeProgressMap;
  rejected: Map<string, RejectedMode>;
  batches: ModeProgressMap[];
  result: ProgressSyncResult<TError>;
  oversized?: ProgressSyncResult<TError>;
  metadataSaved: boolean;
  tarkovUidConflict?: TarkovUidConflict;
};
const singleModeBatches = (modes: ModeProgressMap): ModeProgressMap[] =>
  Object.entries(modes).map(([mode, progress]) => ({ [mode]: progress }));
const createBatchSync = <TError>(
  client: ProgressSyncClient<TError>,
  userId: string,
  payload: ProgressSyncPayload,
  sync: ProgressAcknowledgement
): BatchSync<TError> => {
  const modes = selectChangedModes(userId, {
    [GAME_MODES.PVP]: payload.pvp_data,
    [GAME_MODES.PVE]: payload.pve_data,
    [GAME_MODES.SEASONAL]: payload.seasonal_data,
  });
  // Omitted modes cannot be overwritten, so remote changes to them do not stop this sync.
  sync.scope(modes);
  const rejected = rejectedModesFor(client, userId);
  return {
    client,
    userId,
    payload,
    sync,
    modes,
    rejected,
    batches: rejectedBatch(modes, rejected) ? singleModeBatches(modes) : toModeBatches(modes),
    result: { error: SPLIT_SYNC_INTERRUPTED },
    metadataSaved: false,
  };
};
const readBatchResult = async <TError>(ctx: BatchSync<TError>, batch: ModeProgressMap) => {
  const previous = rejectedBatch(batch, ctx.rejected);
  if (previous) return { error: previous.error as TError };
  const result = await sendModeBatch(ctx.client, ctx.userId, ctx.payload, batch, ctx.sync);
  reportProgressPayload(ctx.modes, batch, result.error);
  return result;
};
const retainOversizedBatch = <TError>(ctx: BatchSync<TError>, batch: ModeProgressMap) => {
  if (Object.keys(batch).length > 1) {
    // JSONB overhead or an older database may reject a small combined wire payload.
    ctx.batches.push(...singleModeBatches(batch));
    return;
  }
  // A rejected aggregate does not condemn its modes; cache complete individual modes only.
  for (const [mode, progress] of Object.entries(batch)) {
    ctx.rejected.set(mode, { wire: JSON.stringify(progress), error: ctx.result.error });
  }
  ctx.oversized ??= ctx.result;
};
const acknowledgeBatch = <TError>(ctx: BatchSync<TError>, batch: ModeProgressMap) => {
  for (const mode of Object.keys(batch)) ctx.rejected.delete(mode);
  ctx.sync.acknowledge(batch);
  ctx.metadataSaved = true;
};
const applyBatchResult = <TError>(ctx: BatchSync<TError>, batch: ModeProgressMap): boolean => {
  if (!ctx.sync.isCurrent()) {
    ctx.result = { error: SPLIT_SYNC_INTERRUPTED };
    return false;
  }
  if (isProgressPayloadTooLarge(ctx.result.error)) {
    retainOversizedBatch(ctx, batch);
    return true;
  }
  if (ctx.result.error) return false;
  acknowledgeBatch(ctx, batch);
  return true;
};
const saveUnblockedMetadata = async <TError>(ctx: BatchSync<TError>) => {
  if (!ctx.oversized || ctx.metadataSaved) return null;
  // Rejected progress must not block metadata edits. The controller deduplicates unchanged
  // full payloads; direct/repair callers may persist metadata without resending a mode.
  return sendModeBatch(ctx.client, ctx.userId, ctx.payload, {}, ctx.sync);
};
const finishProgressBatches = async <TError>(ctx: BatchSync<TError>) => {
  const metadata = await saveUnblockedMetadata(ctx);
  if (metadata?.error) return metadata;
  return {
    ...(ctx.oversized ?? ctx.result),
    tarkovUidConflict: ctx.tarkovUidConflict ?? metadata?.tarkovUidConflict,
  };
};
const sendProgressBatches = async <TError>(
  client: ProgressSyncClient<TError>,
  userId: string,
  payload: ProgressSyncPayload,
  sync: ProgressAcknowledgement
): Promise<ProgressSyncResult<TError>> => {
  const ctx = createBatchSync(client, userId, payload, sync);
  for (const batch of ctx.batches) {
    ctx.result = await readBatchResult(ctx, batch);
    ctx.tarkovUidConflict ??= ctx.result.tarkovUidConflict;
    if (!applyBatchResult(ctx, batch)) return ctx.result;
  }
  return finishProgressBatches(ctx);
};
/**
 * Sends account metadata plus only the modes the server does not already hold; the RPC keeps
 * any omitted mode as stored. Acknowledged modes become the baseline for the next sync, so after
 * a failed or interrupted split only the unacknowledged modes are resent.
 */
export const sendProgressSync = async <TError>(
  client: ProgressSyncClient<TError>,
  userId: string,
  payload: ProgressSyncPayload
): Promise<ProgressSyncResult<TError>> => {
  const snapshot = JSON.parse(JSON.stringify(payload)) as ProgressSyncPayload;
  const sync = beginAcknowledgement(userId, {
    pvp: snapshot.pvp_data,
    pve: snapshot.pve_data,
    seasonal: snapshot.seasonal_data,
    currentGameMode: snapshot.current_game_mode,
    gameEdition: snapshot.game_edition,
    tarkovUid: snapshot.tarkov_uid,
  });
  return enqueueProgressSync(userId, async () => {
    try {
      return await sendProgressBatches(client, userId, snapshot, sync);
    } finally {
      sync.finish();
    }
  });
};
export const syncProgressState = async (
  client: ProgressRpcClient,
  userId: string,
  state: UserState
): Promise<ProgressSyncResult<SupabaseError | null>> => {
  try {
    return await sendProgressSync(client, userId, buildUpsertPayload(userId, state));
  } catch (error) {
    const normalizedError = normalizePersistenceError(error);
    logger.error(
      '[TarkovStore] Failed to sync progress',
      { action: 'syncProgressState', userId },
      error
    );
    return { error: normalizedError };
  }
};
const collectModeProgress = (
  rows: ModeProgressRow[]
): Partial<Record<GameMode, UserProgressData>> =>
  Object.fromEntries(
    rows.flatMap((row) => {
      const active = getActiveModeProgress(row);
      return active ? [[active.mode, active.progress] as const] : [];
    })
  ) as Partial<Record<GameMode, UserProgressData>>;
const collectModeTimestamps = (rows: ModeProgressRow[]): Partial<Record<GameMode, number>> =>
  Object.fromEntries(
    rows.flatMap((row) => {
      const active = getActiveModeProgress(row);
      const timestamp = Date.parse(row.progress_updated_at ?? '');
      return active && Number.isFinite(timestamp) ? [[active.mode, timestamp]] : [];
    })
  ) as Partial<Record<GameMode, number>>;
/**
 * The account-level clock is the newest per-mode clock, so a mode that predates
 * the freshness column does not make the whole account look stale.
 */
const latestModeTimestamp = (byMode: Partial<Record<GameMode, number>>): number | undefined => {
  const timestamps = Object.values(byMode);
  return timestamps.length > 0 ? Math.max(...timestamps) : undefined;
};
export const loadModeProgress = async (
  client: ModeProgressClient,
  userId: string,
  canContinue: () => boolean = () => true
): Promise<{
  data: Partial<Record<GameMode, UserProgressData>>;
  updatedAt?: number;
  updatedAtByMode?: Partial<Record<GameMode, number>>;
  error: SupabaseError | null;
}> => {
  try {
    const { data: rows, error } = await readWithProgressFreshness(
      (includeFreshness) =>
        client
          .from('user_game_mode_progress')
          .select(
            includeFreshness
              ? 'game_mode,season_number,progress_data,progress_updated_at'
              : 'game_mode,season_number,progress_data'
          )
          .eq('user_id', userId)
          .in('game_mode', GAME_MODE_VALUES)
          .in('season_number', [0, ACTIVE_SEASON_NUMBER]),
      canContinue
    );
    if (error) return { data: {}, error };
    const loadedRows = rows ?? [];
    const updatedAtByMode = collectModeTimestamps(loadedRows);
    return {
      data: collectModeProgress(loadedRows),
      error: null,
      updatedAtByMode,
      updatedAt: latestModeTimestamp(updatedAtByMode),
    };
  } catch (error) {
    const normalizedError = normalizePersistenceError(error);
    logger.error(
      '[TarkovStore] Failed to load mode progress',
      { action: 'loadModeProgress', userId },
      error
    );
    return { data: {}, error: normalizedError };
  }
};
