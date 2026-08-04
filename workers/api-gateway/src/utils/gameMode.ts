import type { GameMode } from '../types';
const ACTIVE_SEASON_NUMBER = 1;
export const getGameModeSeasonNumber = (gameMode: GameMode): number =>
  gameMode === 'seasonal' ? ACTIVE_SEASON_NUMBER : 0;
