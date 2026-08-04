import { ACTIVE_SEASON_NUMBER } from '../../../../app/utils/constants';
import type { GameMode } from '../types';
export const getGameModeSeasonNumber = (gameMode: GameMode): number =>
  gameMode === 'seasonal' ? ACTIVE_SEASON_NUMBER : 0;
