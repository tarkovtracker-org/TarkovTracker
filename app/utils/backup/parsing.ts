import { migrateToGameModeStructure, type UserProgressData } from '@/stores/progressState';
import { ACTIVE_SEASON_NUMBER, GAME_MODES, isGameMode, type GameMode } from '@/utils/constants';
import { sanitizeOwnedProgressData, sanitizeOwnedUserState } from '@/utils/progressSanitizers';
import { parseUserScopedStorage, isOwnedProgressRecovery } from '@/utils/storage/envelope';
export const BACKUP_FORMAT = 'tarkovtracker-backup' as const;
export const MAX_BACKUP_SIZE = 5 * 1024 * 1024;
// Current, original, captured recovery and one pending copy: 20 Mi characters
// may expand to 120 MiB in JSON escaping, with room for archive metadata.
export const MAX_RECOVERY_ARCHIVE_SIZE = 128 * 1024 * 1024;
// Retained edits (20), failed captures (20), and one pending copy fit with slack.
export const MAX_RECOVERY_OLDER_ENTRIES = 64;
export const DEBUG_EXPORT_FORMAT = 'tarkovtracker-debug-export' as const;
const SUPPORTED_VERSIONS = [1, 2] as const;
type Faction = 'USEC' | 'BEAR';
export interface TarkovTrackerExport {
  _format: typeof BACKUP_FORMAT;
  _version: number;
  exportedAt: number;
  appVersion: string;
  currentGameMode: GameMode;
  gameEdition: number;
  tarkovUid: number | null;
  pvp: UserProgressData;
  pve: UserProgressData;
  seasonNumber?: number;
  seasonal?: UserProgressData;
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
  seasonal: {
    level: number;
    faction: Faction;
    displayName: string | null;
    taskCount: number;
    prestigeLevel: number;
  } | null;
}
export type BackupImportTargetModes = {
  pvp: boolean;
  pve: boolean;
  seasonal?: boolean;
};
export type RecoveryArchiveEntry = { kind: 'current' | 'original' | 'older'; index: number };
export type RawRecoveryArchiveEntry = RecoveryArchiveEntry & { raw: string };
const ALLOWED_PROGRESS_KEYS = new Set([
  'level',
  'pmcFaction',
  'displayName',
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
  'taskAvailability',
]);
const VALID_FACTIONS = new Set<Faction>(['USEC', 'BEAR']);
export function isBackupObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function sanitizeProgressData(
  raw: unknown
): { ok: true; data: UserProgressData } | { ok: false; error: string } {
  if (!isBackupObject(raw)) {
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
    'taskAvailability',
  ] as const;
  for (const field of dictFields) {
    if (raw[field] !== undefined && !isBackupObject(raw[field])) {
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
type SanitizedBackupModes = {
  pve: UserProgressData;
  pvp: UserProgressData;
  seasonal: UserProgressData | null;
};
const validateBackupFormat = (json: Record<string, unknown>): string | null => {
  if (json._format !== BACKUP_FORMAT) return 'Invalid file format — not a TarkovTracker backup';
  if (!SUPPORTED_VERSIONS.includes(json._version as (typeof SUPPORTED_VERSIONS)[number])) {
    return `Unsupported backup version: ${json._version}`;
  }
  return null;
};
const isValidBackupEdition = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
const isValidBackupMode = (json: Record<string, unknown>): boolean =>
  isGameMode(json.currentGameMode) &&
  (json._version !== 1 || json.currentGameMode !== GAME_MODES.SEASONAL);
const validateBackupIdentity = (json: Record<string, unknown>): string | null => {
  if (!isValidBackupMode(json)) return 'Invalid currentGameMode';
  if (!isValidBackupEdition(json.gameEdition)) {
    return 'Invalid gameEdition — must be integer 1-6';
  }
  return null;
};
const isValidBackupTarkovUid = (value: unknown): boolean =>
  value === null || (typeof value === 'number' && Number.isFinite(value));
const isValidBackupSeasonNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;
const validateBackupAccount = (json: Record<string, unknown>): string | null => {
  if (!isValidBackupTarkovUid(json.tarkovUid)) {
    return 'Invalid tarkovUid — must be a number or null';
  }
  if (json._version === 2 && !isValidBackupSeasonNumber(json.seasonNumber)) {
    return 'Invalid seasonNumber';
  }
  return null;
};
type SanitizedModeResult = { ok: true; data: UserProgressData } | { ok: false; error: string };
const sanitizeNamedBackupMode = (label: string, raw: unknown): SanitizedModeResult => {
  const result = sanitizeProgressData(raw);
  return result.ok ? result : { ok: false, error: `${label} data: ${result.error}` };
};
const sanitizePersistentBackupModes = (
  json: Record<string, unknown>
): { ok: true; pve: UserProgressData; pvp: UserProgressData } | { ok: false; error: string } => {
  const pvp = sanitizeNamedBackupMode('PvP', json.pvp);
  if (!pvp.ok) return pvp;
  const pve = sanitizeNamedBackupMode('PvE', json.pve);
  if (!pve.ok) return pve;
  return { ok: true, pve: pve.data, pvp: pvp.data };
};
const sanitizeSeasonalBackupMode = (
  json: Record<string, unknown>
): SanitizedModeResult | { ok: true; data: null } => {
  if (json._version !== 2) return { ok: true, data: null };
  if (json.seasonal === undefined || json.seasonal === null) return { ok: true, data: null };
  return sanitizeNamedBackupMode('Seasonal', json.seasonal);
};
const sanitizeBackupModes = (
  json: Record<string, unknown>
): { ok: true; data: SanitizedBackupModes } | { ok: false; error: string } => {
  const persistent = sanitizePersistentBackupModes(json);
  if (!persistent.ok) return persistent;
  const seasonal = sanitizeSeasonalBackupMode(json);
  if (!seasonal.ok) return seasonal;
  return {
    ok: true,
    data: {
      pvp: persistent.pvp,
      pve: persistent.pve,
      seasonal: seasonal.data,
    },
  };
};
export function validateBackup(json: unknown):
  | {
      ok: true;
      data: {
        export: TarkovTrackerExport;
        pvp: UserProgressData;
        pve: UserProgressData;
        seasonal: UserProgressData | null;
      };
    }
  | { ok: false; error: string } {
  if (!isBackupObject(json)) {
    return { ok: false, error: 'Invalid file format — expected a JSON object' };
  }
  const validationError = [
    validateBackupFormat(json),
    validateBackupIdentity(json),
    validateBackupAccount(json),
  ].find((error) => error !== null);
  if (validationError) return { ok: false, error: validationError };
  const modes = sanitizeBackupModes(json);
  if (!modes.ok) return modes;
  const seasonal =
    json._version === 2 && json.seasonNumber === ACTIVE_SEASON_NUMBER ? modes.data.seasonal : null;
  return {
    ok: true,
    data: {
      export: json as unknown as TarkovTrackerExport,
      pvp: modes.data.pvp,
      pve: modes.data.pve,
      seasonal,
    },
  };
}
export function selectOlderTabRaw(copies: string[], index: number, unavailable: string): string {
  if (!Number.isInteger(index) || index < 0 || index >= copies.length) {
    throw new Error(unavailable);
  }
  return copies[index]!;
}
function parseOlderTabRaw(raw: string): unknown {
  if (new TextEncoder().encode(raw).byteLength > MAX_RECOVERY_ARCHIVE_SIZE)
    throw new Error('Older edit is too large');
  return parseUserScopedStorage(raw)?.data ?? JSON.parse(raw);
}
const olderTabMetadataKeys = [
  'currentGameMode',
  'gameEdition',
  'tarkovUid',
  'seasonalSeasonNumber',
] as const;
function normalizeOlderTabSource(source: Record<string, unknown>): Record<string, unknown> {
  if ('pvp' in source || 'pve' in source)
    return { ...migrateToGameModeStructure(source), ...source };
  const progress = sanitizeProgressData(source);
  if (!progress.ok) throw new Error(progress.error);
  const migrated = migrateToGameModeStructure(source);
  const metadata = Object.fromEntries(
    olderTabMetadataKeys.filter((key) => key in source).map((key) => [key, source[key]])
  );
  return { ...migrated, ...metadata };
}
function buildOlderTabBackup(raw: string): TarkovTrackerExport {
  const source: unknown = parseOlderTabRaw(raw);
  if (!isBackupObject(source)) throw new Error('Invalid older edit');
  const candidate = {
    ...normalizeOlderTabSource(source),
    _format: BACKUP_FORMAT,
    _version: 2,
    exportedAt: Date.now(),
    appVersion: 'older-tab',
    seasonNumber: source.seasonalSeasonNumber ?? ACTIVE_SEASON_NUMBER,
  };
  const checked = validateBackup(candidate);
  if (!checked.ok) throw new Error(checked.error);
  const migrated = sanitizeOwnedUserState(migrateToGameModeStructure(source));
  return { ...checked.data.export, ...migrated };
}
export type RecoveryArchiveResult =
  | { ok: true; value: unknown; entries?: RawRecoveryArchiveEntry[] }
  | { ok: false; error: 'empty_device_archive' | 'invalid_device_archive' };
export function parseRecoveryProgress(raw: string): RecoveryArchiveResult {
  try {
    return { ok: true, value: buildOlderTabBackup(raw) };
  } catch {
    return { ok: false, error: 'invalid_device_archive' };
  }
}
const invalidArchiveSlot = (raw: unknown): boolean =>
  raw !== undefined && raw !== null && typeof raw !== 'string';
function collectRecoveryArchiveEntries(
  json: Record<string, unknown>,
  owner: string | null
): RecoveryArchiveResult {
  const older = json.older_tab_edits ?? [];
  if (!Array.isArray(older) || older.length > MAX_RECOVERY_OLDER_ENTRIES)
    return { ok: false, error: 'invalid_device_archive' };
  const candidates = [
    { kind: 'current' as const, index: 0, raw: json.current },
    { kind: 'original' as const, index: 0, raw: json.original },
    ...older.map((raw: unknown, index: number) => ({ kind: 'older' as const, index, raw })),
  ];
  if (candidates.some(({ raw }) => invalidArchiveSlot(raw)))
    return { ok: false, error: 'invalid_device_archive' };
  const entries = candidates.filter(
    (entry): entry is RawRecoveryArchiveEntry =>
      typeof entry.raw === 'string' && isOwnedProgressRecovery(entry.raw, owner)
  );
  return resolveCollectedArchiveEntries(
    entries,
    candidates.some(({ raw }) => typeof raw === 'string')
  );
}
function resolveCollectedArchiveEntries(
  entries: RawRecoveryArchiveEntry[],
  hasRaw: boolean
): RecoveryArchiveResult {
  if (entries.length === 0)
    return { ok: false, error: hasRaw ? 'invalid_device_archive' : 'empty_device_archive' };
  return { ok: true, value: null, entries };
}
export function isDeviceRecoveryArchiveV1(json: unknown): boolean {
  return (
    isBackupObject(json) && json._format === 'tarkovtracker-device-progress' && json._version === 1
  );
}
export function resolveRecoveryArchive(json: unknown, owner: string | null): RecoveryArchiveResult {
  if (!isBackupObject(json) || json._format !== 'tarkovtracker-device-progress')
    return { ok: true, value: json };
  if (json._version !== 1) return { ok: false, error: 'invalid_device_archive' };
  return collectRecoveryArchiveEntries(json, owner);
}
export function defaultArchiveEntryIndex(entries: RawRecoveryArchiveEntry[]): number {
  const preferred =
    entries.find((entry) => entry.kind === 'current') ??
    entries.filter((entry) => entry.kind === 'older').at(-1) ??
    entries[0]!;
  return entries.indexOf(preferred);
}
export function buildPreview(
  exportData: Pick<TarkovTrackerExport, 'exportedAt' | 'appVersion' | 'gameEdition' | 'tarkovUid'>,
  pvp: UserProgressData,
  pve: UserProgressData,
  seasonal: UserProgressData | null
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
    seasonal: seasonal ? modePreview(seasonal) : null,
  };
}
export type ValidatedBackup = Extract<ReturnType<typeof validateBackup>, { ok: true }>['data'];
