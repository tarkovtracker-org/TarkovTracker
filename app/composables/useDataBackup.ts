import { useTarkovStore } from '@/stores/useTarkov';
import { MAX_SKILL_LEVEL } from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { UserProgressData, UserState } from '@/stores/progressState';
const BACKUP_FORMAT = 'tarkovtracker-backup' as const;
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
  'skillOffsets',
  'storyChapters',
  'tarkovDevProfile',
]);
const VALID_FACTIONS = new Set<Faction>(['USEC', 'BEAR']);
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const level =
    typeof stripped.level === 'number' && Number.isFinite(stripped.level)
      ? Math.max(1, Math.trunc(stripped.level))
      : 1;
  const prestigeLevel =
    typeof stripped.prestigeLevel === 'number' && Number.isFinite(stripped.prestigeLevel)
      ? Math.max(0, Math.min(6, Math.trunc(stripped.prestigeLevel)))
      : 0;
  const xpOffset =
    typeof stripped.xpOffset === 'number' && Number.isFinite(stripped.xpOffset)
      ? Math.trunc(stripped.xpOffset)
      : 0;
  const displayName =
    typeof stripped.displayName === 'string'
      ? stripped.displayName.trim().slice(0, 64) || null
      : null;
  const skills = isPlainObject(stripped.skills)
    ? { ...(stripped.skills as Record<string, number>) }
    : {};
  for (const [key, val] of Object.entries(skills)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      skills[key] = 0;
    } else {
      skills[key] = Math.max(0, Math.min(MAX_SKILL_LEVEL, val));
    }
  }
  return {
    ok: true,
    data: {
      level,
      pmcFaction: stripped.pmcFaction as Faction,
      displayName,
      xpOffset,
      taskCompletions: isPlainObject(stripped.taskCompletions)
        ? (stripped.taskCompletions as UserProgressData['taskCompletions'])
        : {},
      taskObjectives: isPlainObject(stripped.taskObjectives)
        ? (stripped.taskObjectives as UserProgressData['taskObjectives'])
        : {},
      hideoutParts: isPlainObject(stripped.hideoutParts)
        ? (stripped.hideoutParts as UserProgressData['hideoutParts'])
        : {},
      hideoutModules: isPlainObject(stripped.hideoutModules)
        ? (stripped.hideoutModules as UserProgressData['hideoutModules'])
        : {},
      traders: isPlainObject(stripped.traders)
        ? (stripped.traders as UserProgressData['traders'])
        : {},
      skills,
      prestigeLevel,
      skillOffsets: isPlainObject(stripped.skillOffsets)
        ? (stripped.skillOffsets as UserProgressData['skillOffsets'])
        : {},
      storyChapters: isPlainObject(stripped.storyChapters)
        ? (stripped.storyChapters as UserProgressData['storyChapters'])
        : {},
      ...(isPlainObject(stripped.tarkovDevProfile) &&
      typeof (stripped.tarkovDevProfile as Record<string, unknown>).importedAt === 'number'
        ? {
            tarkovDevProfile:
              stripped.tarkovDevProfile as unknown as UserProgressData['tarkovDevProfile'],
          }
        : {}),
    },
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
function stripLastApiUpdate(data: UserProgressData): UserProgressData {
  const { lastApiUpdate: _, ...rest } = data;
  return rest as UserProgressData;
}
export function useDataBackup(): UseDataBackupReturn {
  const tarkovStore = useTarkovStore();
  const exportError = ref<string | null>(null);
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
    let url: string | null = null;
    try {
      const runtimeConfig = useRuntimeConfig();
      const pvpData = stripLastApiUpdate(structuredClone(toRaw(tarkovStore.getPvPProgressData())));
      const pveData = stripLastApiUpdate(structuredClone(toRaw(tarkovStore.getPvEProgressData())));
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
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];
      const a = document.createElement('a');
      a.href = url;
      a.download = `tarkovtracker-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      exportError.value = `Failed to export backup: ${detail}`;
      logger.error('[DataBackup] Export error:', error);
      throw error instanceof Error ? error : new Error(detail);
    } finally {
      if (url) {
        URL.revokeObjectURL(url);
      }
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
          state.pvp = structuredClone(pvpData);
        }
        if (importPve) {
          state.pve = structuredClone(pveData);
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
    importState,
    importPreview,
    importError,
    parseBackupFile,
    confirmBackupImport,
    resetImport,
  };
}
