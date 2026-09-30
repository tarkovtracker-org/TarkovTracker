import {
  beginAcknowledgement,
  invalidateAcknowledgedModes,
  selectChangedModes,
  type ModeProgressMap,
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
import { hasMaterializedProgress } from '@/utils/modeProgressFallback';
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
/** Half the RPC's 512 KiB `p_modes` cap; a larger multi-mode sync sends one mode per request. */
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
/** Unsent modes stay pending, so the controller reconciles and retries instead of acknowledging. */
const SPLIT_SYNC_INTERRUPTED = { message: 'Progress sync superseded by newer state' };
type ProgressSyncResult<TError> = { error: TError | typeof SPLIT_SYNC_INTERRUPTED };
type ProgressSyncClient<TError> = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: TError }>;
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
const sendModeBatch = async <TError>(
  client: ProgressSyncClient<TError>,
  userId: string,
  payload: ProgressSyncPayload,
  batch: ModeProgressMap,
  sync: ProgressAcknowledgement
): Promise<ProgressSyncResult<TError>> => {
  if (!sync.isCurrent()) return { error: SPLIT_SYNC_INTERRUPTED };
  invalidateAcknowledgedModes(userId, batch);
  let result: { error: TError };
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
  return sync.isCurrent() ? result : { error: SPLIT_SYNC_INTERRUPTED };
};
const sendProgressBatches = async <TError>(
  client: ProgressSyncClient<TError>,
  userId: string,
  payload: ProgressSyncPayload,
  sync: ProgressAcknowledgement
): Promise<ProgressSyncResult<TError>> => {
  const modes = selectChangedModes(userId, {
    [GAME_MODES.PVP]: payload.pvp_data,
    [GAME_MODES.PVE]: payload.pve_data,
    [GAME_MODES.SEASONAL]: payload.seasonal_data,
  });
  let result: ProgressSyncResult<TError> = { error: SPLIT_SYNC_INTERRUPTED };
  for (const batch of toModeBatches(modes)) {
    result = await sendModeBatch(client, userId, payload, batch, sync);
    if (!sync.isCurrent()) return { error: SPLIT_SYNC_INTERRUPTED };
    if (result.error) return result;
    sync.acknowledge(batch);
  }
  return result;
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
): Promise<{ error: SupabaseError | null }> => {
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
