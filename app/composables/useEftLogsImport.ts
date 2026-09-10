import { strFromU8, unzipSync } from 'fflate';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { GAME_MODE_VALUES, isGameMode, type GameMode } from '@/utils/constants';
import { loadEftImportTaskCatalog } from '@/utils/eftLogImportCatalog';
import {
  isEftImportLogFileName,
  hasOutsideSeasonEvents,
  isEligibleImportEvent,
  latestEftQuestEvents,
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
  isImporting: Ref<boolean>;
  importError: Ref<string | null>;
  importState: Ref<EftLogsImportState>;
  parseFile: (file: File) => Promise<void>;
  parseFiles: (files: File[]) => Promise<void>;
  previewData: Ref<EftLogsImportPreviewData | null>;
  setIncludedVersions: (versions: string[]) => void;
  confirmImport: (targetMode: GameMode) => Promise<void>;
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
/** Creates an error with a translation key and interpolation values for the import UI. */
function createImportError(key: string, values?: EftLogsImportErrorValues): EftLogsImportError {
  return new EftLogsImportError(key, values);
}
/** Translates known import errors and preserves useful messages from unexpected failures. */
function normalizeErrorMessage(error: unknown, t: TranslationFn): string {
  if (error instanceof EftLogsImportError) {
    return t(error.key, error.values);
  }
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim().length) {
    return error.message;
  }
  return t('settings.log_import.errors.parse_failed');
}
/** Identifies ZIP selections before choosing an archive or raw-file reader. */
function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip');
}
/** Extracts a known major release number for the initial version selection. */
function parseVersionMajor(version: string): number | null {
  if (version === UNKNOWN_LOG_VERSION) return null;
  const [majorPart] = version.split('.');
  const major = Number.parseInt(majorPart ?? '', 10);
  if (!Number.isFinite(major)) return null;
  return major;
}
/** Defaults to the latest known major release while keeping all versions available for selection. */
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
/** Rejects oversized selected files before allocating their contents. */
function ensureImportFileSize(file: File): void {
  if (file.size <= MAX_IMPORT_FILE_SIZE_BYTES) return;
  throw createImportError('settings.log_import.errors.import_file_too_large', {
    max_mb: 512,
  });
}
/** Enforces the combined raw-file and archive log-content budget without re-encoding text. */
function ensureTotalLogBytes(bytes: number): void {
  if (bytes <= MAX_TOTAL_LOG_CONTENT_BYTES) return;
  throw createImportError('settings.log_import.errors.selected_logs_too_large', { max_mb: 256 });
}
/** Reads supported raw logs, preserving paths and counting source bytes before decoding. */
async function readRawImportLogFiles(
  files: File[],
  previousLogBytes: number
): Promise<{ files: EftLogInputFile[]; scanned: number; bytes: number }> {
  let totalLogBytes = 0;
  const extracted: EftLogInputFile[] = [];
  for (const file of files) {
    const relativePath = file.webkitRelativePath;
    const filePath = relativePath && relativePath.length > 0 ? relativePath : file.name;
    if (!isEftImportLogFileName(filePath)) continue;
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
    ensureTotalLogBytes(previousLogBytes + totalLogBytes);
    extracted.push({
      name: filePath,
      text: await file.text(),
    });
  }
  return {
    files: extracted,
    scanned: files.length,
    bytes: totalLogBytes,
  };
}
/** Filters supported archive entries and enforces declared log sizes before decompression. */
async function readZipLogs(
  file: File,
  previousLogBytes: number
): Promise<{ files: EftLogInputFile[]; scanned: number; bytes: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let scannedEntries = 0;
  let totalLogBytes = 0;
  let notificationEntries = 0;
  const extracted = unzipSync(bytes, {
    filter: (entry) => {
      scannedEntries += 1;
      if (!isEftImportLogFileName(entry.name)) {
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
      ensureTotalLogBytes(previousLogBytes + totalLogBytes);
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
    bytes: totalLogBytes,
  };
}
type ImportTaskIds = Record<GameMode, Set<string>>;
type ImportTaskSets = {
  completed: ImportTaskIds;
  started: ImportTaskIds;
  failed: ImportTaskIds;
};
/** Reports whether any authoritative task state will be applied to a destination. */
const hasModeImports = (sets: ImportTaskSets, mode: GameMode) =>
  [sets.completed[mode], sets.started[mode], sets.failed[mode]].some((ids) => ids.size > 0);
/** Reconciles routed events into disjoint completion, start, and failure sets for every mode. */
const buildImportTaskSets = (
  preview: EftLogsImportPreviewData,
  targetMode: GameMode
): ImportTaskSets => {
  const create = (): ImportTaskIds => ({ pvp: new Set(), pve: new Set(), seasonal: new Set() });
  const sets = { completed: create(), started: create(), failed: create() };
  for (const event of latestEftQuestEvents(preview.events, targetMode)) {
    if (!isEligibleImportEvent(event)) continue;
    sets[event.status][event.mode].add(event.questId);
  }
  return { completed: sets.completed, started: sets.started, failed: sets.failed };
};
/** Applies completion requirements without overriding explicit imported states or existing completions. */
const applyCompletedImports = (
  store: ReturnType<typeof useTarkovStore>,
  tasksMap: Map<string, Task>,
  completedTaskIds: Set<string>,
  explicitOtherStates: Set<string>
) => {
  const processedCompleted = new Set<string>();
  const processedFailed = new Set<string>();
  const completeTask = (taskId: string) => {
    if (processedCompleted.has(taskId) || explicitOtherStates.has(taskId)) return;
    completeTaskForProgress({ store, taskId, tasksMap });
    processedCompleted.add(taskId);
  };
  const failTask = (taskId: string) => {
    if (
      [completedTaskIds, explicitOtherStates, processedFailed].some((ids) => ids.has(taskId)) ||
      store.isTaskComplete(taskId)
    )
      return;
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
/** Allows restarts of failed tasks while preserving successful completed progress. */
const shouldStartImportedTask = (
  alreadyCompleted: boolean,
  flags: ReturnType<typeof getCompletionFlags>
) => !alreadyCompleted && (!flags.complete || flags.failed);
/** Restores active task state for imported starts that are not already successfully completed. */
const applyStartedImports = (
  store: ReturnType<typeof useTarkovStore>,
  completedTaskIds: Set<string>,
  startedTaskIds: Set<string>
) => {
  const completions = store.getCurrentProgressData().taskCompletions ?? {};
  for (const taskId of startedTaskIds) {
    const flags = getCompletionFlags(completions[taskId]);
    const shouldStart = shouldStartImportedTask(completedTaskIds.has(taskId), flags);
    if (shouldStart) store.setTaskActive(taskId);
  }
};
/** Persists explicit failures as manual failures so automatic state repair cannot remove them. */
const applyFailedImports = (
  store: ReturnType<typeof useTarkovStore>,
  tasksMap: Map<string, Task>,
  failed: Set<string>
) => {
  for (const taskId of failed) {
    if (!store.isTaskComplete(taskId))
      failTaskForProgress({ store, taskId, tasksMap, manual: true });
  }
};
/** Applies catalog-filtered events to one mode and tracks switches for later restoration. */
const applyModeImports = async (
  store: ReturnType<typeof useTarkovStore>,
  catalogs: Map<GameMode, Task[]>,
  mode: GameMode,
  activeMode: GameMode,
  taskSets: ImportTaskSets,
  onModeSwitched: (mode: GameMode) => void
): Promise<GameMode> => {
  const tasksMap = new Map((catalogs.get(mode) ?? []).map((task) => [task.id, task]));
  const filter = (ids: Set<string>) => new Set([...ids].filter((id) => tasksMap.has(id)));
  const completed = filter(taskSets.completed[mode]);
  const started = filter(taskSets.started[mode]);
  const failed = filter(taskSets.failed[mode]);
  if (![completed, started, failed].some((ids) => ids.size > 0)) return activeMode;
  if (activeMode !== mode) {
    onModeSwitched(mode);
    await store.switchGameMode(mode);
  }
  applyCompletedImports(store, tasksMap, completed, new Set([...started, ...failed]));
  applyFailedImports(store, tasksMap, failed);
  applyStartedImports(store, completed, started);
  return mode;
};
/** Restores the original mode after success or failure without losing the original import error. */
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
/** Applies each destination sequentially and returns enough state to restore the original mode. */
const applyAllModeImports = async (
  store: ReturnType<typeof useTarkovStore>,
  catalogs: Map<GameMode, Task[]>,
  originalMode: GameMode,
  taskSets: ImportTaskSets
): Promise<{ activeMode: GameMode; error: unknown }> => {
  let activeMode = originalMode;
  const trackMode = (mode: GameMode) => {
    activeMode = mode;
  };
  try {
    for (const mode of GAME_MODE_VALUES) {
      activeMode = await applyModeImports(store, catalogs, mode, activeMode, taskSets, trackMode);
    }
    return { activeMode, error: null };
  } catch (error) {
    return { activeMode, error };
  }
};
/** Coordinates bounded log reading, isolated metadata loading, preview selection, and guarded progress application. */
export function useEftLogsImport(): UseEftLogsImportReturn {
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const isImporting = ref(false);
  const importState = ref<EftLogsImportState>('idle');
  const previewData = ref<EftLogsImportPreviewData | null>(null);
  const importError = ref<string | null>(null);
  const sourceFiles = ref<EftLogInputFile[]>([]);
  const selectedVersions = ref<string[]>([]);
  const sourceFileName = ref(t('settings.log_import.selected_files'));
  const scannedEntriesCount = ref(0);
  let parseFilesRequestId = 0;
  let catalogs = new Map<GameMode, Task[]>();
  function getTaskIds(): string[] {
    return [...new Set([...catalogs.values()].flatMap((tasks) => tasks.map((task) => task.id)))];
  }
  /** Rebuilds the preview against the loaded destination catalogs and selected log versions. */
  function buildPreviewData(taskIds: string[]): EftLogsImportPreviewData {
    const parsed = parseEftLogsForQuestImport(sourceFiles.value, taskIds, {
      includedVersions: selectedVersions.value,
      taskIdsByMode: Object.fromEntries(
        [...catalogs].map(([mode, tasks]) => [mode, tasks.map((task) => task.id)])
      ),
    });
    return {
      ...parsed,
      scannedEntries: scannedEntriesCount.value,
      sourceFileName: sourceFileName.value,
    };
  }
  const canEditPreview = () => !isImporting.value && importState.value === 'preview';
  /** Updates a preview selection only while no import is applying. */
  function setIncludedVersions(versions: string[]): void {
    if (!canEditPreview()) return;
    if (!previewData.value) return;
    const availableSet = new Set(previewData.value.availableVersions);
    const normalized = Array.from(new Set(versions)).filter((version) => availableSet.has(version));
    if (normalized.length === 0) return;
    selectedVersions.value = normalized;
    previewData.value = buildPreviewData(getTaskIds());
    importError.value = null;
  }
  /** Invalidates pending parsing and clears transient import state unless progress application is active. */
  function reset(): void {
    if (isImporting.value) return;
    parseFilesRequestId++;
    catalogs = new Map();
    importState.value = 'idle';
    previewData.value = null;
    importError.value = null;
    sourceFiles.value = [];
    selectedVersions.value = [];
    sourceFileName.value = t('settings.log_import.selected_files');
    scannedEntriesCount.value = 0;
  }
  /** Reads the selected sources, validates their combined size, and loads all catalogs before previewing. */
  async function parseFiles(files: File[]): Promise<void> {
    if (isImporting.value) return;
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
      let totalLogBytes = 0;
      const rawLogFiles: File[] = [];
      for (const file of files) {
        ensureImportFileSize(file);
        if (isZipFile(file)) {
          const zipSource = await readZipLogs(file, totalLogBytes);
          if (!isActiveRequest()) return;
          scannedEntries += zipSource.scanned;
          totalLogBytes += zipSource.bytes;
          ensureTotalLogBytes(totalLogBytes);
          importFiles.push(...zipSource.files);
          continue;
        }
        rawLogFiles.push(file);
      }
      if (rawLogFiles.length > 0) {
        const rawSource = await readRawImportLogFiles(rawLogFiles, totalLogBytes);
        if (!isActiveRequest()) return;
        scannedEntries += rawSource.scanned;
        totalLogBytes += rawSource.bytes;
        ensureTotalLogBytes(totalLogBytes);
        importFiles.push(...rawSource.files);
      }
      if (!isActiveRequest()) return;
      if (!importFiles.some((file) => isEftNotificationLogFileName(file.name))) {
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
      const modes = new Set<GameMode>();
      for (const event of parsed.events) {
        if (event.mode === UNKNOWN_MODE) GAME_MODE_VALUES.forEach((mode) => modes.add(mode));
        else modes.add(event.mode);
      }
      const loadedCatalogs = await Promise.all(
        [...modes].map(async (mode) => {
          try {
            return [mode, await loadEftImportTaskCatalog(mode)] as const;
          } catch {
            throw createImportError('settings.log_import.errors.task_metadata_not_loaded');
          }
        })
      );
      if (!isActiveRequest()) return;
      catalogs = new Map(loadedCatalogs);
      if (
        parsed.dedupedCompletionEventCount === 0 &&
        parsed.dedupedStartedEventCount === 0 &&
        parsed.dedupedFailedEventCount === 0
      ) {
        importState.value = 'error';
        importError.value = t(
          parsed.skippedSeasonalEventCount
            ? 'settings.log_import.errors.outside_active_season'
            : 'settings.log_import.errors.no_quest_events_found'
        );
        return;
      }
      const catalogIds = new Set(getTaskIds());
      if (!parsed.events.some((event) => catalogIds.has(event.questId))) {
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
      previewData.value = buildPreviewData(getTaskIds());
      importState.value = 'preview';
    } catch (error) {
      if (!isActiveRequest()) return;
      importState.value = 'error';
      importError.value = normalizeErrorMessage(error, t);
      logger.error('[EftLogsImport] Parse error:', error);
    }
  }
  /** Routes a single selected file through the same guarded multi-source import flow. */
  async function parseFile(file: File): Promise<void> {
    await parseFiles([file]);
  }
  /** Validates the destination, Seasonal date constraints, and eligible task sets before any mutation. */
  function validateImport(
    preview: EftLogsImportPreviewData,
    targetMode: GameMode
  ): ImportTaskSets | null {
    if (!isGameMode(targetMode)) {
      importState.value = 'error';
      importError.value = t('settings.log_import.errors.invalid_mode');
      return null;
    }
    if (hasOutsideSeasonEvents(preview.events, targetMode)) {
      importError.value = t('settings.log_import.errors.outside_active_season');
      return null;
    }
    const taskSets = buildImportTaskSets(preview, targetMode);
    if (!GAME_MODE_VALUES.some((mode) => hasModeImports(taskSets, mode))) {
      importError.value = t('settings.log_import.errors.no_matching_tasks_found');
      return null;
    }
    return taskSets;
  }
  /** Prevents concurrent application and restores the original progress mode before reporting the result. */
  async function confirmImport(targetMode: GameMode): Promise<void> {
    if (!canEditPreview()) return;
    const preview = previewData.value;
    if (!preview) return;
    const taskSets = validateImport(preview, targetMode);
    if (!taskSets) return;
    const originalMode = tarkovStore.getCurrentGameMode();
    isImporting.value = true;
    const applied = await applyAllModeImports(tarkovStore, catalogs, originalMode, taskSets);
    const importFailure = await restoreImportMode(
      tarkovStore,
      applied.activeMode,
      originalMode,
      applied.error
    );
    isImporting.value = false;
    finishImport(importFailure);
  }
  /** Converts the completed application result into a translated error or success state. */
  function finishImport(importFailure: unknown): void {
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
    isImporting,
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
