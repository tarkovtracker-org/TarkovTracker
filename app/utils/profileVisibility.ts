import {
  GAME_MODE_VALUES,
  getGameModeSeasonNumber,
  isGameMode,
  type GameMode,
} from '@/utils/constants';
import { logger } from '@/utils/logger';
export type ProfileVisibilityRow = {
  game_mode: unknown;
  profile_public: unknown;
  season_number: unknown;
};
type ProfileVisibilityQueryResult = {
  data: ProfileVisibilityRow[] | null;
  error: unknown;
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
  if (result.error) {
    logger.error('[ProfileVisibility] Failed to load profile visibility:', result.error);
    return { current: true, error: result.error, visibility: null };
  }
  return { current: true, error: null, visibility: collectProfileVisibility(result.data) };
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
export const collectProfileVisibility = (
  rows: ProfileVisibilityRow[] | null | undefined
): Record<GameMode, boolean> => {
  const visibility = createProfileVisibility();
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
