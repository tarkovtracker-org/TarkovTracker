import { strFromU8, unzipSync } from 'fflate';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { GAME_MODES, type GameMode } from '@/utils/constants';
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
  confirmImport: (targetMode: GameMode) => Promise<void>;
  reset: () => void;
}
function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim().length) {
    return error.message;
  }
  return 'Failed to parse EFT logs';
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
  throw new Error('Import file is too large (max 512 MB).');
}
async function readSingleLogFile(
  file: File
): Promise<{ files: EftLogInputFile[]; scanned: number }> {
  if (file.size > MAX_SINGLE_LOG_SIZE_BYTES) {
    throw new Error('Log file is too large (max 32 MB).');
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
      throw new Error(`Log file is too large: ${filePath}`);
    }
    totalLogBytes += file.size;
    if (totalLogBytes > MAX_TOTAL_LOG_CONTENT_BYTES) {
      throw new Error('Selected logs contain too much content (max 256 MB).');
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
        throw new Error(`Log file is too large in archive: ${entry.name}`);
      }
      totalLogBytes += entry.originalSize;
      if (totalLogBytes > MAX_TOTAL_LOG_CONTENT_BYTES) {
        throw new Error('Archive contains too much log content (max 256 MB).');
      }
      return true;
    },
  });
  if (notificationEntries === 0) {
    throw new Error('No EFT logs were found in the archive.');
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
export function useEftLogsImport(): UseEftLogsImportReturn {
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const importState = ref<EftLogsImportState>('idle');
  const previewData = ref<EftLogsImportPreviewData | null>(null);
  const importError = ref<string | null>(null);
  const sourceFiles = ref<EftLogInputFile[]>([]);
  const selectedVersions = ref<string[]>([]);
  const sourceFileName = ref('Selected files');
  const scannedEntriesCount = ref(0);
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
    importState.value = 'idle';
    previewData.value = null;
    importError.value = null;
    sourceFiles.value = [];
    selectedVersions.value = [];
    sourceFileName.value = 'Selected files';
    scannedEntriesCount.value = 0;
  }
  async function parseFiles(files: File[]): Promise<void> {
    importState.value = 'idle';
    previewData.value = null;
    importError.value = null;
    sourceFiles.value = [];
    selectedVersions.value = [];
    sourceFileName.value = 'Selected files';
    scannedEntriesCount.value = 0;
    if (!Array.isArray(files) || files.length === 0) {
      importState.value = 'error';
      importError.value = 'No files were selected.';
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
          scannedEntries += zipSource.scanned;
          importFiles.push(...zipSource.files);
          continue;
        }
        rawLogFiles.push(file);
      }
      if (rawLogFiles.length > 0) {
        if (rawLogFiles.length === 1) {
          const singleSource = await readSingleLogFile(rawLogFiles[0]!);
          scannedEntries += singleSource.scanned;
          importFiles.push(...singleSource.files);
        } else {
          const rawSource = await readRawImportLogFiles(rawLogFiles);
          scannedEntries += rawSource.scanned;
          importFiles.push(...rawSource.files);
        }
      }
      if (importFiles.length === 0) {
        importState.value = 'error';
        importError.value = 'No notifications logs were found in the selected files.';
        return;
      }
      const tasks = metadataStore.tasks;
      if (!Array.isArray(tasks) || tasks.length === 0) {
        importState.value = 'error';
        importError.value = 'Task metadata is not loaded yet. Please refresh and try again.';
        return;
      }
      const taskIds = tasks.map((task) => task.id);
      const parsed = parseEftLogsForQuestImport(importFiles, taskIds);
      if (parsed.dedupedCompletionEventCount === 0 && parsed.dedupedStartedEventCount === 0) {
        importState.value = 'error';
        importError.value = 'No quest start/completion events were found in the selected logs.';
        return;
      }
      if (parsed.matchedTaskIds.length === 0 && parsed.matchedStartedTaskIds.length === 0) {
        importState.value = 'error';
        importError.value = 'Quest events were found, but none match current TarkovTracker tasks.';
        return;
      }
      sourceFiles.value = importFiles;
      scannedEntriesCount.value = scannedEntries;
      sourceFileName.value =
        files.length === 1
          ? (files[0]?.name ?? 'Selected files')
          : `${files.length} selected files`;
      selectedVersions.value = selectDefaultIncludedVersions(parsed.availableVersions);
      if (selectedVersions.value.length === 0) {
        selectedVersions.value = parsed.availableVersions;
      }
      previewData.value = buildPreviewData(taskIds);
      importState.value = 'preview';
    } catch (error) {
      importState.value = 'error';
      importError.value = normalizeErrorMessage(error);
      logger.error('[EftLogsImport] Parse error:', error);
    }
  }
  async function parseFile(file: File): Promise<void> {
    await parseFiles([file]);
  }
  async function confirmImport(targetMode: GameMode): Promise<void> {
    if (!previewData.value) return;
    const originalMode = tarkovStore.getCurrentGameMode();
    let activeMode = originalMode;
    const tasksMap = new Map<string, Task>();
    metadataStore.tasks.forEach((task) => {
      tasksMap.set(task.id, task);
    });
    const completedTaskIdsByMode: Record<GameMode, Set<string>> = {
      [GAME_MODES.PVP]: new Set(previewData.value.matchedTaskIdsByMode[GAME_MODES.PVP]),
      [GAME_MODES.PVE]: new Set(previewData.value.matchedTaskIdsByMode[GAME_MODES.PVE]),
    };
    const startedTaskIdsByMode: Record<GameMode, Set<string>> = {
      [GAME_MODES.PVP]: new Set(previewData.value.matchedStartedTaskIdsByMode[GAME_MODES.PVP]),
      [GAME_MODES.PVE]: new Set(previewData.value.matchedStartedTaskIdsByMode[GAME_MODES.PVE]),
    };
    for (const taskId of previewData.value.matchedTaskIdsByMode[UNKNOWN_MODE]) {
      completedTaskIdsByMode[targetMode].add(taskId);
    }
    for (const taskId of previewData.value.matchedStartedTaskIdsByMode[UNKNOWN_MODE]) {
      startedTaskIdsByMode[targetMode].add(taskId);
    }
    let importFailure: unknown = null;
    try {
      for (const mode of [GAME_MODES.PVP, GAME_MODES.PVE] as const) {
        const completedTaskIds = completedTaskIdsByMode[mode];
        const startedTaskIds = startedTaskIdsByMode[mode];
        const processedCompletedTaskIds = new Set<string>();
        const processedFailedTaskIds = new Set<string>();
        const completeTaskForImport = (taskId: string) => {
          if (processedCompletedTaskIds.has(taskId)) return;
          completeTaskForProgress({
            store: tarkovStore,
            taskId,
            tasksMap,
          });
          processedCompletedTaskIds.add(taskId);
        };
        const failTaskForImport = (taskId: string) => {
          if (completedTaskIds.has(taskId)) return;
          if (processedFailedTaskIds.has(taskId)) return;
          failTaskForProgress({
            store: tarkovStore,
            taskId,
            tasksMap,
          });
          processedFailedTaskIds.add(taskId);
        };
        if (completedTaskIds.size === 0 && startedTaskIds.size === 0) continue;
        if (activeMode !== mode) {
          await tarkovStore.switchGameMode(mode);
          activeMode = mode;
        }
        for (const taskId of completedTaskIds) {
          const completedTask = tasksMap.get(taskId);
          if (completedTask) {
            applyTaskAvailabilityRequirements({
              onCompleteRequirement: completeTaskForImport,
              onFailRequirement: failTaskForImport,
              task: completedTask,
            });
          }
          completeTaskForImport(taskId);
        }
        const taskCompletions = tarkovStore.getCurrentProgressData().taskCompletions ?? {};
        for (const taskId of startedTaskIds) {
          if (completedTaskIds.has(taskId)) continue;
          const flags = getCompletionFlags(taskCompletions[taskId]);
          if (flags.complete || flags.failed) continue;
          tarkovStore.setTaskUncompleted(taskId);
        }
      }
    } catch (error) {
      importFailure = error;
    }
    if (activeMode !== originalMode) {
      try {
        await tarkovStore.switchGameMode(originalMode);
        activeMode = originalMode;
      } catch (error) {
        if (!importFailure) {
          importFailure = error;
        }
        logger.error('[EftLogsImport] Failed restoring game mode:', error);
      }
    }
    if (importFailure) {
      importState.value = 'error';
      importError.value = 'Failed to apply imported task completion data.';
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
