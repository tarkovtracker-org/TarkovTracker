import { useSkillCalculation } from '@/composables/useSkillCalculation';
import { useXpCalculation } from '@/composables/useXpCalculation';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { isGameMode, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  getImportCooldownRemainingMs,
  recordImportCompletion,
} from '@/utils/tarkovDevImportCooldown';
import { parseTarkovDevProfile, type TarkovDevImportResult } from '@/utils/tarkovDevProfileParser';
import {
  resolveTarkovDevProfileSource,
  type TarkovDevProfileSource,
} from '@/utils/tarkovDevProfileSource';
export type ImportState = 'idle' | 'loading' | 'preview' | 'success' | 'error';
export type ImportErrorCode =
  | 'cooldown_active'
  | 'profile_stale'
  | 'profile_not_generated'
  | 'rate_limited'
  | 'verification_failed'
  | 'fetch_failed';
export interface UseTarkovDevImportReturn {
  importState: Ref<ImportState>;
  previewData: Ref<TarkovDevImportResult | null>;
  importError: Ref<string | null>;
  importErrorCode: Ref<ImportErrorCode | null>;
  importErrorMeta: Ref<Record<string, number> | null>;
  parseFile: (file: File) => Promise<void>;
  parseProfileUrl: (
    profileUrl: string,
    options?: TarkovDevProfileFetchOptions
  ) => Promise<TarkovDevProfileSource | null>;
  confirmImport: (targetMode: GameMode, editionOverride?: number | null) => Promise<void>;
  setError: (message: string) => void;
  reset: () => void;
}
export type TarkovDevProfileFetchOptions = {
  fresh?: boolean;
  turnstileToken?: string | null;
};
const GENERIC_FETCH_ERROR =
  'Unable to fetch Tarkov.dev profile. Open the profile on Tarkov.dev, then try again.';
const DEFAULT_COOLDOWN_MINUTES = 60;
const MINUTE_MS = 60_000;
function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate.statusCode ?? candidate.status ?? candidate.response?.status;
  return typeof status === 'number' ? status : null;
}
function readErrorData(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null;
  const body = (error as { data?: unknown }).data;
  if (!body || typeof body !== 'object') return null;
  const data = (body as { data?: unknown }).data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}
function readNumericField(data: Record<string, unknown> | null, key: string): number | null {
  const value = data?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function useTarkovDevImport(): UseTarkovDevImportReturn {
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const runtimeConfig = useRuntimeConfig();
  const { setTotalSkillLevel } = useSkillCalculation();
  const { setTotalXP } = useXpCalculation();
  const importState = ref<ImportState>('idle');
  const previewData = ref<TarkovDevImportResult | null>(null);
  const importError = ref<string | null>(null);
  const importErrorCode = ref<ImportErrorCode | null>(null);
  const importErrorMeta = ref<Record<string, number> | null>(null);
  let profileUrlRequestId = 0;
  let lastFetchedSource: TarkovDevProfileSource | null = null;
  let staleRetryJsonUrl: string | null = null;
  const cooldownMinutesRaw = Number(runtimeConfig.public.tarkovDevImportCooldownMinutes);
  const cooldownMs =
    (Number.isFinite(cooldownMinutesRaw) && cooldownMinutesRaw >= 0
      ? cooldownMinutesRaw
      : DEFAULT_COOLDOWN_MINUTES) * MINUTE_MS;
  function reset(): void {
    profileUrlRequestId++;
    importState.value = 'idle';
    previewData.value = null;
    importError.value = null;
    importErrorCode.value = null;
    importErrorMeta.value = null;
    lastFetchedSource = null;
    staleRetryJsonUrl = null;
  }
  function setError(message: string): void {
    setCodedError(message, null, null);
  }
  function setCodedError(
    message: string,
    code: ImportErrorCode | null,
    meta: Record<string, number> | null
  ): void {
    importState.value = 'error';
    previewData.value = null;
    importError.value = message;
    importErrorCode.value = code;
    importErrorMeta.value = meta;
  }
  function applyProfilePayload(json: unknown): boolean {
    const result = parseTarkovDevProfile(json);
    if (!result.ok) {
      setCodedError(result.error, null, null);
      return false;
    }
    previewData.value = result.data;
    importState.value = 'preview';
    importError.value = null;
    importErrorCode.value = null;
    importErrorMeta.value = null;
    return true;
  }
  function applyProfileUrlError(error: unknown): void {
    const status = readErrorStatus(error);
    const data = readErrorData(error);
    const code = typeof data?.code === 'string' ? data.code : null;
    if (status === 422 && code === 'profile_stale') {
      const ageDays = readNumericField(data, 'ageDays') ?? 0;
      setCodedError(GENERIC_FETCH_ERROR, 'profile_stale', { days: ageDays });
      return;
    }
    if (status === 404) {
      setCodedError(GENERIC_FETCH_ERROR, 'profile_not_generated', null);
      return;
    }
    if (status === 429) {
      const retryAfterSeconds = readNumericField(data, 'retryAfterSeconds') ?? 60;
      setCodedError(GENERIC_FETCH_ERROR, 'rate_limited', {
        minutes: Math.max(1, Math.ceil(retryAfterSeconds / 60)),
      });
      return;
    }
    if (status === 403 && code === 'turnstile_failed') {
      setCodedError(GENERIC_FETCH_ERROR, 'verification_failed', null);
      return;
    }
    setCodedError(GENERIC_FETCH_ERROR, 'fetch_failed', null);
  }
  async function parseFile(file: File): Promise<void> {
    const requestId = ++profileUrlRequestId;
    importState.value = 'loading';
    previewData.value = null;
    importError.value = null;
    importErrorCode.value = null;
    importErrorMeta.value = null;
    lastFetchedSource = null;
    staleRetryJsonUrl = null;
    try {
      const text = await file.text();
      if (requestId !== profileUrlRequestId) return;
      applyProfilePayload(JSON.parse(text));
    } catch (e) {
      if (requestId !== profileUrlRequestId) return;
      setCodedError('Failed to read or parse JSON file', null, null);
      logger.error('[TarkovDevImport] Parse error:', e);
    }
  }
  async function parseProfileUrl(
    profileUrl: string,
    options: TarkovDevProfileFetchOptions = {}
  ): Promise<TarkovDevProfileSource | null> {
    const requestId = ++profileUrlRequestId;
    importError.value = null;
    importErrorCode.value = null;
    importErrorMeta.value = null;
    const source = resolveTarkovDevProfileSource(profileUrl);
    if (!source.ok) {
      if (requestId !== profileUrlRequestId) return null;
      setCodedError(source.error, null, null);
      return null;
    }
    const cooldownMode = source.data.mode ?? 'pvp';
    const cooldownRemainingMs = getImportCooldownRemainingMs(
      source.data.tarkovUid,
      cooldownMode,
      cooldownMs
    );
    if (cooldownRemainingMs > 0) {
      if (requestId !== profileUrlRequestId) return null;
      setCodedError(GENERIC_FETCH_ERROR, 'cooldown_active', {
        minutes: Math.max(1, Math.ceil(cooldownRemainingMs / MINUTE_MS)),
      });
      return null;
    }
    importState.value = 'loading';
    previewData.value = null;
    const wantsFresh = options.fresh === true || staleRetryJsonUrl === source.data.profileJsonUrl;
    try {
      const json = await $fetch<unknown>('/api/tarkov-dev/profile', {
        query: {
          url: source.data.profileJsonUrl,
          ...(wantsFresh ? { fresh: '1' } : {}),
        },
        ...(options.turnstileToken
          ? { headers: { 'x-turnstile-token': options.turnstileToken } }
          : {}),
        retry: 0,
      });
      if (requestId !== profileUrlRequestId) return null;
      staleRetryJsonUrl = null;
      if (!applyProfilePayload(json)) return null;
      lastFetchedSource = source.data;
      return source.data;
    } catch (e) {
      if (requestId !== profileUrlRequestId) return null;
      applyProfileUrlError(e);
      if (importErrorCode.value === 'profile_stale') {
        staleRetryJsonUrl = source.data.profileJsonUrl;
      }
      logger.error('[TarkovDevImport] Profile URL fetch error:', e);
      return null;
    }
  }
  async function confirmImport(
    targetMode: GameMode,
    editionOverride?: number | null
  ): Promise<void> {
    if (!previewData.value) return;
    if (!isGameMode(targetMode)) return;
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
      if (lastFetchedSource && lastFetchedSource.tarkovUid === data.tarkovUid) {
        recordImportCompletion(data.tarkovUid, lastFetchedSource.mode ?? 'pvp', cooldownMs);
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
    importErrorCode,
    importErrorMeta,
    parseFile,
    parseProfileUrl,
    confirmImport,
    setError,
    reset,
  };
}
