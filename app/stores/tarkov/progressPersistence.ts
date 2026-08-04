import { buildUpsertPayload } from '@/stores/tarkov/progressMerge';
import { ACTIVE_SEASON_NUMBER, GAME_MODES, type GameMode } from '@/utils/constants';
import type { UserProgressData, UserState } from '@/stores/progressState';
type SupabaseError = { code?: string; message: string };
export type ProgressRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ error: SupabaseError | null }>;
};
type ModeProgressQuery = PromiseLike<{
  data: Array<{
    game_mode: string;
    progress_data: unknown;
    season_number: number;
  }> | null;
  error: SupabaseError | null;
}>;
export type ModeProgressClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => ModeProgressQuery;
    };
  };
};
export const syncProgressState = async (
  client: ProgressRpcClient,
  userId: string,
  state: UserState
): Promise<{ error: SupabaseError | null }> => {
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
};
export const loadModeProgress = async (
  client: ModeProgressClient,
  userId: string
): Promise<{
  data: Partial<Record<GameMode, UserProgressData>>;
  error: SupabaseError | null;
}> => {
  const { data: rows, error } = await client
    .from('user_game_mode_progress')
    .select('game_mode,season_number,progress_data')
    .eq('user_id', userId);
  if (error) return { data: {}, error };
  const data: Partial<Record<GameMode, UserProgressData>> = {};
  for (const row of rows ?? []) {
    const mode = row.game_mode as GameMode;
    if (!Object.values(GAME_MODES).includes(mode)) continue;
    const expectedSeason = mode === GAME_MODES.SEASONAL ? ACTIVE_SEASON_NUMBER : 0;
    if (row.season_number !== expectedSeason) continue;
    data[mode] = row.progress_data as UserProgressData;
  }
  return { data, error: null };
};
