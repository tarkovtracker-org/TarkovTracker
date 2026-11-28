import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import type { GameMode } from '@/utils/constants';
export const useGameModeSwitchLock = () => useState('game-mode-switch-locked', () => false);
const useModeSwitching = () => useState('game-mode-switching', () => false);
const useImportingProgress = () => useState('game-mode-importing-progress', () => false);
export function useProgressImportBlocked() {
  const metadata = useMetadataStore();
  const switching = useModeSwitching();
  const importing = useImportingProgress();
  return computed(() => switching.value || importing.value || metadata.loading);
}
export function useProgressImportClaim() {
  const blocked = useProgressImportBlocked();
  const importing = useImportingProgress();
  return () => {
    if (blocked.value) return null;
    importing.value = true;
    return () => {
      importing.value = false;
    };
  };
}
export function useGameModeSwitch() {
  const metadata = useMetadataStore();
  const tarkov = useTarkovStore();
  const switching = useModeSwitching();
  const locked = useGameModeSwitchLock();
  const busy = useProgressImportBlocked();
  const dataLoading = computed(() => busy.value || locked.value);
  const switchModeError = ref('');
  async function refreshMode() {
    metadata.updateLanguageAndGameMode();
    await metadata.fetchAllData();
  }
  async function restoreMode(mode: GameMode) {
    await tarkov.switchGameMode(mode);
    await refreshMode();
  }
  async function switchMode(mode: GameMode, refreshCurrent = false) {
    const previousMode = tarkov.getCurrentGameMode();
    if (dataLoading.value) return false;
    if (mode === previousMode && !refreshCurrent) return true;
    switchModeError.value = '';
    switching.value = true;
    metadata.setLoading(true);
    let errorKey = 'settings.game_settings.switch_mode_failed';
    try {
      if (mode !== previousMode) await tarkov.switchGameMode(mode);
      if (tarkov.getCurrentGameMode() !== mode) return false;
      errorKey = 'settings.game_settings.switch_mode_fetch_failed';
      await refreshMode();
      return true;
    } catch (error) {
      logger.error('[GameMode] Could not switch mode and refresh data:', error);
      switchModeError.value = errorKey;
      if (tarkov.getCurrentGameMode() !== previousMode) {
        await restoreMode(previousMode).catch((rollbackError) => {
          logger.error('[GameMode] Could not restore the previous mode:', rollbackError);
        });
      }
      return false;
    } finally {
      metadata.setLoading(false);
      switching.value = false;
    }
  }
  return { dataLoading, switchMode, switchModeError };
}
