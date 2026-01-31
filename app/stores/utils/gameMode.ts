import { useTarkovStore } from '@/stores/useTarkov';
import { GAME_MODES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
export function getCurrentGameMode(): GameMode {
  try {
    const tarkovStore = useTarkovStore();
    return (tarkovStore.getCurrentGameMode?.() as GameMode) || GAME_MODES.PVP;
  } catch (error) {
    logger.warn('[gameMode] Failed to get game mode, defaulting to PVP:', error);
    return GAME_MODES.PVP;
  }
}
