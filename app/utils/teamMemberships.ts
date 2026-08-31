import { GAME_MODE_VALUES, isGameMode, type GameMode } from '@/utils/constants';
export type TeamMembershipRow = {
  game_mode: unknown;
  team_id: string | null;
};
export const createTeamMembershipIds = (): Record<GameMode, string | null> =>
  Object.fromEntries(GAME_MODE_VALUES.map((mode) => [mode, null])) as Record<
    GameMode,
    string | null
  >;
export const collectTeamMembershipIds = (
  rows: TeamMembershipRow[] | null | undefined
): Record<GameMode, string | null> => {
  const teamIds = createTeamMembershipIds();
  for (const row of rows ?? []) {
    if (isGameMode(row.game_mode)) teamIds[row.game_mode] = row.team_id;
  }
  return teamIds;
};
