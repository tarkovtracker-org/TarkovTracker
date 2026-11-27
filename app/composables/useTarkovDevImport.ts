import { useSkillCalculation } from '@/composables/useSkillCalculation';
import { captureStartupOwnership } from '@/stores/tarkov/startupOwnership';
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
  buildTarkovDevProfileSource,
  resolveTarkovDevProfileSource,
  type TarkovDevProfileSource,
} from '@/utils/tarkovDevProfileSource';
import { getCurrentSupabaseUserId } from '@/utils/userScopedStorage';
export type ImportState = 'idle' | 'loading' | 'preview' | 'success' | 'error';
export type ImportErrorCode =
  | 'cooldown_active'
  | 'profile_stale'
  | 'profile_not_generated'
  | 'rate_limited'
  | 'verification_failed'
  | 'fetch_failed'
  | 'tarkov_uid_conflict'
  | 'save_failed'
  | 'level_thresholds_unavailable';
export type TarkovDevModeFetchStatus =
  | {
      status: 'ok';
      data: TarkovDevImportResult;
      source: TarkovDevProfileSource;
      staleAccepted?: boolean;
    }
  | {
      status: 'stale';
      ageDays: number;
      maxUpdatedAgeDays: number;
      updatedAt: number;
      source: TarkovDevProfileSource;
    }
  | { status: 'not_found'; source: TarkovDevProfileSource }
  | { status: 'cooldown'; minutes: number; source: TarkovDevProfileSource }
  | { status: 'error'; source: TarkovDevProfileSource };
export interface TarkovDevMultiModePreview {
  tarkovUid: number;
  requestedModes: GameMode[];
  modes: Partial<Record<GameMode, TarkovDevModeFetchStatus>>;
}
export interface UseTarkovDevImportReturn {
  isImporting: Ref<boolean>;
  importState: Ref<ImportState>;
  previewData: Ref<TarkovDevImportResult | null>;
  multiPreview: Ref<TarkovDevMultiModePreview | null>;
  importError: Ref<string | null>;
  importErrorCode: Ref<ImportErrorCode | null>;
  importErrorMeta: Ref<Record<string, number> | null>;
  parseFile: (file: File) => Promise<void>;
  parseProfileUrl: (
    profileUrl: string,
    options?: TarkovDevProfileFetchOptions
  ) => Promise<TarkovDevProfileSource | null>;
  parseProfileModes: (
    profileUrl: string,
    modes: GameMode[],
    options?: TarkovDevProfileFetchOptions
  ) => Promise<TarkovDevMultiModePreview | null>;
  refetchPreviewMode: (mode: GameMode, options?: TarkovDevProfileFetchOptions) => Promise<boolean>;
  confirmImport: (targetMode: GameMode, editionOverride?: number | null) => Promise<void>;
  confirmMultiImport: (
    targetModes: GameMode[],
    editionOverride?: number | null
  ) => Promise<GameMode[]>;
  setError: (message: string) => void;
  reset: () => void;
}
export type TarkovDevProfileFetchOptions = {
  allowStale?: boolean;
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
type CodedImportError = { code: ImportErrorCode; meta: Record<string, number> | null };
const readErrorCode = (data: Record<string, unknown> | null): string | null =>
  typeof data?.code === 'string' ? data.code : null;
const toMinutes = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60));
type ProfileUrlErrorRule = (
  code: string | null,
  data: Record<string, unknown> | null
) => CodedImportError | null;
const PROFILE_URL_ERROR_RULES: Record<string, ProfileUrlErrorRule> = {
  '422': (code, data) =>
    code === 'profile_stale'
      ? { code: 'profile_stale', meta: { days: readNumericField(data, 'ageDays') ?? 0 } }
      : null,
  '404': () => ({ code: 'profile_not_generated', meta: null }),
  '429': (_code, data) => ({
    code: 'rate_limited',
    meta: { minutes: toMinutes(readNumericField(data, 'retryAfterSeconds') ?? 60) },
  }),
  '403': (code) =>
    code === 'turnstile_failed' ? { code: 'verification_failed', meta: null } : null,
};
function classifyProfileUrlError(error: unknown): CodedImportError {
  const data = readErrorData(error);
  const rule = PROFILE_URL_ERROR_RULES[String(readErrorStatus(error))];
  return rule?.(readErrorCode(data), data) ?? { code: 'fetch_failed', meta: null };
}
export function useTarkovDevImport(): UseTarkovDevImportReturn {
  const { $supabase } = useNuxtApp();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const runtimeConfig = useRuntimeConfig();
  const { setTotalSkillLevel } = useSkillCalculation();
  const importState = ref<ImportState>('idle');
  const isImporting = ref(false);
  const previewData = ref<TarkovDevImportResult | null>(null);
  const multiPreview = ref<TarkovDevMultiModePreview | null>(null);
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
    multiPreview.value = null;
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
    multiPreview.value = null;
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
    const { code, meta } = classifyProfileUrlError(error);
    setCodedError(GENERIC_FETCH_ERROR, code, meta);
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
  const isCurrentRequest = (requestId: number): boolean => requestId === profileUrlRequestId;
  function rejectProfileUrl(
    requestId: number,
    message: string,
    code: ImportErrorCode | null,
    meta: Record<string, number> | null
  ): null {
    if (isCurrentRequest(requestId)) setCodedError(message, code, meta);
    return null;
  }
  function getCooldownMinutes(source: TarkovDevProfileSource): number {
    const remainingMs = getImportCooldownRemainingMs(
      source.tarkovUid,
      source.mode ?? 'pvp',
      cooldownMs
    );
    return remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / MINUTE_MS)) : 0;
  }
  function fetchProfileJson(
    source: TarkovDevProfileSource,
    options: TarkovDevProfileFetchOptions
  ): Promise<unknown> {
    const wantsFresh = options.fresh === true || staleRetryJsonUrl === source.profileJsonUrl;
    const allowStale = options.allowStale === true;
    return $fetch<unknown>('/api/tarkov-dev/profile', {
      query: {
        url: source.profileJsonUrl,
        ...(wantsFresh && !allowStale ? { fresh: '1' } : {}),
        ...(allowStale ? { allowStale: '1' } : {}),
      },
      ...(options.turnstileToken
        ? { headers: { 'x-turnstile-token': options.turnstileToken } }
        : {}),
      retry: 0,
    });
  }
  function acceptProfileJson(
    requestId: number,
    source: TarkovDevProfileSource,
    json: unknown
  ): TarkovDevProfileSource | null {
    if (!isCurrentRequest(requestId)) return null;
    staleRetryJsonUrl = null;
    if (!applyProfilePayload(json)) return null;
    lastFetchedSource = source;
    return source;
  }
  function failProfileFetch(
    requestId: number,
    source: TarkovDevProfileSource,
    error: unknown
  ): null {
    if (!isCurrentRequest(requestId)) return null;
    applyProfileUrlError(error);
    if (importErrorCode.value === 'profile_stale') staleRetryJsonUrl = source.profileJsonUrl;
    logger.error('[TarkovDevImport] Profile URL fetch error:', error);
    return null;
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
    if (!source.ok) return rejectProfileUrl(requestId, source.error, null, null);
    const minutes = getCooldownMinutes(source.data);
    if (minutes > 0) {
      return rejectProfileUrl(requestId, GENERIC_FETCH_ERROR, 'cooldown_active', { minutes });
    }
    importState.value = 'loading';
    previewData.value = null;
    try {
      const json = await fetchProfileJson(source.data, options);
      return acceptProfileJson(requestId, source.data, json);
    } catch (e) {
      return failProfileFetch(requestId, source.data, e);
    }
  }
  function deriveLevel(totalXP: number): number {
    const levels = metadataStore.playerLevels;
    for (let i = levels.length - 1; i >= 0; i--) {
      const level = levels[i];
      if (level && totalXP >= level.exp) return level.level;
    }
    return 1;
  }
  function applyImportData(data: TarkovDevImportResult, editionOverride?: number | null): void {
    tarkovStore.setTarkovUid(data.tarkovUid);
    tarkovStore.setPMCFaction(data.pmcFaction);
    tarkovStore.setDisplayName(data.displayName);
    tarkovStore.setPrestigeLevel(data.prestigeLevel);
    tarkovStore.setLevel(deriveLevel(data.totalXP));
    for (const [skillId, level] of Object.entries(data.skills)) {
      setTotalSkillLevel(skillId, level);
    }
    const edition = editionOverride ?? data.gameEditionGuess;
    if (typeof edition === 'number') tarkovStore.setGameEdition(edition);
  }
  /** Saves the applied import and reports why the cloud did not accept it, if it did not. */
  async function saveImport(tarkovUid: number): Promise<ImportErrorCode | null> {
    if (!(await tarkovStore.saveProgressNow())) return 'save_failed';
    return tarkovStore.getTarkovUid() === tarkovUid ? null : 'tarkov_uid_conflict';
  }
  function recordUrlImportCooldown(tarkovUid: number): void {
    const source = lastFetchedSource;
    if (source?.tarkovUid !== tarkovUid) return;
    recordImportCompletion(tarkovUid, source.mode ?? 'pvp', cooldownMs);
  }
  async function runImport(
    data: TarkovDevImportResult,
    isCurrent: () => boolean,
    editionOverride?: number | null
  ): Promise<void> {
    if (!isCurrent()) return;
    applyImportData(data, editionOverride);
    const saveError = await saveImport(data.tarkovUid);
    if (!isCurrent()) return;
    if (saveError) {
      setCodedError('Failed to save import data', saveError, null);
      return;
    }
    recordUrlImportCooldown(data.tarkovUid);
    importState.value = 'success';
  }
  async function fetchLevelThresholds(): Promise<void> {
    try {
      await metadataStore.fetchBootstrapData();
    } catch (error) {
      logger.error('[TarkovDevImport] Failed to load player level thresholds:', error);
    }
  }
  async function runPreparedImport(
    data: TarkovDevImportResult,
    isCurrent: () => boolean,
    editionOverride?: number | null
  ): Promise<void> {
    if (metadataStore.playerLevels.length === 0) await fetchLevelThresholds();
    if (!isCurrent()) return;
    if (metadataStore.playerLevels.length === 0) {
      setCodedError(
        'Player level thresholds are unavailable',
        'level_thresholds_unavailable',
        null
      );
      return;
    }
    await runImport(data, isCurrent, editionOverride);
  }
  async function restoreGameMode(mode: GameMode): Promise<void> {
    try {
      await tarkovStore.switchGameMode(mode);
    } catch (e) {
      logger.error('[TarkovDevImport] Failed to restore original game mode:', e);
    }
  }
  async function importIntoMode(
    data: TarkovDevImportResult,
    targetMode: GameMode,
    isCurrent: () => boolean,
    ownsSession: () => boolean,
    editionOverride?: number | null
  ): Promise<void> {
    const originalMode = tarkovStore.getCurrentGameMode();
    const isTargetCurrent = () => isCurrent() && tarkovStore.getCurrentGameMode() === targetMode;
    if (targetMode === originalMode)
      return runPreparedImport(data, isTargetCurrent, editionOverride);
    try {
      await tarkovStore.switchGameMode(targetMode);
      await runPreparedImport(data, isTargetCurrent, editionOverride);
    } finally {
      if (ownsSession()) await restoreGameMode(originalMode);
    }
  }
  async function confirmImport(
    targetMode: GameMode,
    editionOverride?: number | null
  ): Promise<void> {
    const data = previewData.value;
    if (isImporting.value) return;
    if (!data || !isGameMode(targetMode)) return;
    const requestId = profileUrlRequestId;
    const ownerId = getCurrentSupabaseUserId();
    const ownsGeneration = captureStartupOwnership();
    const ownsSession = () =>
      ownsGeneration() &&
      getCurrentSupabaseUserId() === ownerId &&
      $supabase.user.loggedIn === (ownerId !== null);
    const isCurrent = () => ownsSession() && isCurrentRequest(requestId);
    isImporting.value = true;
    try {
      await importIntoMode(data, targetMode, isCurrent, ownsSession, editionOverride);
    } catch (e) {
      if (!isCurrent()) return;
      importState.value = 'error';
      importError.value = 'Failed to apply import data';
      logger.error('[TarkovDevImport] Import error:', e);
    } finally {
      isImporting.value = false;
    }
  }
  type MultiModeServerEntry =
    | { status: 'ok'; profile: unknown }
    | { status: 'stale'; ageDays: number; maxUpdatedAgeDays: number; updatedAt: number }
    | { status: 'not_found' }
    | { status: 'error' };
  type MultiModeServerResponse = {
    tarkovUid?: number;
    profiles?: Partial<Record<GameMode, MultiModeServerEntry>>;
  };
  function parseServerModeEntry(
    tarkovUid: number,
    mode: GameMode,
    entry: MultiModeServerEntry | undefined,
    allowStale: boolean
  ): TarkovDevModeFetchStatus {
    const source = buildTarkovDevProfileSource(tarkovUid, mode);
    if (!entry) return { status: 'error', source };
    if (entry.status === 'ok') {
      const parsed = parseTarkovDevProfile(entry.profile);
      return parsed.ok
        ? {
            status: 'ok',
            data: parsed.data,
            source,
            ...(allowStale ? { staleAccepted: true } : {}),
          }
        : { status: 'error', source };
    }
    if (entry.status === 'stale') {
      return {
        status: 'stale',
        ageDays: entry.ageDays,
        maxUpdatedAgeDays: entry.maxUpdatedAgeDays,
        updatedAt: entry.updatedAt,
        source,
      };
    }
    if (entry.status === 'not_found') return { status: 'not_found', source };
    return { status: 'error', source };
  }
  function syncPreviewDataFromMulti(preview: TarkovDevMultiModePreview): void {
    const firstOk = preview.requestedModes
      .map((mode) => preview.modes[mode])
      .find((entry): entry is Extract<TarkovDevModeFetchStatus, { status: 'ok' }> =>
        Boolean(entry && entry.status === 'ok')
      );
    previewData.value = firstOk?.data ?? null;
    lastFetchedSource = firstOk?.source ?? null;
  }
  function fetchMultiModeProfiles(
    source: TarkovDevProfileSource,
    modes: GameMode[],
    options: TarkovDevProfileFetchOptions
  ): Promise<MultiModeServerResponse> {
    const wantsFresh = options.fresh === true;
    const allowStale = options.allowStale === true;
    return $fetch<MultiModeServerResponse>('/api/tarkov-dev/profile', {
      query: {
        url: source.profileJsonUrl,
        modes: modes.join(','),
        ...(wantsFresh && !allowStale ? { fresh: '1' } : {}),
        ...(allowStale ? { allowStale: '1' } : {}),
      },
      ...(options.turnstileToken
        ? { headers: { 'x-turnstile-token': options.turnstileToken } }
        : {}),
      retry: 0,
    });
  }
  function finalizeMultiModeResult(
    requestId: number,
    preview: TarkovDevMultiModePreview
  ): TarkovDevMultiModePreview | null {
    if (!isCurrentRequest(requestId)) return null;
    const entries = preview.requestedModes.map((mode) => preview.modes[mode]);
    const hasOk = entries.some((entry) => entry?.status === 'ok');
    const staleEntries = entries.filter(
      (entry): entry is Extract<TarkovDevModeFetchStatus, { status: 'stale' }> =>
        entry?.status === 'stale'
    );
    if (hasOk || (preview.requestedModes.length > 1 && staleEntries.length > 0)) {
      multiPreview.value = preview;
      syncPreviewDataFromMulti(preview);
      importState.value = 'preview';
      importError.value = null;
      importErrorCode.value = null;
      importErrorMeta.value = null;
      return preview;
    }
    if (staleEntries.length === 1) {
      staleRetryJsonUrl = staleEntries[0]!.source.profileJsonUrl;
      setCodedError(GENERIC_FETCH_ERROR, 'profile_stale', { days: staleEntries[0]!.ageDays });
      return null;
    }
    const allNotFound = entries.every(
      (entry) => entry?.status === 'not_found' || entry?.status === 'cooldown'
    );
    setCodedError(
      GENERIC_FETCH_ERROR,
      allNotFound ? 'profile_not_generated' : 'fetch_failed',
      null
    );
    return null;
  }
  function partitionCooldownModes(tarkovUid: number, requestedModes: GameMode[]) {
    const modeStatuses: Partial<Record<GameMode, TarkovDevModeFetchStatus>> = {};
    const modesToFetch: GameMode[] = [];
    let minCooldown = Number.POSITIVE_INFINITY;
    for (const mode of requestedModes) {
      const modeSource = buildTarkovDevProfileSource(tarkovUid, mode);
      const minutes = getCooldownMinutes(modeSource);
      if (minutes > 0) {
        modeStatuses[mode] = { status: 'cooldown', minutes, source: modeSource };
        minCooldown = Math.min(minCooldown, minutes);
      } else {
        modesToFetch.push(mode);
      }
    }
    return {
      modeStatuses,
      modesToFetch,
      minCooldown: Number.isFinite(minCooldown) ? minCooldown : 1,
    };
  }
  async function parseProfileModes(
    profileUrl: string,
    modes: GameMode[],
    options: TarkovDevProfileFetchOptions = {}
  ): Promise<TarkovDevMultiModePreview | null> {
    const requestId = ++profileUrlRequestId;
    importError.value = null;
    importErrorCode.value = null;
    importErrorMeta.value = null;
    const source = resolveTarkovDevProfileSource(profileUrl);
    if (!source.ok) return rejectProfileUrl(requestId, source.error, null, null);
    const uniqueModes = modes.filter(
      (mode, index): mode is GameMode => isGameMode(mode) && modes.indexOf(mode) === index
    );
    const requestedModes = uniqueModes.length > 0 ? uniqueModes : [source.data.mode ?? 'pvp'];
    const { modeStatuses, modesToFetch, minCooldown } = partitionCooldownModes(
      source.data.tarkovUid,
      requestedModes
    );
    if (modesToFetch.length === 0) {
      return rejectProfileUrl(requestId, GENERIC_FETCH_ERROR, 'cooldown_active', {
        minutes: minCooldown,
      });
    }
    importState.value = 'loading';
    previewData.value = null;
    multiPreview.value = null;
    try {
      const response = await fetchMultiModeProfiles(source.data, modesToFetch, options);
      if (!isCurrentRequest(requestId)) return null;
      const allowStale = options.allowStale === true;
      for (const mode of modesToFetch) {
        modeStatuses[mode] = parseServerModeEntry(
          source.data.tarkovUid,
          mode,
          response.profiles?.[mode],
          allowStale
        );
      }
      return finalizeMultiModeResult(requestId, {
        tarkovUid: source.data.tarkovUid,
        requestedModes,
        modes: modeStatuses,
      });
    } catch (e) {
      return failProfileFetch(requestId, source.data, e);
    }
  }
  function classifyPreviewRefetchError(
    error: unknown,
    source: TarkovDevProfileSource
  ): TarkovDevModeFetchStatus {
    const classified = classifyProfileUrlError(error);
    if (classified.code === 'profile_stale') {
      return {
        status: 'stale',
        ageDays: classified.meta?.days ?? 0,
        maxUpdatedAgeDays: 7,
        updatedAt: 0,
        source,
      };
    }
    return classified.code === 'profile_not_generated'
      ? { status: 'not_found', source }
      : { status: 'error', source };
  }
  function updateMultiPreviewMode(
    expectedUid: number,
    mode: GameMode,
    entry: TarkovDevModeFetchStatus
  ): boolean {
    if (multiPreview.value?.tarkovUid !== expectedUid) return false;
    const nextPreview: TarkovDevMultiModePreview = {
      ...multiPreview.value,
      modes: { ...multiPreview.value.modes, [mode]: entry },
    };
    multiPreview.value = nextPreview;
    syncPreviewDataFromMulti(nextPreview);
    return true;
  }
  async function refetchPreviewMode(
    mode: GameMode,
    options: TarkovDevProfileFetchOptions = {}
  ): Promise<boolean> {
    const current = multiPreview.value;
    if (!current || !isGameMode(mode)) return false;
    const modeSource = buildTarkovDevProfileSource(current.tarkovUid, mode);
    const minutes = getCooldownMinutes(modeSource);
    if (minutes > 0) {
      updateMultiPreviewMode(current.tarkovUid, mode, {
        status: 'cooldown',
        minutes,
        source: modeSource,
      });
      return false;
    }
    try {
      const json = await fetchProfileJson(modeSource, options);
      const parsed = parseTarkovDevProfile(json);
      const updatedEntry: TarkovDevModeFetchStatus = parsed.ok
        ? {
            status: 'ok',
            data: parsed.data,
            source: modeSource,
            ...(options.allowStale ? { staleAccepted: true } : {}),
          }
        : { status: 'error', source: modeSource };
      return updateMultiPreviewMode(current.tarkovUid, mode, updatedEntry) && parsed.ok;
    } catch (error) {
      updateMultiPreviewMode(
        current.tarkovUid,
        mode,
        classifyPreviewRefetchError(error, modeSource)
      );
      logger.error('[TarkovDevImport] Single-mode preview refetch error:', error);
      return false;
    }
  }
  async function ensureLevelThresholdsLoaded(isCurrent: () => boolean): Promise<boolean> {
    if (metadataStore.playerLevels.length === 0) await fetchLevelThresholds();
    if (!isCurrent()) return false;
    if (metadataStore.playerLevels.length > 0) return true;
    setCodedError('Player level thresholds are unavailable', 'level_thresholds_unavailable', null);
    return false;
  }
  async function applyModeInBatch(
    mode: GameMode,
    data: TarkovDevImportResult,
    isCurrent: () => boolean,
    editionOverride?: number | null
  ): Promise<boolean> {
    if (tarkovStore.getCurrentGameMode() !== mode) await tarkovStore.switchGameMode(mode);
    if (!isCurrent() || tarkovStore.getCurrentGameMode() !== mode) return false;
    applyImportData(data, editionOverride);
    const saveError = await saveImport(data.tarkovUid);
    if (!isCurrent()) return false;
    if (saveError) {
      setCodedError('Failed to save import data', saveError, null);
      return false;
    }
    recordImportCompletion(data.tarkovUid, mode, cooldownMs);
    return true;
  }
  type ReadyBatchEntry = {
    mode: GameMode;
    entry: Extract<TarkovDevModeFetchStatus, { status: 'ok' }>;
  };
  function collectReadyBatchEntries(
    current: TarkovDevMultiModePreview | null,
    targetModes: GameMode[]
  ): ReadyBatchEntry[] {
    if (!current) return [];
    return targetModes
      .filter(isGameMode)
      .map((mode) => ({ mode, entry: current.modes[mode] }))
      .filter((item): item is ReadyBatchEntry => item.entry?.status === 'ok');
  }
  async function runMultiImportBatch(
    readyEntries: ReadyBatchEntry[],
    isCurrent: () => boolean,
    editionOverride?: number | null
  ): Promise<GameMode[]> {
    const importedModes: GameMode[] = [];
    if (!(await ensureLevelThresholdsLoaded(isCurrent))) return importedModes;
    for (const { mode, entry } of readyEntries) {
      if (!isCurrent()) return importedModes;
      const ok = await applyModeInBatch(mode, entry.data, isCurrent, editionOverride);
      if (!ok) return importedModes;
      importedModes.push(mode);
    }
    if (isCurrent() && importedModes.length > 0) importState.value = 'success';
    return importedModes;
  }
  async function confirmMultiImport(
    targetModes: GameMode[],
    editionOverride?: number | null
  ): Promise<GameMode[]> {
    if (isImporting.value) return [];
    const readyEntries = collectReadyBatchEntries(multiPreview.value, targetModes);
    if (readyEntries.length === 0) return [];
    const requestId = profileUrlRequestId;
    const ownerId = getCurrentSupabaseUserId();
    const ownsGeneration = captureStartupOwnership();
    const ownsSession = () =>
      ownsGeneration() &&
      getCurrentSupabaseUserId() === ownerId &&
      $supabase.user.loggedIn === (ownerId !== null);
    const isCurrent = () => ownsSession() && isCurrentRequest(requestId);
    isImporting.value = true;
    const originalMode = tarkovStore.getCurrentGameMode();
    try {
      return await runMultiImportBatch(readyEntries, isCurrent, editionOverride);
    } catch (e) {
      if (isCurrent()) {
        importState.value = 'error';
        importError.value = 'Failed to apply import data';
        logger.error('[TarkovDevImport] Multi-mode import error:', e);
      }
      return [];
    } finally {
      if (ownsSession() && tarkovStore.getCurrentGameMode() !== originalMode) {
        await restoreGameMode(originalMode);
      }
      isImporting.value = false;
    }
  }
  return {
    isImporting,
    importState,
    previewData,
    multiPreview,
    importError,
    importErrorCode,
    importErrorMeta,
    parseFile,
    parseProfileUrl,
    parseProfileModes,
    refetchPreviewMode,
    confirmImport,
    confirmMultiImport,
    setError,
    reset,
  };
}
