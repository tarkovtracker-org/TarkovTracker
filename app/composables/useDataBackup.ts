import { useAnalyticsConsent, type AnalyticsConsentState } from '@/composables/useAnalyticsConsent';
import {
  migrateToGameModeStructure,
  type UserProgressData,
  type UserState,
} from '@/stores/progressState';
import { cloneStateSnapshot } from '@/stores/tarkov/localStorage';
import {
  getPersistedPreferencesState,
  preferencesDefaultState,
  type TaskFilterPreset,
  type TaskFilterSettings,
  type PersistedPreferencesState,
  usePreferencesStore,
} from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import { sanitizeOwnedProgressData, sanitizeOwnedUserState } from '@/utils/progressSanitizers';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
const BACKUP_FORMAT = 'tarkovtracker-backup' as const;
const DEBUG_EXPORT_FORMAT = 'tarkovtracker-debug-export' as const;
const SUPPORTED_VERSIONS = [1] as const;
type GameMode = 'pvp' | 'pve';
type Faction = 'USEC' | 'BEAR';
interface TarkovTrackerExport {
  _format: typeof BACKUP_FORMAT;
  _version: number;
  exportedAt: number;
  appVersion: string;
  currentGameMode: GameMode;
  gameEdition: number;
  tarkovUid: number | null;
  pvp: UserProgressData;
  pve: UserProgressData;
}
interface DebugExportAuthContext {
  loggedIn: boolean;
  provider: string | null;
  providers: string[];
  userIdFingerprint: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  hasAuthSessionHint: boolean;
}
interface DebugExportRuntimeContext {
  path: string;
  query: string;
  hash: string;
  language: string | null;
  languages: string[];
  timeZone: string | null;
  userAgent: string | null;
}
interface DebugExportStorageSnapshot<T> {
  storageKey: string;
  format: 'scoped' | 'legacy' | 'unparseable';
  ownerUserFingerprint: string | null;
  ownerMatchesCurrentUser: boolean | null;
  timestamp: number | null;
  data: T | null;
  rawSize: number;
}
interface DebugExportStorageContext {
  authStorageKeyCount: number;
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  progress: DebugExportStorageSnapshot<UserState> | null;
  preferences: DebugExportStorageSnapshot<PersistedPreferencesState> | null;
  progressBackups: Array<{
    storageKey: string;
    ownerFingerprint: string | null;
    createdAt: number | null;
  }>;
}
interface DebugExportPayload {
  _format: typeof DEBUG_EXPORT_FORMAT;
  _version: number;
  exportedAt: number;
  appVersion: string;
  auth: DebugExportAuthContext;
  runtime: DebugExportRuntimeContext;
  state: {
    tarkov: UserState;
    preferences: PersistedPreferencesState;
    analyticsConsent: AnalyticsConsentState;
  };
  storage: DebugExportStorageContext;
}
export interface BackupPreviewData {
  exportedAt: number;
  appVersion: string;
  gameEdition: number;
  tarkovUid: number | null;
  pvp: {
    level: number;
    faction: Faction;
    displayName: string | null;
    taskCount: number;
    prestigeLevel: number;
  };
  pve: {
    level: number;
    faction: Faction;
    displayName: string | null;
    taskCount: number;
    prestigeLevel: number;
  };
}
export type BackupImportState = 'idle' | 'preview' | 'success' | 'error';
type BackupImportTargetModes = { pvp: boolean; pve: boolean };
export interface UseDataBackupReturn {
  exportProgress: () => Promise<void>;
  exportError: Ref<string | null>;
  exportDebugSnapshot: () => Promise<void>;
  debugExportError: Ref<string | null>;
  importState: Ref<BackupImportState>;
  importPreview: Ref<BackupPreviewData | null>;
  importError: Ref<string | null>;
  parseBackupFile: (file: File) => Promise<void>;
  confirmBackupImport: (targetModes: BackupImportTargetModes) => Promise<void>;
  resetImport: () => void;
}
const ALLOWED_PROGRESS_KEYS = new Set([
  'level',
  'pmcFaction',
  'displayName',
  'xpOffset',
  'taskCompletions',
  'taskObjectives',
  'hideoutParts',
  'hideoutModules',
  'traders',
  'skills',
  'prestigeLevel',
  'progressEpoch',
  'skillOffsets',
  'storyChapters',
]);
const VALID_FACTIONS = new Set<Faction>(['USEC', 'BEAR']);
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function getDefaultTaskFilterSettings(): TaskFilterSettings {
  return {
    taskPrimaryView:
      preferencesDefaultState.taskPrimaryView as TaskFilterSettings['taskPrimaryView'],
    taskMapView: preferencesDefaultState.taskMapView,
    taskTraderView: preferencesDefaultState.taskTraderView,
    taskSecondaryView:
      preferencesDefaultState.taskSecondaryView as TaskFilterSettings['taskSecondaryView'],
    taskUserView: preferencesDefaultState.taskUserView,
    taskSortMode: preferencesDefaultState.taskSortMode,
    taskSortDirection: preferencesDefaultState.taskSortDirection,
    taskSharedByAllOnly: preferencesDefaultState.taskSharedByAllOnly,
    hideGlobalTasks: preferencesDefaultState.hideGlobalTasks,
    hideNonKappaTasks: preferencesDefaultState.hideNonKappaTasks,
    showNonSpecialTasks: preferencesDefaultState.showNonSpecialTasks,
    showLightkeeperTasks: preferencesDefaultState.showLightkeeperTasks,
    onlyTasksWithRequiredKeys: preferencesDefaultState.onlyTasksWithRequiredKeys,
    respectTaskFiltersForImpact: preferencesDefaultState.respectTaskFiltersForImpact,
    showAllFilter: preferencesDefaultState.showAllFilter,
    showAvailableFilter: preferencesDefaultState.showAvailableFilter,
    showLockedFilter: preferencesDefaultState.showLockedFilter,
    showCompletedFilter: preferencesDefaultState.showCompletedFilter,
    showFailedFilter: preferencesDefaultState.showFailedFilter,
  };
}
function toProgressEpoch(data: UserProgressData | undefined): number {
  if (!data || typeof data.progressEpoch !== 'number' || !Number.isFinite(data.progressEpoch)) {
    return 0;
  }
  return Math.max(0, Math.trunc(data.progressEpoch));
}
function createImportedProgressData(
  importedData: UserProgressData,
  currentData: UserProgressData | undefined
): UserProgressData {
  return {
    ...cloneStateSnapshot(importedData),
    progressEpoch: Math.min(
      2147483647,
      Math.max(toProgressEpoch(importedData), toProgressEpoch(currentData)) + 1
    ),
  };
}
function sanitizeProgressData(
  raw: unknown
): { ok: true; data: UserProgressData } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Progress data must be an object' };
  }
  if (!VALID_FACTIONS.has(raw.pmcFaction as Faction)) {
    return { ok: false, error: 'Invalid faction — must be USEC or BEAR' };
  }
  const dictFields = [
    'taskCompletions',
    'taskObjectives',
    'hideoutParts',
    'hideoutModules',
    'traders',
    'skills',
    'skillOffsets',
    'storyChapters',
  ] as const;
  for (const field of dictFields) {
    if (raw[field] !== undefined && !isPlainObject(raw[field])) {
      return { ok: false, error: `Field "${field}" must be an object` };
    }
  }
  const stripped: Record<string, unknown> = {};
  for (const key of ALLOWED_PROGRESS_KEYS) {
    if (key in raw) {
      stripped[key] = raw[key];
    }
  }
  return {
    ok: true,
    data: sanitizeOwnedProgressData(stripped),
  };
}
function validateBackup(json: unknown):
  | {
      ok: true;
      data: { export: TarkovTrackerExport; pvp: UserProgressData; pve: UserProgressData };
    }
  | { ok: false; error: string } {
  if (!isPlainObject(json)) {
    return { ok: false, error: 'Invalid file format — expected a JSON object' };
  }
  if (json._format !== BACKUP_FORMAT) {
    return { ok: false, error: 'Invalid file format — not a TarkovTracker backup' };
  }
  if (!SUPPORTED_VERSIONS.includes(json._version as (typeof SUPPORTED_VERSIONS)[number])) {
    return { ok: false, error: `Unsupported backup version: ${json._version}` };
  }
  if (json.currentGameMode !== 'pvp' && json.currentGameMode !== 'pve') {
    return { ok: false, error: 'Invalid currentGameMode — must be "pvp" or "pve"' };
  }
  const edition = json.gameEdition;
  if (typeof edition !== 'number' || !Number.isInteger(edition) || edition < 1 || edition > 6) {
    return { ok: false, error: 'Invalid gameEdition — must be integer 1-6' };
  }
  if (
    json.tarkovUid !== null &&
    (typeof json.tarkovUid !== 'number' || !Number.isFinite(json.tarkovUid))
  ) {
    return { ok: false, error: 'Invalid tarkovUid — must be a number or null' };
  }
  const pvpResult = sanitizeProgressData(json.pvp);
  if (!pvpResult.ok) {
    return { ok: false, error: `PvP data: ${pvpResult.error}` };
  }
  const pveResult = sanitizeProgressData(json.pve);
  if (!pveResult.ok) {
    return { ok: false, error: `PvE data: ${pveResult.error}` };
  }
  return {
    ok: true,
    data: {
      export: json as unknown as TarkovTrackerExport,
      pvp: pvpResult.data,
      pve: pveResult.data,
    },
  };
}
function buildPreview(
  exportData: TarkovTrackerExport,
  pvp: UserProgressData,
  pve: UserProgressData
): BackupPreviewData {
  const modePreview = (data: UserProgressData) => ({
    level: data.level,
    faction: data.pmcFaction,
    displayName: data.displayName,
    taskCount: Object.keys(data.taskCompletions).length,
    prestigeLevel: data.prestigeLevel,
  });
  return {
    exportedAt: exportData.exportedAt,
    appVersion: exportData.appVersion,
    gameEdition: exportData.gameEdition,
    tarkovUid: exportData.tarkovUid,
    pvp: modePreview(pvp),
    pve: modePreview(pve),
  };
}
function stripInternalSyncMetadata(data: UserProgressData): UserProgressData {
  const { apiUpdateHistory: _, lastApiUpdate: __, ...rest } = data;
  return sanitizeOwnedProgressData(rest);
}
async function fingerprintValue(value: string | number | null | undefined): Promise<string | null> {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalizedValue = String(value);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.subtle) {
    const digest = await cryptoApi.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(normalizedValue)
    );
    return `sha256:${Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')}`;
  }
  let hash = 2166136261;
  for (const char of normalizedValue) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
async function sanitizeTaskUserView(value: string | null): Promise<string | null> {
  if (!value || value === 'all' || value === 'self') {
    return value;
  }
  const fingerprint = await fingerprintValue(value);
  return fingerprint ? `user:${fingerprint}` : null;
}
async function sanitizePreferencesForDebug(
  state: PersistedPreferencesState
): Promise<PersistedPreferencesState> {
  const sanitizedState = cloneStateSnapshot(state);
  const rawTeamHide = isPlainObject(sanitizedState.teamHide) ? sanitizedState.teamHide : {};
  const teamHideEntries = await Promise.all(
    Object.entries(rawTeamHide).map(async ([teamId, hidden]) => {
      const fingerprint = await fingerprintValue(teamId);
      return [fingerprint ? `user:${fingerprint}` : 'user:unknown', hidden] as const;
    })
  );
  sanitizedState.teamHide = Object.fromEntries(teamHideEntries);
  sanitizedState.taskUserView = await sanitizeTaskUserView(sanitizedState.taskUserView ?? null);
  const rawTaskFilterPresets = Array.isArray(
    (sanitizedState as Record<string, unknown>).taskFilterPresets
  )
    ? ((sanitizedState as Record<string, unknown>).taskFilterPresets as unknown[])
    : null;
  if (!rawTaskFilterPresets) {
    sanitizedState.taskFilterPresets = [];
    return sanitizedState;
  }
  sanitizedState.taskFilterPresets = await Promise.all(
    rawTaskFilterPresets.map(async (preset, index): Promise<TaskFilterPreset> => {
      const sanitizedPreset = isPlainObject(preset) ? preset : null;
      const sanitizedSettings = isPlainObject(sanitizedPreset?.settings)
        ? sanitizedPreset.settings
        : {};
      return {
        id:
          typeof sanitizedPreset?.id === 'string' && sanitizedPreset.id.length > 0
            ? sanitizedPreset.id
            : `preset-${index + 1}`,
        name: `Preset ${index + 1}`,
        settings: {
          ...getDefaultTaskFilterSettings(),
          ...sanitizedSettings,
          taskUserView: await sanitizeTaskUserView(
            typeof sanitizedSettings.taskUserView === 'string'
              ? sanitizedSettings.taskUserView
              : null
          ),
        },
      };
    })
  );
  return sanitizedState;
}
function normalizePreferencesForDebug(value: unknown): PersistedPreferencesState {
  if (!isPlainObject(value)) {
    throw new Error('Persisted preferences state must be an object');
  }
  return getPersistedPreferencesState(value);
}
function sanitizeProgressForDebug(data: UserProgressData): UserProgressData {
  const sanitizedData = stripInternalSyncMetadata(cloneStateSnapshot(data));
  sanitizedData.displayName = null;
  return sanitizedData;
}
async function sanitizeTarkovStateForDebug(state: unknown): Promise<UserState> {
  if (!isPlainObject(state)) {
    throw new Error('Persisted progress state must be an object');
  }
  const clonedState = sanitizeOwnedUserState(migrateToGameModeStructure(cloneStateSnapshot(state)));
  clonedState.tarkovUid = null;
  clonedState.pvp = sanitizeProgressForDebug(clonedState.pvp);
  clonedState.pve = sanitizeProgressForDebug(clonedState.pve);
  return clonedState;
}
function getStorageKeys(storage: Storage | null): string[] {
  if (!storage) {
    return [];
  }
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) {
      keys.push(key);
    }
  }
  return keys;
}
function isSupabaseAuthStorageKey(key: string): boolean {
  return key.endsWith('-auth-token') || key.endsWith('-code-verifier');
}
async function sanitizeStorageKey(key: string): Promise<string> {
  if (
    key.startsWith(STORAGE_KEYS.progressBackupPrefix) ||
    key.startsWith(LEGACY_STORAGE_KEYS.progressBackupPrefix)
  ) {
    const prefix = key.startsWith(STORAGE_KEYS.progressBackupPrefix)
      ? STORAGE_KEYS.progressBackupPrefix
      : LEGACY_STORAGE_KEYS.progressBackupPrefix;
    const suffix = key.slice(prefix.length);
    const separatorIndex = suffix.lastIndexOf('_');
    const owner = separatorIndex >= 0 ? suffix.slice(0, separatorIndex) : suffix;
    const createdAtRaw = separatorIndex >= 0 ? suffix.slice(separatorIndex + 1) : '';
    const ownerFingerprint =
      owner === 'anonymous' ? 'anonymous' : ((await fingerprintValue(owner)) ?? 'unknown');
    const createdAt = Number.parseInt(createdAtRaw, 10);
    return `${prefix}{owner:${ownerFingerprint},createdAt:${
      Number.isFinite(createdAt) ? createdAt : 'unknown'
    }}`;
  }
  return key;
}
async function sanitizeStorageKeys(storage: Storage | null): Promise<string[]> {
  const keys = getStorageKeys(storage).filter((key) => !isSupabaseAuthStorageKey(key));
  return await Promise.all(keys.map((key) => sanitizeStorageKey(key)));
}
async function buildProgressBackupSnapshots(
  storage: Storage | null
): Promise<DebugExportStorageContext['progressBackups']> {
  const backupKeys = getStorageKeys(storage).filter(
    (key) =>
      key.startsWith(STORAGE_KEYS.progressBackupPrefix) ||
      key.startsWith(LEGACY_STORAGE_KEYS.progressBackupPrefix)
  );
  return await Promise.all(
    backupKeys.map(async (key) => {
      const prefix = key.startsWith(STORAGE_KEYS.progressBackupPrefix)
        ? STORAGE_KEYS.progressBackupPrefix
        : LEGACY_STORAGE_KEYS.progressBackupPrefix;
      const suffix = key.slice(prefix.length);
      const separatorIndex = suffix.lastIndexOf('_');
      const owner = separatorIndex >= 0 ? suffix.slice(0, separatorIndex) : suffix;
      const createdAtRaw = separatorIndex >= 0 ? suffix.slice(separatorIndex + 1) : '';
      const createdAt = Number.parseInt(createdAtRaw, 10);
      return {
        storageKey: await sanitizeStorageKey(key),
        ownerFingerprint: owner === 'anonymous' ? 'anonymous' : await fingerprintValue(owner),
        createdAt: Number.isFinite(createdAt) ? createdAt : null,
      };
    })
  );
}
async function buildProgressStorageSnapshot(
  rawValue: string | null,
  currentUserId: string | null
): Promise<DebugExportStorageSnapshot<UserState> | null> {
  if (!rawValue) {
    return null;
  }
  const rawSize = rawValue.length;
  const wrapped = parseUserScopedStorage<UserState>(rawValue);
  if (wrapped) {
    try {
      return {
        storageKey: STORAGE_KEYS.progress,
        format: 'scoped',
        ownerUserFingerprint: await fingerprintValue(wrapped._userId),
        ownerMatchesCurrentUser:
          currentUserId === null ? wrapped._userId === null : wrapped._userId === currentUserId,
        timestamp: wrapped._timestamp ?? null,
        data: await sanitizeTarkovStateForDebug(wrapped.data),
        rawSize,
      };
    } catch {
      return {
        storageKey: STORAGE_KEYS.progress,
        format: 'unparseable',
        ownerUserFingerprint: await fingerprintValue(wrapped._userId),
        ownerMatchesCurrentUser:
          currentUserId === null ? wrapped._userId === null : wrapped._userId === currentUserId,
        timestamp: wrapped._timestamp ?? null,
        data: null,
        rawSize,
      };
    }
  }
  try {
    return {
      storageKey: STORAGE_KEYS.progress,
      format: 'legacy',
      ownerUserFingerprint: null,
      ownerMatchesCurrentUser: null,
      timestamp: null,
      data: await sanitizeTarkovStateForDebug(JSON.parse(rawValue) as UserState),
      rawSize,
    };
  } catch {
    return {
      storageKey: STORAGE_KEYS.progress,
      format: 'unparseable',
      ownerUserFingerprint: null,
      ownerMatchesCurrentUser: null,
      timestamp: null,
      data: null,
      rawSize,
    };
  }
}
async function buildPreferencesStorageSnapshot(
  rawValue: string | null,
  currentUserId: string | null
): Promise<DebugExportStorageSnapshot<PersistedPreferencesState> | null> {
  if (!rawValue) {
    return null;
  }
  const rawSize = rawValue.length;
  const wrapped = parseUserScopedStorage<PersistedPreferencesState>(rawValue);
  if (wrapped) {
    try {
      return {
        storageKey: STORAGE_KEYS.preferences,
        format: 'scoped',
        ownerUserFingerprint: await fingerprintValue(wrapped._userId),
        ownerMatchesCurrentUser:
          currentUserId === null ? wrapped._userId === null : wrapped._userId === currentUserId,
        timestamp: wrapped._timestamp ?? null,
        data: await sanitizePreferencesForDebug(normalizePreferencesForDebug(wrapped.data)),
        rawSize,
      };
    } catch {
      return {
        storageKey: STORAGE_KEYS.preferences,
        format: 'unparseable',
        ownerUserFingerprint: await fingerprintValue(wrapped._userId),
        ownerMatchesCurrentUser:
          currentUserId === null ? wrapped._userId === null : wrapped._userId === currentUserId,
        timestamp: wrapped._timestamp ?? null,
        data: null,
        rawSize,
      };
    }
  }
  try {
    return {
      storageKey: STORAGE_KEYS.preferences,
      format: 'legacy',
      ownerUserFingerprint: null,
      ownerMatchesCurrentUser: null,
      timestamp: null,
      data: await sanitizePreferencesForDebug(normalizePreferencesForDebug(JSON.parse(rawValue))),
      rawSize,
    };
  } catch {
    return {
      storageKey: STORAGE_KEYS.preferences,
      format: 'unparseable',
      ownerUserFingerprint: null,
      ownerMatchesCurrentUser: null,
      timestamp: null,
      data: null,
      rawSize,
    };
  }
}
async function downloadJsonFile(filenamePrefix: string, payload: unknown): Promise<void> {
  let url: string | null = null;
  try {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filenamePrefix}-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
export function useDataBackup(): UseDataBackupReturn {
  const tarkovStore = useTarkovStore();
  const preferencesStore = usePreferencesStore();
  const analyticsConsent = useAnalyticsConsent();
  const { $supabase } = useNuxtApp();
  const exportError = ref<string | null>(null);
  const debugExportError = ref<string | null>(null);
  const importState = ref<BackupImportState>('idle');
  const importPreview = ref<BackupPreviewData | null>(null);
  const importError = ref<string | null>(null);
  let parsedPvp: UserProgressData | null = null;
  let parsedPve: UserProgressData | null = null;
  let parsedExport: TarkovTrackerExport | null = null;
  function resetImport(): void {
    importState.value = 'idle';
    importPreview.value = null;
    importError.value = null;
    parsedPvp = null;
    parsedPve = null;
    parsedExport = null;
  }
  async function exportProgress(): Promise<void> {
    exportError.value = null;
    try {
      const runtimeConfig = useRuntimeConfig();
      const pvpData = stripInternalSyncMetadata(
        cloneStateSnapshot(tarkovStore.getPvPProgressData())
      );
      const pveData = stripInternalSyncMetadata(
        cloneStateSnapshot(tarkovStore.getPvEProgressData())
      );
      const backup: TarkovTrackerExport = {
        _format: BACKUP_FORMAT,
        _version: 1,
        exportedAt: Date.now(),
        appVersion: String(runtimeConfig.public.appVersion ?? 'unknown'),
        currentGameMode: tarkovStore.getCurrentGameMode(),
        gameEdition: tarkovStore.getGameEdition(),
        tarkovUid: tarkovStore.getTarkovUid(),
        pvp: pvpData,
        pve: pveData,
      };
      await downloadJsonFile('tarkovtracker-backup', backup);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      exportError.value = `Failed to export backup: ${detail}`;
      logger.error('[DataBackup] Export error:', error);
      throw error instanceof Error ? error : new Error(detail);
    }
  }
  async function exportDebugSnapshot(): Promise<void> {
    debugExportError.value = null;
    try {
      const runtimeConfig = useRuntimeConfig();
      const currentUserId = $supabase.user.id ?? null;
      const currentPreferences = await sanitizePreferencesForDebug(
        getPersistedPreferencesState(preferencesStore.$state)
      );
      const rawProgressStorage =
        localStorage.getItem(STORAGE_KEYS.progress) ??
        localStorage.getItem(LEGACY_STORAGE_KEYS.progress);
      const rawPreferencesStorage =
        localStorage.getItem(STORAGE_KEYS.preferences) ??
        localStorage.getItem(LEGACY_STORAGE_KEYS.preferences);
      const authStorageKeyCount = getStorageKeys(localStorage).filter((key) =>
        isSupabaseAuthStorageKey(key)
      ).length;
      const debugPayload: DebugExportPayload = {
        _format: DEBUG_EXPORT_FORMAT,
        _version: 1,
        exportedAt: Date.now(),
        appVersion: String(runtimeConfig.public.appVersion ?? 'unknown'),
        auth: {
          loggedIn: $supabase.user.loggedIn,
          provider: $supabase.user.provider ?? null,
          providers: Array.isArray($supabase.user.providers) ? [...$supabase.user.providers] : [],
          userIdFingerprint: await fingerprintValue(currentUserId),
          createdAt: $supabase.user.createdAt ?? null,
          lastLoginAt: $supabase.user.lastLoginAt ?? null,
          hasAuthSessionHint: authStorageKeyCount > 0,
        },
        runtime: {
          path: window.location.pathname,
          query: window.location.search,
          hash: window.location.hash,
          language: navigator.language ?? null,
          languages: Array.isArray(navigator.languages) ? [...navigator.languages] : [],
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
          userAgent: navigator.userAgent ?? null,
        },
        state: {
          tarkov: await sanitizeTarkovStateForDebug(tarkovStore.$state),
          preferences: currentPreferences,
          analyticsConsent: cloneStateSnapshot(analyticsConsent.state.value),
        },
        storage: {
          authStorageKeyCount,
          localStorageKeys: await sanitizeStorageKeys(localStorage),
          sessionStorageKeys: await sanitizeStorageKeys(sessionStorage),
          progress: await buildProgressStorageSnapshot(rawProgressStorage, currentUserId),
          preferences: await buildPreferencesStorageSnapshot(rawPreferencesStorage, currentUserId),
          progressBackups: await buildProgressBackupSnapshots(localStorage),
        },
      };
      await downloadJsonFile('tarkovtracker-debug-export', debugPayload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      debugExportError.value = `Failed to export debug snapshot: ${detail}`;
      logger.error('[DataBackup] Debug export error:', error);
      throw error instanceof Error ? error : new Error(detail);
    }
  }
  async function parseBackupFile(file: File): Promise<void> {
    importError.value = null;
    const MAX_BACKUP_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_BACKUP_SIZE) {
      importState.value = 'error';
      importError.value = 'Backup file is too large (max 5 MB)';
      return;
    }
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        importState.value = 'error';
        importError.value = 'Failed to parse JSON — file may be corrupted';
        return;
      }
      const result = validateBackup(json);
      if (!result.ok) {
        importState.value = 'error';
        importError.value = result.error;
        return;
      }
      parsedPvp = result.data.pvp;
      parsedPve = result.data.pve;
      parsedExport = result.data.export;
      importPreview.value = buildPreview(result.data.export, result.data.pvp, result.data.pve);
      importState.value = 'preview';
    } catch (e) {
      importState.value = 'error';
      importError.value = 'Failed to read backup file';
      logger.error('[DataBackup] Parse error:', e);
    }
  }
  async function confirmBackupImport(targetModes: BackupImportTargetModes): Promise<void> {
    if (importState.value !== 'preview' || !parsedPvp || !parsedPve || !parsedExport) {
      return;
    }
    try {
      const pvpData = parsedPvp;
      const pveData = parsedPve;
      const exportData = parsedExport;
      const importPvp = targetModes.pvp;
      const importPve = targetModes.pve;
      const importBoth = importPvp && importPve;
      if (!importPvp && !importPve) {
        return;
      }
      tarkovStore.$patch((state: UserState) => {
        if (importPvp) {
          state.pvp = createImportedProgressData(pvpData, state.pvp);
        }
        if (importPve) {
          state.pve = createImportedProgressData(pveData, state.pve);
        }
        if (importBoth) {
          state.gameEdition = exportData.gameEdition;
          state.tarkovUid = exportData.tarkovUid;
          state.currentGameMode = exportData.currentGameMode;
        } else if (importPvp) {
          state.currentGameMode = 'pvp';
        } else if (importPve) {
          state.currentGameMode = 'pve';
        }
      });
      importState.value = 'success';
    } catch (e) {
      importState.value = 'error';
      importError.value = 'Failed to apply backup data';
      logger.error('[DataBackup] Import error:', e);
    }
  }
  return {
    exportProgress,
    exportError,
    exportDebugSnapshot,
    debugExportError,
    importState,
    importPreview,
    importError,
    parseBackupFile,
    confirmBackupImport,
    resetImport,
  };
}
