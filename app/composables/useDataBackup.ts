import { useI18n } from 'vue-i18n';
import { useAnalyticsConsent, type AnalyticsConsentState } from '@/composables/useAnalyticsConsent';
import {
  migrateToGameModeStructure,
  type UserProgressData,
  type UserState,
} from '@/stores/progressState';
import { areActiveProgressWritesBlocked, cloneStateSnapshot } from '@/stores/tarkov/localStorage';
import {
  readCommittedProgressAuthority,
  ownedLegacyUpdates,
  isOwnedProgressRecovery,
  legacyProgressRecoveryCount,
  discardExportedLegacyProgress,
  exportableLegacyUpdates,
  legacyProgressRecoveryOverflow,
} from '@/stores/tarkov/progressAuthority';
import { hasRetainableModeProgress } from '@/stores/tarkov/progressMerge';
import {
  isRestorableSupersededCopy,
  listSupersededProgressCopies,
  removeSupersededProgressCopy,
  saveSupersededProgressCopies,
  saveSupersededProgressCopy,
  type SupersededCopyInput,
  type SupersededProgressCopy,
} from '@/stores/tarkov/supersededProgress';
import { useMetadataStore } from '@/stores/useMetadata';
import {
  getPersistedPreferencesState,
  preferencesDefaultState,
  type TaskFilterPreset,
  type TaskFilterSettings,
  type PersistedPreferencesState,
  usePreferencesStore,
} from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import { createBackupImportClient, BackupImportCancelled } from '@/utils/backup/importClient';
import {
  BACKUP_FORMAT,
  SUPERSEDED_ARCHIVE_FORMAT,
  MAX_RECOVERY_ARCHIVE_SIZE,
  MAX_RECOVERY_OLDER_ENTRIES,
  DEBUG_EXPORT_FORMAT,
  isBackupObject,
  validateBackup,
  selectOlderTabRaw,
  parseRecoveryProgress,
  buildPreview,
  type BackupPreviewData,
  type BackupImportTargetModes,
  type RecoveryArchiveEntry,
  type TarkovTrackerExport,
  type RecoveryArchiveResult,
  type SupersededArchiveCopy,
} from '@/utils/backup/parsing';
import { ACTIVE_SEASON_NUMBER, GAME_MODES, type GameMode } from '@/utils/constants';
import { buildDebugTaskSummary, type DebugTaskSummary } from '@/utils/debugTaskSummary';
import { logger } from '@/utils/logger';
import { sanitizeOwnedProgressData, sanitizeOwnedUserState } from '@/utils/progressSanitizers';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
import type { BackupReply, BackupMetadata } from '@/utils/backup/importSession';
export type {
  BackupPreviewData,
  BackupImportTargetModes,
  RecoveryArchiveEntry,
} from '@/utils/backup/parsing';
export type BackupImportState = 'idle' | 'parsing' | 'preview' | 'success' | 'error';
export type RecoveryCopiesImport = { added: number; alreadyPresent: number };
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
  summary: DebugTaskSummary;
}
export interface UseDataBackupReturn {
  exportProgress: () => Promise<void>;
  /** Downloads one of the signed-in owner's superseded copies, or all of them without an id. */
  exportSupersededProgress: (copyId?: string) => Promise<void>;
  /** Replaces one mode with a superseded copy after keeping that mode's current progress as a copy. */
  restoreSupersededProgress: (copyId: string) => void;
  discardSupersededProgress: (copyId: string) => void;
  /** Outcome of the last restored superseded-progress file, whose copies join this browser's list. */
  recoveryCopiesImport: Ref<RecoveryCopiesImport | null>;
  exportDeviceProgressRecovery: () => Promise<void>;
  confirmRecoveryArchiveSaved: () => Promise<void>;
  recoveryExportPending: Ref<boolean>;
  recoveryArchiveEntries: Ref<RecoveryArchiveEntry[]>;
  selectedRecoveryArchiveEntry: Ref<number | null>;
  reviewRecoveryArchiveEntry: (index: number) => Promise<void>;
  legacyProgressRecoveryCount: Ref<number>;
  legacyProgressRecoveryOverflow: Ref<boolean>;
  reviewOlderTabProgress: (index: number) => Promise<void>;
  exportError: Ref<string | null>;
  exportDebugSnapshot: () => Promise<void>;
  serializeDebugSnapshot: () => Promise<string>;
  debugExportError: Ref<string | null>;
  importState: Ref<BackupImportState>;
  importPreview: Ref<BackupPreviewData | null>;
  importError: Ref<string | null>;
  parseBackupFile: (file: File) => Promise<void>;
  confirmBackupImport: (targetModes: BackupImportTargetModes) => Promise<void>;
  resetImport: () => void;
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
function stripInternalSyncMetadata(data: UserProgressData): UserProgressData {
  const {
    apiUpdateHistory: _,
    lastApiUpdate: __,
    manualActivityHistory: ___,
    manualActivityEpoch: ____,
    ...rest
  } = data;
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
  const rawTeamHide = isBackupObject(sanitizedState.teamHide) ? sanitizedState.teamHide : {};
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
      const sanitizedPreset = isBackupObject(preset) ? preset : null;
      const sanitizedSettings = isBackupObject(sanitizedPreset?.settings)
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
  if (!isBackupObject(value)) {
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
  if (!isBackupObject(state)) {
    throw new Error('Persisted progress state must be an object');
  }
  const clonedState = sanitizeOwnedUserState(migrateToGameModeStructure(cloneStateSnapshot(state)));
  clonedState.tarkovUid = null;
  clonedState.pvp = sanitizeProgressForDebug(clonedState.pvp);
  clonedState.pve = sanitizeProgressForDebug(clonedState.pve);
  clonedState.seasonal = sanitizeProgressForDebug(clonedState.seasonal);
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
type ProgressBackupIdentity = { prefix: string; owner: string; createdAt: number | null };
function getProgressBackupIdentity(key: string): ProgressBackupIdentity | null {
  const prefix =
    key.startsWith(STORAGE_KEYS.progressBackupPrefix) ||
    key.startsWith(LEGACY_STORAGE_KEYS.progressBackupPrefix)
      ? key.startsWith(STORAGE_KEYS.progressBackupPrefix)
        ? STORAGE_KEYS.progressBackupPrefix
        : LEGACY_STORAGE_KEYS.progressBackupPrefix
      : null;
  if (!prefix) return null;
  const suffix = key.slice(prefix.length);
  const separatorIndex = suffix.lastIndexOf('_');
  const owner = separatorIndex >= 0 ? suffix.slice(0, separatorIndex) : suffix;
  const createdAtRaw = separatorIndex >= 0 ? suffix.slice(separatorIndex + 1) : '';
  const createdAt = Number.parseInt(createdAtRaw, 10);
  return { prefix, owner, createdAt: Number.isFinite(createdAt) ? createdAt : null };
}
async function sanitizeProgressBackupKey(key: string): Promise<string | null> {
  const identity = getProgressBackupIdentity(key);
  if (!identity) return null;
  const ownerFingerprint =
    identity.owner === 'anonymous'
      ? 'anonymous'
      : ((await fingerprintValue(identity.owner)) ?? 'unknown');
  return `${identity.prefix}{owner:${ownerFingerprint},createdAt:${
    identity.createdAt ?? 'unknown'
  }}`;
}
/** Keys named `${prefix}${userId}` keep their prefix with the owner fingerprinted. */
const OWNER_SUFFIXED_PREFIXES = [
  STORAGE_KEYS.progressRecoveryPrefix,
  STORAGE_KEYS.deviceDataRemovalIncompletePrefix,
];
async function sanitizeRecoveryKey(key: string): Promise<string | null> {
  const prefix = OWNER_SUFFIXED_PREFIXES.find((candidate) => key.startsWith(candidate));
  if (!prefix) return null;
  const owner = key.slice(prefix.length);
  return `${prefix}{owner:${(await fingerprintValue(owner)) ?? 'unknown'}}`;
}
async function sanitizeSupersededKey(key: string): Promise<string | null> {
  if (!key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) return null;
  const suffix = key.slice(STORAGE_KEYS.progressSupersededPrefix.length);
  const separatorIndex = suffix.indexOf('_');
  const owner = separatorIndex >= 0 ? suffix.slice(0, separatorIndex) : suffix;
  const copyId = separatorIndex >= 0 ? suffix.slice(separatorIndex + 1) : 'unknown';
  return `${STORAGE_KEYS.progressSupersededPrefix}{owner:${
    (await fingerprintValue(owner)) ?? 'unknown'
  },copy:${copyId}}`;
}
async function sanitizeStorageKey(key: string): Promise<string> {
  const backupKey = await sanitizeProgressBackupKey(key);
  if (backupKey) return backupKey;
  const recoveryKey = await sanitizeRecoveryKey(key);
  if (recoveryKey) return recoveryKey;
  const supersededKey = await sanitizeSupersededKey(key);
  return supersededKey ?? key;
}
async function sanitizeStorageKeys(storage: Storage | null): Promise<string[]> {
  const keys = getStorageKeys(storage).filter(
    (key) =>
      !isSupabaseAuthStorageKey(key) && !key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
  );
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
      const identity = getProgressBackupIdentity(key);
      if (!identity) throw new Error('Progress backup key is not recognized');
      return {
        storageKey: await sanitizeStorageKey(key),
        ownerFingerprint:
          identity.owner === 'anonymous' ? 'anonymous' : await fingerprintValue(identity.owner),
        createdAt: identity.createdAt,
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
type DebugAuthUser = {
  loggedIn: boolean;
  id?: string | null;
  provider?: string | null;
  providers?: unknown;
  createdAt?: string | null;
  lastLoginAt?: string | null;
};
const orNull = <T>(value: T | null | undefined): T | null => value ?? null;
const copyStrings = (value: unknown): string[] => (Array.isArray(value) ? [...value] : []);
async function buildDebugAuthContext(
  user: DebugAuthUser,
  authStorageKeyCount: number
): Promise<DebugExportAuthContext> {
  return {
    loggedIn: user.loggedIn,
    provider: orNull(user.provider),
    providers: copyStrings(user.providers),
    userIdFingerprint: await fingerprintValue(orNull(user.id)),
    createdAt: orNull(user.createdAt),
    lastLoginAt: orNull(user.lastLoginAt),
    hasAuthSessionHint: authStorageKeyCount > 0,
  };
}
function buildDebugRuntimeContext(): DebugExportRuntimeContext {
  return {
    path: window.location.pathname,
    // URL query and fragment values may contain credentials or private identifiers.
    query: '',
    hash: '',
    language: orNull(navigator.language),
    languages: copyStrings(navigator.languages),
    timeZone: orNull(Intl.DateTimeFormat().resolvedOptions().timeZone),
    userAgent: orNull(navigator.userAgent),
  };
}
async function readDebugProgressStorage(): Promise<string | null> {
  try {
    return (await readCommittedProgressAuthority(false)).raw;
  } catch (error) {
    logger.warn('[DataBackup] Progress authority unavailable for debug export:', error);
    return null;
  }
}
async function buildDebugStorageContext(
  currentUserId: string | null
): Promise<DebugExportStorageContext> {
  const rawPreferencesStorage =
    localStorage.getItem(STORAGE_KEYS.preferences) ??
    localStorage.getItem(LEGACY_STORAGE_KEYS.preferences);
  return {
    authStorageKeyCount: getStorageKeys(localStorage).filter(isSupabaseAuthStorageKey).length,
    localStorageKeys: await sanitizeStorageKeys(localStorage),
    sessionStorageKeys: await sanitizeStorageKeys(sessionStorage),
    progress: await buildProgressStorageSnapshot(await readDebugProgressStorage(), currentUserId),
    preferences: await buildPreferencesStorageSnapshot(rawPreferencesStorage, currentUserId),
    progressBackups: await buildProgressBackupSnapshots(localStorage),
  };
}
async function downloadJsonFile(
  filenamePrefix: string,
  payload: unknown,
  sizeLimit?: { bytes: number; error: string }
): Promise<void> {
  let url: string | null = null;
  try {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    if (sizeLimit && blob.size > sizeLimit.bytes) throw new Error(sizeLimit.error);
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
  const { t } = useI18n();
  const exportError = ref<string | null>(null);
  const debugExportError = ref<string | null>(null);
  const importState = ref<BackupImportState>('idle');
  const importPreview = ref<BackupPreviewData | null>(null);
  const importError = ref<string | null>(null);
  const recoveryExportPending = ref(false);
  const recoveryCopiesImport = ref<RecoveryCopiesImport | null>(null);
  let recoveryExportReceipt: { owner: string | null; copies: string[] } | null = null;
  const recoveryArchiveEntries = ref<RecoveryArchiveEntry[]>([]);
  const selectedRecoveryArchiveEntry = ref<number | null>(null);
  let importClient: ReturnType<typeof createBackupImportClient> | null = null;
  let importGeneration = 0;
  let workerOwner: string | null | undefined;
  let parsedPvp: UserProgressData | null = null;
  let parsedPve: UserProgressData | null = null;
  let parsedSeasonal: UserProgressData | null = null;
  let parsedExport: BackupMetadata | null = null;
  let previewOwner: string | null | undefined;
  function clearParsedImport(): void {
    importState.value = 'idle';
    importPreview.value = null;
    importError.value = null;
    parsedPvp = null;
    parsedPve = null;
    parsedSeasonal = null;
    parsedExport = null;
    previewOwner = undefined;
  }
  function resetImport(): void {
    importGeneration++;
    importClient?.cancel();
    importClient = null;
    workerOwner = undefined;
    clearParsedImport();
    recoveryArchiveEntries.value = [];
    selectedRecoveryArchiveEntry.value = null;
    recoveryCopiesImport.value = null;
  }
  function applyBackupPreview(value: unknown): void {
    const result = validateBackup(value);
    if (!result.ok) {
      importState.value = 'error';
      importError.value = result.error;
      return;
    }
    parsedPvp = result.data.pvp;
    parsedPve = result.data.pve;
    parsedSeasonal = result.data.seasonal;
    parsedExport = result.data.export;
    previewOwner = $supabase.user.id ?? null;
    importPreview.value = buildPreview(
      result.data.export,
      result.data.pvp,
      result.data.pve,
      result.data.seasonal
    );
    importState.value = 'preview';
  }
  function applyResolvedRecovery(resolved: RecoveryArchiveResult): void {
    if (!resolved.ok) {
      importState.value = 'error';
      importError.value = t(`settings.data_management.${resolved.error}`);
      return;
    }
    applyBackupPreview(resolved.value);
  }
  const currentImportOwner = (): string | null => $supabase.user.id ?? null;
  function rejectChangedImportOwner(): void {
    resetImport();
    importState.value = 'error';
    importError.value = t('settings.data_management.import_owner_changed');
  }
  function workerResultIsCurrent(generation: number, owner: string | null): boolean {
    if (generation !== importGeneration) return false;
    if (owner === currentImportOwner()) return true;
    rejectChangedImportOwner();
    return false;
  }
  function failImport(messageKey: string, params: Record<string, number> = {}): void {
    importState.value = 'error';
    importError.value = t(messageKey, params);
  }
  /** Skips ids already kept here and repeated ids within the same file. */
  function copiesNotYetKept(
    copies: SupersededArchiveCopy[],
    kept: SupersededProgressCopy[]
  ): SupersededArchiveCopy[] {
    const seen = new Set(kept.map((copy) => copy.id));
    return copies.filter((copy) => {
      if (copy.id === null) return true;
      if (seen.has(copy.id)) return false;
      seen.add(copy.id);
      return true;
    });
  }
  const toCopyInput = ({ id, ...copy }: SupersededArchiveCopy): SupersededCopyInput => ({
    ...copy,
    copyId: id ?? undefined,
  });
  /**
   * Superseded-progress files are restored into this browser's recovery copies, not applied.
   * Exported ids skip copies already here; identical progress is also merged when saving.
   */
  function adoptSupersededCopies(copies: SupersededArchiveCopy[], owner: string | null): void {
    resetImport();
    if (!owner) return failImport('settings.data_management.recovery_copies_sign_in');
    const before = listSupersededProgressCopies(owner);
    const fresh = copiesNotYetKept(copies, before);
    const failed = saveSupersededProgressCopies(owner, fresh.map(toCopyInput));
    // Copies matching stored progress are merged, so count what the list actually gained.
    const added = listSupersededProgressCopies(owner).length - before.length;
    if (failed > 0) {
      return failImport('settings.data_management.recovery_copies_add_failed', {
        added,
        total: added + failed,
      });
    }
    recoveryCopiesImport.value = { added, alreadyPresent: copies.length - added };
  }
  function applyWorkerReply(reply: BackupReply, owner: string | null): void {
    if ('supersededCopies' in reply) return adoptSupersededCopies(reply.supersededCopies, owner);
    if (!('summary' in reply)) throw new Error('Invalid backup worker response');
    previewOwner = owner;
    importPreview.value = reply.summary.preview;
    recoveryArchiveEntries.value = reply.summary.entries;
    selectedRecoveryArchiveEntry.value = reply.summary.selected;
    importState.value = 'preview';
  }
  function releaseFailedWorker(): void {
    if (importClient?.closed) resetImport();
  }
  function handleImportFailure(error: unknown): void {
    if (error instanceof BackupImportCancelled) return;
    releaseFailedWorker();
    importState.value = 'error';
    const message = error instanceof Error ? error.message : 'Failed to read backup file';
    importError.value = message.startsWith('settings.') ? t(message) : message;
  }
  function failCurrentImport(error: unknown, generation: number, owner: string | null): void {
    if (workerResultIsCurrent(generation, owner)) handleImportFailure(error);
  }
  function receivingOwner(reply: BackupReply, owner: string | null): string | null {
    if ('summary' in reply && !reply.summary.ownerBound) return currentImportOwner();
    return owner;
  }
  async function requestImportSummary(request: () => Promise<BackupReply>): Promise<void> {
    const generation = importGeneration;
    const owner = currentImportOwner();
    importState.value = 'parsing';
    try {
      const reply = await request();
      const resultOwner = receivingOwner(reply, owner);
      if (workerResultIsCurrent(generation, resultOwner)) applyWorkerReply(reply, resultOwner);
    } catch (error) {
      failCurrentImport(error, generation, owner);
    }
  }
  async function reviewRecoveryArchiveEntry(index: number): Promise<void> {
    if (workerOwner !== currentImportOwner()) {
      rejectChangedImportOwner();
      return;
    }
    clearParsedImport();
    selectedRecoveryArchiveEntry.value = index;
    const client = importClient;
    if (!client) return;
    importGeneration++;
    await requestImportSummary(() => client.request({ op: 'select', index }));
  }
  if (getCurrentScope()) {
    onScopeDispose(resetImport);
    watch(
      () => $supabase.user.id ?? null,
      () => {
        if (previewOwner === undefined) return;
        const wasActive = importState.value === 'parsing' || importState.value === 'preview';
        resetImport();
        if (!wasActive) return;
        importState.value = 'error';
        importError.value = t('settings.data_management.import_owner_changed');
      },
      { flush: 'sync' }
    );
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
      const seasonalData = stripInternalSyncMetadata(
        cloneStateSnapshot(tarkovStore.getSeasonalProgressData())
      );
      const backup: TarkovTrackerExport = {
        _format: BACKUP_FORMAT,
        _version: 2,
        exportedAt: Date.now(),
        appVersion: String(runtimeConfig.public.appVersion ?? 'unknown'),
        currentGameMode: tarkovStore.getCurrentGameMode(),
        gameEdition: tarkovStore.getGameEdition(),
        tarkovUid: tarkovStore.getTarkovUid(),
        pvp: pvpData,
        pve: pveData,
        seasonNumber: ACTIVE_SEASON_NUMBER,
        seasonal: seasonalData,
      };
      await downloadJsonFile('tarkovtracker-backup', backup);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      exportError.value = `Failed to export backup: ${detail}`;
      logger.error('[DataBackup] Export error:', error);
      throw error instanceof Error ? error : new Error(detail);
    }
  }
  async function readOlderTabRecord() {
    try {
      return await readCommittedProgressAuthority();
    } catch (error) {
      logger.error('[DataBackup] Older-copy read failed:', error);
      throw new Error(t('settings.data_management.older_edit_read_failed'), { cause: error });
    }
  }
  async function reviewOlderTabProgress(index: number): Promise<void> {
    resetImport();
    const generation = importGeneration;
    const owner = currentImportOwner();
    importState.value = 'parsing';
    try {
      const record = await readOlderTabRecord();
      if (!workerResultIsCurrent(generation, owner)) return;
      const copies = ownedLegacyUpdates(record, owner);
      applyResolvedRecovery(
        parseRecoveryProgress(
          selectOlderTabRaw(copies, index, t('settings.data_management.older_edit_unavailable'))
        )
      );
    } catch (error) {
      failCurrentImport(error, generation, owner);
    }
  }
  async function exportDeviceProgressRecovery(): Promise<void> {
    recoveryExportReceipt = null;
    recoveryExportPending.value = false;
    const owner = $supabase.user.id ?? null;
    const record = await readCommittedProgressAuthority(false);
    if (owner !== ($supabase.user.id ?? null))
      throw new Error(t('settings.data_management.recovery_owner_changed'));
    const belongsToOwner = (raw: string | null) => isOwnedProgressRecovery(raw, owner);
    const copies = [...exportableLegacyUpdates(record, owner)];
    if (copies.length > MAX_RECOVERY_OLDER_ENTRIES)
      throw new Error(t('settings.data_management.invalid_device_archive'));
    await downloadJsonFile(
      'tarkovtracker-device-progress',
      {
        _format: 'tarkovtracker-device-progress',
        _version: 1,
        exportedAt: Date.now(),
        current: belongsToOwner(record.raw) ? record.raw : null,
        original: belongsToOwner(record.legacyRaw) ? record.legacyRaw : null,
        older_tab_edits: copies,
      },
      {
        bytes: MAX_RECOVERY_ARCHIVE_SIZE,
        error: t('settings.data_management.recovery_archive_too_large'),
      }
    );
    recoveryExportReceipt = { owner, copies: [...copies] };
    recoveryExportPending.value = true;
  }
  async function confirmRecoveryArchiveSaved(): Promise<void> {
    const receipt = recoveryExportReceipt;
    if (!receipt) throw new Error(t('settings.data_management.recovery_archive_download_required'));
    if (receipt.owner !== ($supabase.user.id ?? null))
      throw new Error(t('settings.data_management.recovery_owner_changed'));
    await discardExportedLegacyProgress(receipt.owner, receipt.copies);
    recoveryExportReceipt = null;
    recoveryExportPending.value = false;
  }
  function ownedSupersededCopy(copyId: string): { ownerId: string; copy: SupersededProgressCopy } {
    const ownerId = $supabase.user.id;
    if (!ownerId) throw new Error('settings.data_management.recovery_copies_sign_in');
    const copy = listSupersededProgressCopies(ownerId).find((candidate) => candidate.id === copyId);
    if (!copy) throw new Error('settings.data_management.superseded_copy_unavailable');
    return { ownerId, copy };
  }
  const seasonNumberFor = (mode: GameMode): number | null =>
    mode === GAME_MODES.SEASONAL ? (tarkovStore.$state.seasonalSeasonNumber ?? null) : null;
  /** Keeps the progress a restore will replace, so the restore itself can be undone. */
  function keepProgressBeforeRestore(ownerId: string, mode: GameMode): void {
    const current = cloneStateSnapshot(tarkovStore.$state[mode]);
    if (!hasRetainableModeProgress(current)) return;
    if (saveSupersededProgressCopy(ownerId, mode, seasonNumberFor(mode), current)) return;
    throw new Error('settings.data_management.superseded_restore_keep_failed');
  }
  function restoreSupersededProgress(copyId: string): void {
    const { ownerId, copy } = ownedSupersededCopy(copyId);
    // A blocked browser would change memory only, which a reload would silently undo.
    if (areActiveProgressWritesBlocked())
      throw new Error('settings.data_management.superseded_restore_unavailable');
    if (!isRestorableSupersededCopy(copy))
      throw new Error('settings.data_management.superseded_other_season');
    keepProgressBeforeRestore(ownerId, copy.mode);
    const restored = stripInternalSyncMetadata(cloneStateSnapshot(copy.progress));
    tarkovStore.$patch((state: UserState) => {
      state[copy.mode] = createImportedProgressData(restored, state[copy.mode]);
    });
  }
  function discardSupersededProgress(copyId: string): void {
    const { ownerId, copy } = ownedSupersededCopy(copyId);
    if (!removeSupersededProgressCopy(ownerId, copy.id))
      throw new Error('settings.data_management.superseded_discard_failed');
  }
  async function exportSupersededProgress(copyId?: string): Promise<void> {
    const ownerId = $supabase.user.id;
    if (!ownerId) throw new Error('Sign in to export superseded progress');
    const copies = listSupersededProgressCopies(ownerId).filter(
      (copy) => copyId === undefined || copy.id === copyId
    );
    if (copies.length === 0) throw new Error('No superseded progress copies are available');
    await downloadJsonFile('tarkovtracker-superseded-progress', {
      _format: SUPERSEDED_ARCHIVE_FORMAT,
      _version: 1,
      exportedAt: Date.now(),
      copies: copies.map(({ ownerId: _ownerId, ...copy }) => copy),
    });
  }
  function buildDebugSummary(currentMode: GameMode, tarkovState: UserState): DebugTaskSummary {
    const metadataStore = useMetadataStore();
    return buildDebugTaskSummary(currentMode, tarkovState[currentMode], metadataStore.tasks ?? [], {
      gameMode: metadataStore.currentGameMode,
      loading: metadataStore.loading,
    });
  }
  async function buildDebugSnapshot(): Promise<DebugExportPayload> {
    const runtimeConfig = useRuntimeConfig();
    const currentUserId = $supabase.user.id ?? null;
    const storage = await buildDebugStorageContext(currentUserId);
    const tarkovState = await sanitizeTarkovStateForDebug(tarkovStore.$state);
    const currentMode = tarkovStore.getCurrentGameMode();
    return {
      _format: DEBUG_EXPORT_FORMAT,
      _version: 2,
      exportedAt: Date.now(),
      appVersion: String(runtimeConfig.public.appVersion ?? 'unknown'),
      auth: await buildDebugAuthContext($supabase.user, storage.authStorageKeyCount),
      runtime: buildDebugRuntimeContext(),
      state: {
        tarkov: tarkovState,
        preferences: await sanitizePreferencesForDebug(
          getPersistedPreferencesState(preferencesStore.$state)
        ),
        analyticsConsent: cloneStateSnapshot(analyticsConsent.state.value),
      },
      storage,
      summary: buildDebugSummary(currentMode, tarkovState),
    };
  }
  /** Builds the sanitized debug snapshot and records a user-facing error when it cannot be built. */
  async function runDebugSnapshot<T>(use: (payload: DebugExportPayload) => Promise<T>): Promise<T> {
    debugExportError.value = null;
    try {
      return await use(await buildDebugSnapshot());
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      debugExportError.value = `Failed to export debug snapshot: ${detail}`;
      logger.error('[DataBackup] Debug export error:', error);
      throw error instanceof Error ? error : new Error(detail);
    }
  }
  const exportDebugSnapshot = (): Promise<void> =>
    runDebugSnapshot((payload) => downloadJsonFile('tarkovtracker-debug-export', payload));
  const serializeDebugSnapshot = (): Promise<string> =>
    runDebugSnapshot(async (payload) => JSON.stringify(payload, null, 2));
  async function parseBackupFile(file: File): Promise<void> {
    resetImport();
    if (file.size > MAX_RECOVERY_ARCHIVE_SIZE) {
      importState.value = 'error';
      importError.value = t('settings.data_management.recovery_archive_too_large');
      return;
    }
    await requestImportSummary(() => {
      workerOwner = currentImportOwner();
      importClient = createBackupImportClient();
      return importClient.request({ op: 'open', file, owner: workerOwner });
    });
  }
  function previewMatchesCurrentOwner(): boolean {
    if (previewOwner === ($supabase.user.id ?? null)) return true;
    resetImport();
    importState.value = 'error';
    importError.value = t('settings.data_management.import_owner_changed');
    return false;
  }
  async function receiveSelectedBackup(): Promise<boolean> {
    if (!importClient) return true;
    const generation = importGeneration;
    const owner = previewOwner as string | null;
    importState.value = 'parsing';
    try {
      const data = await importClient.read();
      if (!workerResultIsCurrent(generation, owner)) return false;
      parsedPvp = data.pvp;
      parsedPve = data.pve;
      parsedSeasonal = data.seasonal;
      parsedExport = data.export;
      importState.value = 'preview';
      return true;
    } catch (error) {
      failCurrentImport(error, generation, owner);
      return false;
    }
  }
  async function confirmBackupImport(targetModes: BackupImportTargetModes): Promise<void> {
    if (!targetModes.pvp && !targetModes.pve && !targetModes.seasonal) return;
    if (importState.value !== 'preview' || !previewMatchesCurrentOwner()) return;
    if (!(await receiveSelectedBackup())) return;
    if (
      importState.value !== 'preview' ||
      !parsedPvp ||
      !parsedPve ||
      !parsedExport ||
      !previewMatchesCurrentOwner()
    ) {
      return;
    }
    try {
      const pvpData = parsedPvp;
      const pveData = parsedPve;
      const exportData = parsedExport;
      const importPvp = targetModes.pvp;
      const importPve = targetModes.pve;
      const importSeasonal = targetModes.seasonal === true && parsedSeasonal !== null;
      const importedModes: Record<GameMode, boolean> = {
        pvp: importPvp,
        pve: importPve,
        seasonal: importSeasonal,
      };
      const importAllAvailable = importPvp && importPve;
      if (!importPvp && !importPve && !importSeasonal) {
        return;
      }
      tarkovStore.$patch((state: UserState) => {
        if (importPvp) {
          state.pvp = createImportedProgressData(pvpData, state.pvp);
        }
        if (importPve) {
          state.pve = createImportedProgressData(pveData, state.pve);
        }
        if (importSeasonal && parsedSeasonal) {
          state.seasonal = createImportedProgressData(parsedSeasonal, state.seasonal);
        }
        if (importAllAvailable) {
          state.gameEdition = exportData.gameEdition;
          state.tarkovUid = exportData.tarkovUid;
        }
        if (importedModes[exportData.currentGameMode]) {
          state.currentGameMode = exportData.currentGameMode;
        } else if (importPvp) {
          state.currentGameMode = GAME_MODES.PVP;
        } else if (importPve) {
          state.currentGameMode = GAME_MODES.PVE;
        } else if (importSeasonal) {
          state.currentGameMode = GAME_MODES.SEASONAL;
        }
      });
      importClient?.cancel();
      importClient = null;
      workerOwner = undefined;
      recoveryArchiveEntries.value = [];
      selectedRecoveryArchiveEntry.value = null;
      importState.value = 'success';
    } catch (e) {
      importState.value = 'error';
      importError.value = 'Failed to apply backup data';
      logger.error('[DataBackup] Import error:', e);
    }
  }
  return {
    exportProgress,
    exportSupersededProgress,
    restoreSupersededProgress,
    discardSupersededProgress,
    recoveryCopiesImport,
    exportDeviceProgressRecovery,
    confirmRecoveryArchiveSaved,
    recoveryExportPending,
    recoveryArchiveEntries,
    selectedRecoveryArchiveEntry,
    reviewRecoveryArchiveEntry,
    reviewOlderTabProgress,
    legacyProgressRecoveryCount,
    legacyProgressRecoveryOverflow,
    exportError,
    exportDebugSnapshot,
    serializeDebugSnapshot,
    debugExportError,
    importState,
    importPreview,
    importError,
    parseBackupFile,
    confirmBackupImport,
    resetImport,
  };
}
