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
  return { mode: row.game_mode, progress: row.progress_data as UserProgressData };
};
const normalizePersistenceError = (error: unknown): SupabaseError => ({
  code: getPersistenceErrorCode(error),
  message: getPersistenceErrorMessage(error),
});
export const syncProgressState = async (
  client: ProgressRpcClient,
  userId: string,
  state: UserState
): Promise<{ error: SupabaseError | null }> => {
  try {
    const payload = buildUpsertPayload(userId, state);
    return await client.rpc('sync_user_game_mode_progress', {
      p_current_game_mode: payload.current_game_mode,
      p_game_edition: payload.game_edition,
      p_tarkov_uid: payload.tarkov_uid,
      p_modes: {
        [GAME_MODES.PVP]: payload.pvp_data,
        [GAME_MODES.PVE]: payload.pve_data,
        [GAME_MODES.SEASONAL]: payload.seasonal_data,
      },
    });
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
export const loadModeProgress = async (
  client: ModeProgressClient,
  userId: string
): Promise<{
  data: Partial<Record<GameMode, UserProgressData>>;
  error: SupabaseError | null;
}> => {
  try {
    const { data: rows, error } = await client
      .from('user_game_mode_progress')
      .select('game_mode,season_number,progress_data')
      .eq('user_id', userId)
      .in('game_mode', GAME_MODE_VALUES)
      .in('season_number', [0, ACTIVE_SEASON_NUMBER]);
    if (error) return { data: {}, error };
    const entries = (rows ?? []).flatMap((row) => {
      const activeProgress = getActiveModeProgress(row);
      return activeProgress ? [[activeProgress.mode, activeProgress.progress] as const] : [];
    });
    const data = Object.fromEntries(entries) as Partial<Record<GameMode, UserProgressData>>;
    return { data, error: null };
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
