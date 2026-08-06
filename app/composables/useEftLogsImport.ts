import { strFromU8, unzipSync } from 'fflate';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import {
  GAME_MODES,
  getGameModeSeasonNumber,
  IMPORTABLE_GAME_MODES,
  isImportableGameMode,
  type GameMode,
  type ImportableGameMode,
} from '@/utils/constants';
import {
  isEftBackendLogFileName,
  isEftNotificationLogFileName,
  parseEftLogsForQuestImport,
  UNKNOWN_LOG_VERSION,
  type EftLogInputFile,
  type EftQuestImportPreview,
} from '@/utils/eftLogQuestParser';
import { logger } from '@/utils/logger';
import {
  applyTaskAvailabilityRequirements,
  completeTaskForProgress,
  failTaskForProgress,
} from '@/utils/taskProgress';
import { getCompletionFlags } from '@/utils/taskStatus';
import type { Task } from '@/types/tarkov';
const MAX_IMPORT_FILE_SIZE_BYTES = 512 * 1024 * 1024;
const MAX_SINGLE_LOG_SIZE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_LOG_CONTENT_BYTES = 256 * 1024 * 1024;
const UNKNOWN_MODE = 'unknown' as const;
export type EftLogsImportState = 'idle' | 'preview' | 'success' | 'error';
export interface EftLogsImportPreviewData extends EftQuestImportPreview {
  scannedEntries: number;
  sourceFileName: string;
}
export interface UseEftLogsImportReturn {
  importError: Ref<string | null>;
  importState: Ref<EftLogsImportState>;
  parseFile: (file: File) => Promise<void>;
  parseFiles: (files: File[]) => Promise<void>;
  previewData: Ref<EftLogsImportPreviewData | null>;
  setIncludedVersions: (versions: string[]) => void;
  confirmImport: (targetMode: ImportableGameMode) => Promise<void>;
  reset: () => void;
}
interface EftLogsImportErrorValues {
  [key: string]: string | number;
}
class EftLogsImportError extends Error {
  key: string;
  values?: EftLogsImportErrorValues;
  constructor(key: string, values?: EftLogsImportErrorValues) {
    super(key);
    this.key = key;
    this.values = values;
    this.name = 'EftLogsImportError';
  }
}
type TranslationFn = (key: string, values?: Record<string, unknown>) => string;
function createImportError(key: string, values?: EftLogsImportErrorValues): EftLogsImportError {
  return new EftLogsImportError(key, values);
}
function normalizeErrorMessage(error: unknown, t: TranslationFn): string {
  if (error instanceof EftLogsImportError) {
    return t(error.key, error.values);
  }
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim().length) {
    return error.message;
  }
  return t('settings.log_import.errors.parse_failed');
}
function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip');
}
function parseVersionMajor(version: string): number | null {
  if (version === UNKNOWN_LOG_VERSION) return null;
  const [majorPart] = version.split('.');
  const major = Number.parseInt(majorPart ?? '', 10);
  if (!Number.isFinite(major)) return null;
  return major;
}
function selectDefaultIncludedVersions(availableVersions: string[]): string[] {
  if (availableVersions.length === 0) return [];
  const knownVersions = availableVersions.filter((version) => version !== UNKNOWN_LOG_VERSION);
  if (knownVersions.length === 0) {
    return [UNKNOWN_LOG_VERSION];
  }
  const knownMajors = knownVersions
    .map((version) => parseVersionMajor(version))
    .filter((major): major is number => major !== null);
  if (knownMajors.length === 0) {
    return [knownVersions[0]!];
  }
  const latestMajor = Math.max(...knownMajors);
  const latestMajorVersions = knownVersions.filter(
    (version) => parseVersionMajor(version) === latestMajor
  );
  if (latestMajorVersions.length > 0) {
    return latestMajorVersions;
  }
  return [knownVersions[0]!];
}
function ensureImportFileSize(file: File): void {
  if (file.size <= MAX_IMPORT_FILE_SIZE_BYTES) return;
  throw createImportError('settings.log_import.errors.import_file_too_large', {
    max_mb: 512,
  });
}
async function readSingleLogFile(
  file: File
): Promise<{ files: EftLogInputFile[]; scanned: number }> {
  if (file.size > MAX_SINGLE_LOG_SIZE_BYTES) {
    throw createImportError('settings.log_import.errors.log_file_too_large', {
      max_mb: 32,
    });
  }
  const text = await file.text();
  return {
    files: [{ name: file.name, text }],
    scanned: 1,
  };
}
async function readRawImportLogFiles(
  files: File[]
): Promise<{ files: EftLogInputFile[]; scanned: number }> {
  let totalLogBytes = 0;
  const extracted: EftLogInputFile[] = [];
  for (const file of files) {
    const relativePath = file.webkitRelativePath;
    const filePath = relativePath && relativePath.length > 0 ? relativePath : file.name;
    if (!isEftNotificationLogFileName(filePath) && !isEftBackendLogFileName(filePath)) continue;
    if (file.size > MAX_SINGLE_LOG_SIZE_BYTES) {
      throw createImportError('settings.log_import.errors.log_file_too_large_path', {
        path: filePath,
      });
    }
    totalLogBytes += file.size;
    if (totalLogBytes > MAX_TOTAL_LOG_CONTENT_BYTES) {
      throw createImportError('settings.log_import.errors.selected_logs_too_large', {
        max_mb: 256,
      });
    }
    extracted.push({
      name: filePath,
      text: await file.text(),
    });
  }
  return {
    files: extracted,
    scanned: files.length,
  };
}
async function readZipLogs(file: File): Promise<{ files: EftLogInputFile[]; scanned: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let scannedEntries = 0;
  let totalLogBytes = 0;
  let notificationEntries = 0;
  const extracted = unzipSync(bytes, {
    filter: (entry) => {
      scannedEntries += 1;
      if (!isEftNotificationLogFileName(entry.name) && !isEftBackendLogFileName(entry.name)) {
        return false;
      }
      notificationEntries += 1;
      if (entry.originalSize > MAX_SINGLE_LOG_SIZE_BYTES) {
        throw createImportError('settings.log_import.errors.archive_log_file_too_large', {
          path: entry.name,
        });
      }
      totalLogBytes += entry.originalSize;
      if (totalLogBytes > MAX_TOTAL_LOG_CONTENT_BYTES) {
        throw createImportError('settings.log_import.errors.archive_logs_too_large', {
          max_mb: 256,
        });
      }
      return true;
    },
  });
  if (notificationEntries === 0) {
    throw createImportError('settings.log_import.errors.no_logs_in_archive');
  }
  const files = Object.entries(extracted).map(([name, content]) => ({
    name,
    text: strFromU8(content),
  }));
  return {
    files,
    scanned: scannedEntries,
  };
}
type ImportTaskIds = Record<ImportableGameMode, Set<string>>;
type ImportTaskSets = {
  completed: ImportTaskIds;
  started: ImportTaskIds;
};
const buildImportTaskSets = (
  preview: EftLogsImportPreviewData,
  targetMode: ImportableGameMode
): ImportTaskSets => {
  const completed: ImportTaskIds = {
    pvp: new Set(preview.matchedTaskIdsByMode.pvp),
    pve: new Set(preview.matchedTaskIdsByMode.pve),
  };
  const started: ImportTaskIds = {
    pvp: new Set(preview.matchedStartedTaskIdsByMode.pvp),
    pve: new Set(preview.matchedStartedTaskIdsByMode.pve),
  };
  for (const taskId of preview.matchedTaskIdsByMode[UNKNOWN_MODE])
    completed[targetMode].add(taskId);
  for (const taskId of preview.matchedStartedTaskIdsByMode[UNKNOWN_MODE]) {
    started[targetMode].add(taskId);
  }
  return { completed, started };
};
const applyCompletedImports = (
  store: ReturnType<typeof useTarkovStore>,
  tasksMap: Map<string, Task>,
  completedTaskIds: Set<string>
) => {
  const processedCompleted = new Set<string>();
  const processedFailed = new Set<string>();
  const completeTask = (taskId: string) => {
    if (processedCompleted.has(taskId)) return;
    completeTaskForProgress({ store, taskId, tasksMap });
    processedCompleted.add(taskId);
  };
  const failTask = (taskId: string) => {
    if (completedTaskIds.has(taskId) || processedFailed.has(taskId)) return;
    failTaskForProgress({ store, taskId, tasksMap });
    processedFailed.add(taskId);
  };
  for (const taskId of completedTaskIds) {
    const task = tasksMap.get(taskId);
    if (task) {
      applyTaskAvailabilityRequirements({
        onCompleteRequirement: completeTask,
        onFailRequirement: failTask,
        task,
      });
    }
    completeTask(taskId);
  }
};
const shouldStartImportedTask = (
  alreadyCompleted: boolean,
  flags: ReturnType<typeof getCompletionFlags>
) => !alreadyCompleted && !flags.complete && !flags.failed;
const applyStartedImports = (
  store: ReturnType<typeof useTarkovStore>,
  completedTaskIds: Set<string>,
  startedTaskIds: Set<string>
) => {
  const completions = store.getCurrentProgressData().taskCompletions ?? {};
  for (const taskId of startedTaskIds) {
    const flags = getCompletionFlags(completions[taskId]);
    const shouldStart = shouldStartImportedTask(completedTaskIds.has(taskId), flags);
    if (shouldStart) store.setTaskUncompleted(taskId);
  }
};
const applyModeImports = async (
  store: ReturnType<typeof useTarkovStore>,
  tasksMap: Map<string, Task>,
  mode: ImportableGameMode,
  activeMode: GameMode,
  taskSets: ImportTaskSets,
  onModeSwitched: (mode: GameMode) => void
): Promise<GameMode> => {
  const completed = taskSets.completed[mode];
  const started = taskSets.started[mode];
  if (!completed.size && !started.size) return activeMode;
  if (activeMode !== mode) {
    onModeSwitched(mode);
    await store.switchGameMode(mode);
  }
  applyCompletedImports(store, tasksMap, completed);
  applyStartedImports(store, completed, started);
  return mode;
};
const restoreImportMode = async (
  store: ReturnType<typeof useTarkovStore>,
  activeMode: GameMode,
  originalMode: GameMode,
  importFailure: unknown
): Promise<unknown> => {
  if (activeMode === originalMode) return importFailure;
  try {
    await store.switchGameMode(originalMode);
    return importFailure;
  } catch (error) {
    logger.error('[EftLogsImport] Failed restoring game mode:', error);
    return importFailure ?? error;
  }
};
const applyAllModeImports = async (
  store: ReturnType<typeof useTarkovStore>,
  tasksMap: Map<string, Task>,
  originalMode: GameMode,
  taskSets: ImportTaskSets
): Promise<{ activeMode: GameMode; error: unknown }> => {
  let activeMode = originalMode;
  const trackMode = (mode: GameMode) => {
    activeMode = mode;
  };
  try {
    for (const mode of IMPORTABLE_GAME_MODES) {
      activeMode = await applyModeImports(store, tasksMap, mode, activeMode, taskSets, trackMode);
    }
    return { activeMode, error: null };
  } catch (error) {
    return { activeMode, error };
  }
};
export function useEftLogsImport(): UseEftLogsImportReturn {
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const importState = ref<EftLogsImportState>('idle');
  const previewData = ref<EftLogsImportPreviewData | null>(null);
  const importError = ref<string | null>(null);
  const sourceFiles = ref<EftLogInputFile[]>([]);
  const selectedVersions = ref<string[]>([]);
  const sourceFileName = ref(t('settings.log_import.selected_files'));
  const scannedEntriesCount = ref(0);
  let parseFilesRequestId = 0;
  function getTaskIds(): string[] {
    return metadataStore.tasks.map((task) => task.id);
  }
  function buildPreviewData(taskIds: string[]): EftLogsImportPreviewData {
    const parsed = parseEftLogsForQuestImport(sourceFiles.value, taskIds, {
      includedVersions: selectedVersions.value,
    });
    return {
      ...parsed,
      scannedEntries: scannedEntriesCount.value,
      sourceFileName: sourceFileName.value,
    };
  }
  function setIncludedVersions(versions: string[]): void {
    if (importState.value !== 'preview') return;
    if (!previewData.value) return;
    const availableSet = new Set(previewData.value.availableVersions);
    const normalized = Array.from(new Set(versions)).filter((version) => availableSet.has(version));
    if (normalized.length === 0) return;
    selectedVersions.value = normalized;
    previewData.value = buildPreviewData(getTaskIds());
    importError.value = null;
  }
  function reset(): void {
    parseFilesRequestId++;
    importState.value = 'idle';
    previewData.value = null;
    importError.value = null;
    sourceFiles.value = [];
    selectedVersions.value = [];
    sourceFileName.value = t('settings.log_import.selected_files');
    scannedEntriesCount.value = 0;
  }
  async function parseFiles(files: File[]): Promise<void> {
    const requestId = ++parseFilesRequestId;
    const isActiveRequest = () => requestId === parseFilesRequestId;
    importState.value = 'idle';
    previewData.value = null;
    importError.value = null;
    sourceFiles.value = [];
    selectedVersions.value = [];
    sourceFileName.value = t('settings.log_import.selected_files');
    scannedEntriesCount.value = 0;
    if (!Array.isArray(files) || files.length === 0) {
      importState.value = 'error';
      importError.value = t('settings.log_import.errors.no_files_selected');
      return;
    }
    try {
      let scannedEntries = 0;
      const importFiles: EftLogInputFile[] = [];
      const rawLogFiles: File[] = [];
      for (const file of files) {
        ensureImportFileSize(file);
        if (isZipFile(file)) {
          const zipSource = await readZipLogs(file);
          if (!isActiveRequest()) return;
          scannedEntries += zipSource.scanned;
          importFiles.push(...zipSource.files);
          continue;
        }
        rawLogFiles.push(file);
      }
      if (rawLogFiles.length > 0) {
        if (rawLogFiles.length === 1) {
          const singleSource = await readSingleLogFile(rawLogFiles[0]!);
          if (!isActiveRequest()) return;
          scannedEntries += singleSource.scanned;
          importFiles.push(...singleSource.files);
        } else {
          const rawSource = await readRawImportLogFiles(rawLogFiles);
          if (!isActiveRequest()) return;
          scannedEntries += rawSource.scanned;
          importFiles.push(...rawSource.files);
        }
      }
      if (!isActiveRequest()) return;
      if (importFiles.length === 0) {
        importState.value = 'error';
        importError.value = t('settings.log_import.errors.no_notification_logs_found');
        return;
      }
      const tasks = metadataStore.tasks;
      if (!Array.isArray(tasks) || tasks.length === 0) {
        importState.value = 'error';
        importError.value = t('settings.log_import.errors.task_metadata_not_loaded');
        return;
      }
      const taskIds = tasks.map((task) => task.id);
      const parsed = parseEftLogsForQuestImport(importFiles, taskIds);
      if (parsed.dedupedCompletionEventCount === 0 && parsed.dedupedStartedEventCount === 0) {
        importState.value = 'error';
        importError.value = t('settings.log_import.errors.no_quest_events_found');
        return;
      }
      if (parsed.matchedTaskIds.length === 0 && parsed.matchedStartedTaskIds.length === 0) {
        importState.value = 'error';
        importError.value = t('settings.log_import.errors.no_matching_tasks_found');
        return;
      }
      sourceFiles.value = importFiles;
      scannedEntriesCount.value = scannedEntries;
      sourceFileName.value =
        files.length === 1
          ? (files[0]?.name ?? t('settings.log_import.selected_files'))
          : t('settings.log_import.selected_files_count', { count: files.length });
      selectedVersions.value = selectDefaultIncludedVersions(parsed.availableVersions);
      if (selectedVersions.value.length === 0) {
        selectedVersions.value = parsed.availableVersions;
      }
      previewData.value = buildPreviewData(taskIds);
      importState.value = 'preview';
    } catch (error) {
      if (!isActiveRequest()) return;
      importState.value = 'error';
      importError.value = normalizeErrorMessage(error, t);
      logger.error('[EftLogsImport] Parse error:', error);
    }
  }
  async function parseFile(file: File): Promise<void> {
    await parseFiles([file]);
  }
  async function confirmImport(targetMode: ImportableGameMode): Promise<void> {
    const preview = previewData.value;
    if (!preview) return;
    if (!isImportableGameMode(targetMode)) {
      importState.value = 'error';
      importError.value = t(
        'settings.data_management.seasonal_import_locked',
        {
          season: getGameModeSeasonNumber(GAME_MODES.SEASONAL),
        },
        'Seasonal PvP imports are temporarily locked until the source data is verified for Season {season}.'
      );
      return;
    }
    const originalMode = tarkovStore.getCurrentGameMode();
    const tasksMap = new Map<string, Task>();
    metadataStore.tasks.forEach((task) => {
      tasksMap.set(task.id, task);
    });
    const taskSets = buildImportTaskSets(preview, targetMode);
    const applied = await applyAllModeImports(tarkovStore, tasksMap, originalMode, taskSets);
    const importFailure = await restoreImportMode(
      tarkovStore,
      applied.activeMode,
      originalMode,
      applied.error
    );
    if (importFailure) {
      importState.value = 'error';
      importError.value = t('settings.log_import.errors.apply_import_failed');
      logger.error('[EftLogsImport] Import error:', importFailure);
      return;
    }
    importState.value = 'success';
    importError.value = null;
  }
  return {
    importError,
    importState,
    parseFile,
    parseFiles,
    previewData,
    setIncludedVersions,
    confirmImport,
    reset,
  };
}
