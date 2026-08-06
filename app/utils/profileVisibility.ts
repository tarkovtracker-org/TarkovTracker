import {
  GAME_MODE_VALUES,
  getGameModeSeasonNumber,
  isGameMode,
  type GameMode,
} from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
export type ProfileVisibilityRow = {
  game_mode: unknown;
  profile_public: unknown;
  season_number: unknown;
};
export type LegacyProfileVisibilityRow = {
  profile_share_pve_public?: unknown;
  profile_share_pvp_public?: unknown;
};
type ProfileVisibilityQueryResult = {
  data: ProfileVisibilityRow[] | null;
  error: unknown;
  legacy?: LegacyProfileVisibilityRow | null;
};
export const fetchProfileVisibilityRows = async (
  client: Pick<SupabaseClient, 'from'>,
  userId: string,
  modes?: GameMode[]
): Promise<ProfileVisibilityQueryResult> => {
  const baseModeQuery = client
    .from('user_game_mode_progress')
    .select('game_mode,season_number,profile_public')
    .eq('user_id', userId);
  const modeQuery = modes ? baseModeQuery.in('game_mode', modes) : baseModeQuery;
  const [modeRows, legacyRows] = await Promise.all([
    modeQuery,
    client
      .from('user_preferences')
      .select('profile_share_pvp_public,profile_share_pve_public')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (legacyRows.error) {
    logger.error('Failed to load legacy profile sharing preferences', {
      error: legacyRows.error,
      userId,
    });
  }
  return {
    data: modeRows.data,
    error: modeRows.error,
    legacy: legacyRows.error ? null : legacyRows.data,
  };
};
export type LoadedProfileVisibility =
  | { current: false }
  | { current: true; error: null; visibility: Record<GameMode, boolean> }
  | { current: true; error: unknown; visibility: null };
const createLoadedProfileVisibility = (
  result: ProfileVisibilityQueryResult,
  current: boolean
): LoadedProfileVisibility => {
  if (!current) return { current: false };
  if (result.error) return { current: true, error: result.error, visibility: null };
  return {
    current: true,
    error: null,
    visibility: collectProfileVisibility(result.data, result.legacy),
  };
};
export const isCurrentProfileVisibilityRequest = (
  requestId: number,
  latestRequestId: number,
  requestedUserId: string,
  currentUserId: string | null | undefined
): boolean => requestId === latestRequestId && requestedUserId === currentUserId;
const isActiveProfileVisibilityRow = (
  row: ProfileVisibilityRow
): row is ProfileVisibilityRow & { game_mode: GameMode } =>
  isGameMode(row.game_mode) && row.season_number === getGameModeSeasonNumber(row.game_mode);
export const createProfileVisibility = (): Record<GameMode, boolean> =>
  Object.fromEntries(GAME_MODE_VALUES.map((mode) => [mode, false])) as Record<GameMode, boolean>;
const isLegacyProfilePublic = (
  legacy: LegacyProfileVisibilityRow | null | undefined,
  mode: 'pvp' | 'pve'
): boolean => legacy?.[`profile_share_${mode}_public`] === true;
export const collectProfileVisibility = (
  rows: ProfileVisibilityRow[] | null | undefined,
  legacy?: LegacyProfileVisibilityRow | null
): Record<GameMode, boolean> => {
  const visibility = createProfileVisibility();
  visibility.pvp = isLegacyProfilePublic(legacy, 'pvp');
  visibility.pve = isLegacyProfilePublic(legacy, 'pve');
  for (const row of rows ?? []) {
    if (isActiveProfileVisibilityRow(row)) visibility[row.game_mode] = row.profile_public === true;
  }
  return visibility;
};
export const loadCurrentProfileVisibility = async (
  fetchRows: () => PromiseLike<ProfileVisibilityQueryResult>,
  isCurrent: () => boolean
): Promise<LoadedProfileVisibility> => {
  try {
    return createLoadedProfileVisibility(await fetchRows(), isCurrent());
  } catch (error) {
    return createLoadedProfileVisibility({ data: null, error }, isCurrent());
  }
};
