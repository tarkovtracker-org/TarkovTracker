import { storeToRefs } from 'pinia';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import type { GameMode } from '@/utils/constants';
export function useGameModeSwitch() {
  const metadata = useMetadataStore();
  const tarkov = useTarkovStore();
  const { loading } = storeToRefs(metadata);
  const switching = useState('game-mode-switching', () => false);
  const dataLoading = computed(() => switching.value || loading.value);
  const switchModeError = ref('');
  async function refreshMode() {
    metadata.updateLanguageAndGameMode();
    await metadata.fetchAllData();
  }
  async function restoreMode(mode: GameMode) {
    await tarkov.switchGameMode(mode);
    await refreshMode();
  }
  async function switchMode(mode: GameMode) {
    const previousMode = tarkov.getCurrentGameMode();
    if (mode === previousMode || dataLoading.value) return;
    switchModeError.value = '';
    switching.value = true;
    metadata.setLoading(true);
    let errorKey = 'settings.game_settings.switch_mode_failed';
    try {
      await tarkov.switchGameMode(mode);
      errorKey = 'settings.game_settings.switch_mode_fetch_failed';
      await refreshMode();
    } catch (error) {
      logger.error('[GameMode] Could not switch mode and refresh data:', error);
      switchModeError.value = errorKey;
      if (tarkov.getCurrentGameMode() !== previousMode) {
        await restoreMode(previousMode).catch((rollbackError) => {
          logger.error('[GameMode] Could not restore the previous mode:', rollbackError);
        });
      }
    } finally {
      metadata.setLoading(false);
      switching.value = false;
    }
  }
  return { dataLoading, switchMode, switchModeError };
}
