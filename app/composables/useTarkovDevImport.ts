import { useSkillCalculation } from '@/composables/useSkillCalculation';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import { parseTarkovDevProfile, type TarkovDevImportResult } from '@/utils/tarkovDevProfileParser';
import type { GameMode } from '@/utils/constants';
export type ImportState = 'idle' | 'preview' | 'success' | 'error';
export interface UseTarkovDevImportReturn {
  importState: Ref<ImportState>;
  previewData: Ref<TarkovDevImportResult | null>;
  importError: Ref<string | null>;
  parseFile: (file: File) => Promise<void>;
  confirmImport: (targetMode: GameMode, editionOverride?: number | null) => Promise<void>;
  reset: () => void;
}
export function useTarkovDevImport(): UseTarkovDevImportReturn {
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const { setTotalSkillLevel } = useSkillCalculation();
  const importState = ref<ImportState>('idle');
  const previewData = ref<TarkovDevImportResult | null>(null);
  const importError = ref<string | null>(null);
  function reset(): void {
    importState.value = 'idle';
    previewData.value = null;
    importError.value = null;
  }
  async function parseFile(file: File): Promise<void> {
    importError.value = null;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = parseTarkovDevProfile(json);
      if (!result.ok) {
        importState.value = 'error';
        importError.value = result.error;
        return;
      }
      previewData.value = result.data;
      importState.value = 'preview';
    } catch (e) {
      importState.value = 'error';
      importError.value = 'Failed to read or parse JSON file';
      logger.error('[TarkovDevImport] Parse error:', e);
    }
  }
  async function confirmImport(
    targetMode: GameMode,
    editionOverride?: number | null
  ): Promise<void> {
    if (!previewData.value) return;
    const data = previewData.value;
    try {
      const originalMode = tarkovStore.getCurrentGameMode();
      tarkovStore.setTarkovUid(data.tarkovUid);
      if (targetMode !== originalMode) {
        await tarkovStore.switchGameMode(targetMode);
      }
      tarkovStore.setPMCFaction(data.pmcFaction);
      tarkovStore.setDisplayName(data.displayName);
      tarkovStore.setPrestigeLevel(data.prestigeLevel);
      const levels = metadataStore.playerLevels;
      let derivedLevel = 1;
      for (let i = levels.length - 1; i >= 0; i--) {
        const level = levels[i];
        if (level && data.totalXP >= level.exp) {
          derivedLevel = level.level;
          break;
        }
      }
      preferencesStore.setUseAutomaticLevelCalculation(false);
      tarkovStore.setLevel(derivedLevel);
      for (const [skillId, level] of Object.entries(data.skills)) {
        setTotalSkillLevel(skillId, level);
      }
      const edition = editionOverride ?? data.gameEditionGuess;
      if (edition !== null && edition !== undefined) {
        tarkovStore.setGameEdition(edition);
      }
      tarkovStore.setTarkovDevProfile(data.rawProfile);
      await tarkovStore.switchGameMode(originalMode);
      importState.value = 'success';
    } catch (e) {
      importState.value = 'error';
      importError.value = 'Failed to apply import data';
      logger.error('[TarkovDevImport] Import error:', e);
    }
  }
  return {
    importState,
    previewData,
    importError,
    parseFile,
    confirmImport,
    reset,
  };
}
