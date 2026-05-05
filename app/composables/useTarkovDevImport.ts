import { useSkillCalculation } from '@/composables/useSkillCalculation';
import { useXpCalculation } from '@/composables/useXpCalculation';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import { parseTarkovDevProfile, type TarkovDevImportResult } from '@/utils/tarkovDevProfileParser';
import {
  resolveTarkovDevProfileSource,
  type TarkovDevProfileSource,
} from '@/utils/tarkovDevProfileSource';
import type { GameMode } from '@/utils/constants';
export type ImportState = 'idle' | 'loading' | 'preview' | 'success' | 'error';
export interface UseTarkovDevImportReturn {
  importState: Ref<ImportState>;
  previewData: Ref<TarkovDevImportResult | null>;
  importError: Ref<string | null>;
  parseFile: (file: File) => Promise<void>;
  parseProfileUrl: (profileUrl: string) => Promise<TarkovDevProfileSource | null>;
  confirmImport: (targetMode: GameMode, editionOverride?: number | null) => Promise<void>;
  setError: (message: string) => void;
  reset: () => void;
}
export function useTarkovDevImport(): UseTarkovDevImportReturn {
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const { setTotalSkillLevel } = useSkillCalculation();
  const { setTotalXP } = useXpCalculation();
  const importState = ref<ImportState>('idle');
  const previewData = ref<TarkovDevImportResult | null>(null);
  const importError = ref<string | null>(null);
  let profileUrlRequestId = 0;
  function reset(): void {
    profileUrlRequestId++;
    importState.value = 'idle';
    previewData.value = null;
    importError.value = null;
  }
  function setError(message: string): void {
    importState.value = 'error';
    previewData.value = null;
    importError.value = message;
  }
  function applyProfilePayload(json: unknown): boolean {
    const result = parseTarkovDevProfile(json);
    if (!result.ok) {
      importState.value = 'error';
      previewData.value = null;
      importError.value = result.error;
      return false;
    }
    previewData.value = result.data;
    importState.value = 'preview';
    importError.value = null;
    return true;
  }
  async function parseFile(file: File): Promise<void> {
    const requestId = ++profileUrlRequestId;
    importState.value = 'loading';
    previewData.value = null;
    importError.value = null;
    try {
      const text = await file.text();
      if (requestId !== profileUrlRequestId) return;
      applyProfilePayload(JSON.parse(text));
    } catch (e) {
      if (requestId !== profileUrlRequestId) return;
      importState.value = 'error';
      importError.value = 'Failed to read or parse JSON file';
      logger.error('[TarkovDevImport] Parse error:', e);
    }
  }
  async function parseProfileUrl(profileUrl: string): Promise<TarkovDevProfileSource | null> {
    const requestId = ++profileUrlRequestId;
    importError.value = null;
    const source = resolveTarkovDevProfileSource(profileUrl);
    if (!source.ok) {
      if (requestId !== profileUrlRequestId) return null;
      importState.value = 'error';
      previewData.value = null;
      importError.value = source.error;
      return null;
    }
    importState.value = 'loading';
    previewData.value = null;
    try {
      const json = await $fetch<unknown>('/api/tarkov-dev/profile', {
        query: { url: source.data.profileJsonUrl },
      });
      if (requestId !== profileUrlRequestId) return null;
      return applyProfilePayload(json) ? source.data : null;
    } catch (e) {
      if (requestId !== profileUrlRequestId) return null;
      importState.value = 'error';
      importError.value =
        'Unable to fetch Tarkov.dev profile. Open the profile on Tarkov.dev, then try again.';
      logger.error('[TarkovDevImport] Profile URL fetch error:', e);
      return null;
    }
  }
  async function confirmImport(
    targetMode: GameMode,
    editionOverride?: number | null
  ): Promise<void> {
    if (!previewData.value) return;
    const data = previewData.value;
    const originalMode = tarkovStore.getCurrentGameMode();
    const shouldRestoreMode = targetMode !== originalMode;
    try {
      if (shouldRestoreMode) {
        await tarkovStore.switchGameMode(targetMode);
      }
      tarkovStore.setTarkovUid(data.tarkovUid);
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
      setTotalXP(data.totalXP);
      tarkovStore.setLevel(derivedLevel);
      for (const [skillId, level] of Object.entries(data.skills)) {
        setTotalSkillLevel(skillId, level);
      }
      const edition = editionOverride ?? data.gameEditionGuess;
      if (edition !== null && edition !== undefined) {
        tarkovStore.setGameEdition(edition);
      }
      importState.value = 'success';
    } catch (e) {
      importState.value = 'error';
      importError.value = 'Failed to apply import data';
      logger.error('[TarkovDevImport] Import error:', e);
    } finally {
      if (shouldRestoreMode) {
        try {
          await tarkovStore.switchGameMode(originalMode);
        } catch (e) {
          logger.error('[TarkovDevImport] Failed to restore original game mode:', e);
        }
      }
    }
  }
  return {
    importState,
    previewData,
    importError,
    parseFile,
    parseProfileUrl,
    confirmImport,
    setError,
    reset,
  };
}
