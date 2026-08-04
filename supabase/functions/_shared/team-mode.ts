const TEAM_GAME_MODES = ['pvp', 'pve', 'seasonal'] as const;
export type TeamGameMode = (typeof TEAM_GAME_MODES)[number];
export type TeamIdColumn = 'pvp_team_id' | 'pve_team_id' | 'seasonal_team_id';
export const isTeamGameMode = (value: unknown): value is TeamGameMode =>
  typeof value === 'string' && TEAM_GAME_MODES.includes(value as TeamGameMode);
export const teamIdColumnForMode = (mode: TeamGameMode): TeamIdColumn => `${mode}_team_id`;
