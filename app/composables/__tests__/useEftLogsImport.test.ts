import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_SEASON } from '@/utils/constants';
import type { Task } from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
const preferences = { getTasksRequireTraderLevels: true };
vi.mock('@/stores/usePreferences', () => ({ usePreferencesStore: () => preferences }));
const metadataStore: { tasks: Task[] } = {
  tasks: [{ id: '61604635c725987e815b1a46' }],
};
const tarkovStore = {
  playerLevel: vi.fn(() => 1),
  setLevel: vi.fn(),
  getTraderLevel: vi.fn(() => 1),
  getTraderReputation: vi.fn(() => 0),
  setTraderLevel: vi.fn(),
  setTraderReputation: vi.fn(),
  getObjectiveCount: vi.fn(() => 0),
  getCurrentGameMode: vi.fn<() => GameMode>(() => 'pvp'),
  getCurrentProgressData: vi.fn(() => ({ taskCompletions: {} })),
  isTaskComplete: vi.fn(() => false),
  setObjectiveCount: vi.fn(),
  setTaskComplete: vi.fn(),
  setTaskFailed: vi.fn(),
  setTaskObjectiveComplete: vi.fn(),
  setTaskObjectiveUncomplete: vi.fn(),
  setTaskUncompleted: vi.fn(),
  switchGameMode: vi.fn(async (_mode: GameMode) => undefined),
};
const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};
const i18nMessages: Record<string, string> = {
  'settings.log_import.errors.outside_active_season': 'Select logs from the active season.',
  'settings.log_import.selected_files': 'Selected files',
  'settings.log_import.selected_files_count': '{count} selected files',
  'settings.log_import.errors.apply_import_failed':
    'Import could not finish. Some progress may already have been imported. Select the same logs again to retry; completed progress is preserved.',
  'settings.log_import.errors.archive_log_file_too_large':
    'Log file is too large in archive: {path}',
  'settings.log_import.errors.archive_logs_too_large':
    'Archive contains too much log content (max {max_mb} MB).',
  'settings.log_import.errors.import_file_too_large': 'Import file is too large (max {max_mb} MB).',
  'settings.log_import.errors.log_file_too_large': 'Log file is too large (max {max_mb} MB).',
  'settings.log_import.errors.log_file_too_large_path': 'Log file is too large: {path}',
  'settings.log_import.errors.no_files_selected': 'No files were selected.',
  'settings.log_import.errors.no_logs_in_archive': 'No EFT logs were found in the archive.',
  'settings.log_import.errors.no_matching_tasks_found':
    'Quest events were found, but none match current TarkovTracker tasks.',
  'settings.log_import.errors.no_notification_logs_found':
    'No notification logs were found in the selected files.',
  'settings.log_import.errors.no_quest_events_found':
    'No quest start/completion events were found in the selected logs.',
  'settings.log_import.errors.parse_failed': 'Failed to parse EFT logs.',
  'settings.log_import.errors.selected_logs_too_large':
    'Selected logs contain too much content (max {max_mb} MB).',
  'settings.log_import.errors.task_metadata_not_loaded':
    'Task metadata is not loaded yet. Please refresh and try again.',
};
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataStore,
}));
vi.mock('@/utils/eftLogImportCatalog', () => ({
  loadEftImportTaskCatalog: vi.fn(async () => metadataStore.tasks),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => tarkovStore,
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      let value = i18nMessages[key] ?? key;
      if (!params) return value;
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replaceAll(`{${paramKey}}`, String(paramValue));
      }
      return value;
    },
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: mockLogger,
}));
const seasonDay = new Date(Date.parse(ACTIVE_SEASON.startsOn) + 86400000)
  .toISOString()
  .slice(0, 10);
const completionLog = (questId = '61604635c725987e815b1a46', day = '2026-02-21') => `
${day} 10:14:24.222|Info|push-notifications|Got notification | ChatMessageReceived
{
  "type": "new_message",
  "eventId": "event-123",
  "dialogId": "54cb57776803fa99248b456e",
  "message": {
    "_id": "msg-1",
    "uid": "54cb57776803fa99248b456e",
    "type": 12,
    "dt": ${Date.parse(`${day}T10:14:24.222Z`) / 1000},
    "text": "quest started",
    "templateId": "${questId} successMessageText 54cb57776803fa99248b456e 0"
  }
}
`;
const startedLog = (
  questId = '61604635c725987e815b1a46',
  day = '2026-02-21',
  time = '10:14:20.000'
) => `
${day} ${time}|Info|push-notifications|Got notification | ChatMessageReceived
{
  "type": "new_message",
  "eventId": "event-started",
  "dialogId": "54cb57776803fa99248b456e",
  "message": {
    "_id": "msg-started",
    "uid": "54cb57776803fa99248b456e",
    "type": 10,
    "dt": ${Date.parse(`${day}T${time}Z`) / 1000},
    "text": "quest started",
    "templateId": "${questId} description"
  }
}
`;
const backendLog = (host = 'prod-01.escapefromtarkov.com', path = '/client/quest/list') =>
  `2026-02-21 10:14:18.000|Info|backend|---> Request HTTPS, id [1]: URL: https://${host}${path}, crc: .`;
const loadComposable = async () => {
  const module = await import('@/composables/useEftLogsImport');
  return module.useEftLogsImport();
};
describe('useEftLogsImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metadataStore.tasks = [{ id: '61604635c725987e815b1a46' }];
    tarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    tarkovStore.getCurrentProgressData.mockReturnValue({ taskCompletions: {} });
    tarkovStore.switchGameMode.mockImplementation(async () => undefined);
  });
  it('enforces the aggregate byte limit across raw logs and ZIP entries', async () => {
    const rawFiles = Array.from({ length: 8 }, (_, index) => {
      const file = new File([completionLog()], `${index} notifications.log`);
      Object.defineProperty(file, 'size', { value: 32 * 1024 * 1024 });
      return file;
    });
    const lastRawRead = vi.spyOn(rawFiles[7]!, 'text');
    const archive = new File(
      [new Uint8Array(zipSync({ 'notifications.log': strToU8(completionLog()) }))],
      'Logs.zip'
    );
    const composable = await loadComposable();
    await composable.parseFiles([...rawFiles, archive]);
    expect(composable.importState.value).toBe('error');
    expect(composable.importError.value).toBe(
      'Selected logs contain too much content (max 256 MB).'
    );
    expect(lastRawRead).not.toHaveBeenCalled();
    expect(tarkovStore.switchGameMode).not.toHaveBeenCalled();
  });
  it.each([32 * 1024 * 1024 + 1, 513 * 1024 * 1024])(
    'skips oversized raw logs (%i bytes) without reading them',
    async (size) => {
      const importer = await loadComposable();
      const oversized = new File(['unused'], 'output_000.log');
      Object.defineProperty(oversized, 'size', { value: size });
      Object.defineProperty(oversized, 'webkitRelativePath', {
        value: 'Logs/session/output_000.log',
      });
      const read = vi.spyOn(oversized, 'text');
      await importer.parseFiles([oversized, new File([completionLog()], 'notifications.log')]);
      expect(importer.importState.value).toBe('preview');
      expect(read).not.toHaveBeenCalled();
      expect(importer.skippedLogPaths.value).toEqual(['Logs/session/output_000.log']);
      importer.setIncludedVersions(importer.previewData.value!.availableVersions);
      expect(importer.skippedLogPaths.value).toHaveLength(1);
      await importer.confirmImport('pve');
      expect(importer.importState.value).toBe('success');
      expect(importer.skippedLogPaths.value).toHaveLength(1);
      importer.reset();
      expect(importer.skippedLogPaths.value).toEqual([]);
    }
  );
  it('skips oversized ZIP entries before inflation and identifies their archive', async () => {
    const importer = await loadComposable();
    const archive = zipSync({
      'session/output_000.log': new Uint8Array(32 * 1024 * 1024 + 1),
      'session/notifications.log': strToU8(completionLog()),
    });
    await importer.parseFile(new File([new Uint8Array(archive)], 'Logs.zip'));
    expect(importer.importState.value).toBe('preview');
    expect(importer.skippedLogPaths.value).toEqual(['Logs.zip: session/output_000.log']);
    expect(importer.previewData.value?.scannedEntries).toBe(2);
    expect(importer.previewData.value?.matchedTaskIds).toEqual(['61604635c725987e815b1a46']);
  });
  it('reports skipped paths when no usable notifications remain and clears them on reselection', async () => {
    const importer = await loadComposable();
    const oversized = new File(['unused'], 'notifications.log');
    Object.defineProperty(oversized, 'size', { value: 32 * 1024 * 1024 + 1 });
    await importer.parseFile(oversized);
    expect(importer.importState.value).toBe('error');
    expect(importer.importError.value).toContain('No notification logs');
    expect(importer.skippedLogPaths.value).toEqual(['notifications.log']);
    expect(tarkovStore.setTaskComplete).not.toHaveBeenCalled();
    await importer.parseFile(new File([completionLog()], 'notifications.log'));
    expect(importer.importState.value).toBe('preview');
    expect(importer.skippedLogPaths.value).toEqual([]);
  });
  it('reports an archive containing only oversized notifications without applying progress', async () => {
    const importer = await loadComposable();
    const archive = zipSync({ 'notifications.log': new Uint8Array(32 * 1024 * 1024 + 1) });
    await importer.parseFile(new File([new Uint8Array(archive)], 'Large.zip'));
    expect(importer.importState.value).toBe('error');
    expect(importer.importError.value).toContain('No notification logs');
    expect(importer.skippedLogPaths.value).toEqual(['Large.zip: notifications.log']);
    expect(tarkovStore.setTaskComplete).not.toHaveBeenCalled();
  });
  it('does not let a stale read restore skipped paths after a new selection', async () => {
    const importer = await loadComposable();
    const oversized = new File([], 'output.log');
    Object.defineProperty(oversized, 'size', { value: 33 * 1024 * 1024 });
    const delayed = new File([], 'notifications.log');
    let finishRead!: (text: string) => void;
    vi.spyOn(delayed, 'text').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        })
    );
    const first = importer.parseFiles([oversized, delayed]);
    await importer.parseFile(new File([completionLog()], 'notifications.log'));
    finishRead(completionLog());
    await first;
    expect(importer.importState.value).toBe('preview');
    expect(importer.skippedLogPaths.value).toEqual([]);
  });
  it('allows the exact combined budget and does not charge skipped logs', async () => {
    const importer = await loadComposable();
    const files = Array.from({ length: 8 }, (_, index) => {
      const file = new File([completionLog()], `${index} notifications.log`);
      Object.defineProperty(file, 'size', { value: 32 * 1024 * 1024 });
      return file;
    });
    const oversized = new File(['unused'], 'output.log');
    Object.defineProperty(oversized, 'size', { value: 33 * 1024 * 1024 });
    await importer.parseFiles([oversized, ...files]);
    expect(importer.importState.value).toBe('preview');
    expect(importer.skippedLogPaths.value).toEqual(['output.log']);
  });
  it('ignores irrelevant archives alongside usable raw logs', async () => {
    const importer = await loadComposable();
    const archive = new File(
      [new Uint8Array(zipSync({ 'readme.txt': strToU8('ignored') }))],
      'Other.zip'
    );
    await importer.parseFiles([archive, new File([completionLog()], 'notifications.log')]);
    expect(importer.importState.value).toBe('preview');
  });
  it('rejects an oversized archive before reading it', async () => {
    const importer = await loadComposable();
    const archive = new File([], 'Logs.zip');
    Object.defineProperty(archive, 'size', { value: 512 * 1024 * 1024 + 1 });
    const read = vi.spyOn(archive, 'arrayBuffer');
    await importer.parseFile(archive);
    expect(importer.importState.value).toBe('error');
    expect(importer.importError.value).toContain('max 512 MB');
    expect(read).not.toHaveBeenCalled();
  });
  it('parses a single log file and exposes preview data', async () => {
    const composable = await loadComposable();
    const file = new File([completionLog()], '2026.02.21 notifications.log', {
      type: 'text/plain',
    });
    await composable.parseFile(file);
    expect(composable.importState.value).toBe('preview');
    expect(composable.previewData.value?.filesParsed).toBe(1);
    expect(composable.previewData.value?.matchedTaskIds).toEqual(['61604635c725987e815b1a46']);
  });
  it('parses notification logs from zip archives and ignores non-notification entries', async () => {
    const archiveBytes = zipSync({
      'session/backend_000.log': strToU8('not relevant'),
      'session/push-notifications_000.log': strToU8(completionLog()),
    });
    const composable = await loadComposable();
    const file = new File([new Uint8Array(archiveBytes)], 'Logs.zip', {
      type: 'application/zip',
    });
    await composable.parseFile(file);
    expect(composable.importState.value).toBe('preview');
    expect(composable.previewData.value?.filesParsed).toBe(1);
    expect(composable.previewData.value?.matchedTaskIds).toEqual(['61604635c725987e815b1a46']);
  });
  it('parses selected folder files and filters to notification logs only', async () => {
    const composable = await loadComposable();
    const notificationsFile = new File([completionLog()], 'push-notifications_000.log', {
      type: 'text/plain',
    });
    Object.defineProperty(notificationsFile, 'webkitRelativePath', {
      configurable: true,
      value: 'Logs/log_2026.02.21/push-notifications_000.log',
    });
    const backendFile = new File(['ignored'], 'backend_000.log', {
      type: 'text/plain',
    });
    Object.defineProperty(backendFile, 'webkitRelativePath', {
      configurable: true,
      value: 'Logs/log_2026.02.21/backend_000.log',
    });
    await composable.parseFiles([notificationsFile, backendFile]);
    expect(composable.importState.value).toBe('preview');
    expect(composable.previewData.value?.filesParsed).toBe(1);
    expect(composable.previewData.value?.matchedTaskIds).toEqual(['61604635c725987e815b1a46']);
  });
  it('sets error state when completion events do not match known tasks', async () => {
    const composable = await loadComposable();
    const file = new File([completionLog('5ac2426c86f774138762edfe')], 'notifications.log', {
      type: 'text/plain',
    });
    await composable.parseFile(file);
    expect(composable.importState.value).toBe('error');
    expect(composable.importError.value).toBe(
      'Quest events were found, but none match current TarkovTracker tasks.'
    );
  });
  it('marks matched tasks as completed in target mode and restores original mode', async () => {
    const composable = await loadComposable();
    const file = new File([completionLog()], 'notifications.log', {
      type: 'text/plain',
    });
    await composable.parseFile(file);
    await composable.confirmImport('pve');
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(1, 'pve');
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('61604635c725987e815b1a46');
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(2, 'pvp');
    expect(composable.importState.value).toBe('success');
  });
  it('restores the original mode when switching into an import mode throws after mutation', async () => {
    let currentMode: GameMode = 'pvp';
    tarkovStore.getCurrentGameMode.mockImplementation(() => currentMode);
    tarkovStore.switchGameMode.mockImplementation(async (mode: GameMode) => {
      currentMode = mode;
      if (mode === 'pve') throw new Error('switch persistence failed');
    });
    const composable = await loadComposable();
    const file = new File([completionLog()], 'notifications.log', {
      type: 'text/plain',
    });
    await composable.parseFile(file);
    await composable.confirmImport('pve');
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(1, 'pve');
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(2, 'pvp');
    expect(currentMode).toBe('pvp');
    expect(composable.importState.value).toBe('error');
  });
  it('reports partial progress when the second mode fails and permits reimporting the same logs', async () => {
    let currentMode: GameMode = 'pvp';
    const completed = new Set<GameMode>();
    tarkovStore.getCurrentGameMode.mockImplementation(() => currentMode);
    tarkovStore.setTaskComplete.mockImplementation(() => {
      completed.add(currentMode);
    });
    tarkovStore.switchGameMode.mockImplementation(async (mode: GameMode) => {
      currentMode = mode;
      if (mode === 'pve') throw new Error('second mode failed');
    });
    const files = [
      new File(
        [backendLog('prod-01.escapefromtarkov.com'), '\n', completionLog()],
        'pvp/notifications.log'
      ),
      new File(
        [
          backendLog('gw-pve-01.escapefromtarkov.com'),
          '\n',
          completionLog().replace('event-1', 'event-2').replace('msg-1', 'msg-2'),
        ],
        'pve/notifications.log'
      ),
    ];
    const importer = await loadComposable();
    await importer.parseFiles(files);
    await importer.confirmImport('pvp');
    expect(importer.importState.value).toBe('error');
    expect(importer.importError.value).toContain('Some progress may already have been imported');
    expect([...completed]).toEqual(['pvp']);
    expect(currentMode).toBe('pvp');
    tarkovStore.switchGameMode.mockImplementation(async (mode: GameMode) => {
      currentMode = mode;
    });
    await importer.parseFiles(files);
    await importer.confirmImport('pvp');
    expect(importer.importState.value).toBe('success');
    expect([...completed]).toEqual(['pvp', 'pve']);
    expect(currentMode).toBe('pvp');
    tarkovStore.setTaskComplete.mockReset();
  });
  it('rejects out-of-season unknown events before mutating Seasonal progress', async () => {
    const composable = await loadComposable();
    const file = new File([completionLog()], 'notifications.log', {
      type: 'text/plain',
    });
    await composable.parseFile(file);
    await (composable.confirmImport as (mode: string) => Promise<void>)('seasonal');
    expect(composable.importState.value).toBe('preview');
    expect(composable.importError.value).toBe('Select logs from the active season.');
    expect(tarkovStore.switchGameMode).not.toHaveBeenCalled();
    expect(tarkovStore.setTaskComplete).not.toHaveBeenCalled();
  });
  it('imports completions when predecessor metadata is missing', async () => {
    const taskId = '61604635c725987e815b1a46';
    metadataStore.tasks = [{ id: taskId, predecessors: ['missing-prerequisite'] }];
    const composable = await loadComposable();
    await composable.parseFile(
      new File([completionLog(taskId)], 'notifications.log', { type: 'text/plain' })
    );
    await composable.confirmImport('pvp');
    expect(composable.importState.value).toBe('success');
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledExactlyOnceWith(taskId);
    expect(tarkovStore.setTaskComplete).not.toHaveBeenCalledWith('missing-prerequisite');
    expect(tarkovStore.setTraderLevel).not.toHaveBeenCalled();
  });
  it('backfills required prerequisite tasks when importing a later completed task', async () => {
    const prerequisiteTaskId = '5ac2426c86f774138762edfe';
    const completedTaskId = '61604635c725987e815b1a46';
    metadataStore.tasks = [
      {
        id: prerequisiteTaskId,
        objectives: [{ id: 'obj-prerequisite', count: 2 }],
      },
      {
        id: completedTaskId,
        predecessors: [prerequisiteTaskId],
        taskRequirements: [{ task: { id: prerequisiteTaskId }, status: ['Complete'] }],
      },
    ];
    const composable = await loadComposable();
    const file = new File([completionLog(completedTaskId)], 'notifications.log', {
      type: 'text/plain',
    });
    await composable.parseFile(file);
    await composable.confirmImport('pvp');
    expect(tarkovStore.setTaskComplete).toHaveBeenNthCalledWith(1, prerequisiteTaskId);
    expect(tarkovStore.setTaskComplete).toHaveBeenNthCalledWith(2, completedTaskId);
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledTimes(2);
    expect(tarkovStore.setTaskObjectiveComplete).toHaveBeenCalledWith('obj-prerequisite');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-prerequisite', 2);
    expect(composable.importState.value).toBe('success');
  });
  it('does not infer a quest route from missing story progress', async () => {
    const prerequisiteTaskId = '5ac2426c86f774138762edfe';
    const completedTaskId = '61604635c725987e815b1a46';
    metadataStore.tasks = [
      { id: prerequisiteTaskId },
      {
        id: completedTaskId,
        storyUnlocks: [{ id: 'chapter', name: 'Story route' }],
        taskRequirements: [{ task: { id: prerequisiteTaskId }, status: ['Complete'] }],
      },
    ];
    const composable = await loadComposable();
    await composable.parseFile(
      new File([completionLog(completedTaskId)], 'notifications.log', { type: 'text/plain' })
    );
    await composable.confirmImport('pvp');
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledExactlyOnceWith(completedTaskId);
  });
  it('applies failed-only prerequisite requirements when importing completed tasks', async () => {
    const failedPrerequisiteTaskId = '593aa4be86f77457f56379f8';
    const completedTaskId = '61604635c725987e815b1a46';
    metadataStore.tasks = [
      {
        id: failedPrerequisiteTaskId,
        objectives: [{ id: 'obj-failed-prerequisite', count: 1 }],
      },
      {
        id: completedTaskId,
        taskRequirements: [{ task: { id: failedPrerequisiteTaskId }, status: ['Failed'] }],
      },
    ];
    const composable = await loadComposable();
    const file = new File([completionLog(completedTaskId)], 'notifications.log', {
      type: 'text/plain',
    });
    await composable.parseFile(file);
    await composable.confirmImport('pvp');
    expect(tarkovStore.setTaskFailed).toHaveBeenCalledWith(failedPrerequisiteTaskId);
    expect(tarkovStore.setTaskObjectiveUncomplete).toHaveBeenCalledWith('obj-failed-prerequisite');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-failed-prerequisite', 0);
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith(completedTaskId);
    expect(composable.importState.value).toBe('success');
  });
  it('marks started tasks as active when they are not completed or failed', async () => {
    const composable = await loadComposable();
    const file = new File([startedLog()], 'notifications.log', {
      type: 'text/plain',
    });
    await composable.parseFile(file);
    await composable.confirmImport('pvp');
    expect(tarkovStore.setTaskUncompleted).toHaveBeenCalledWith('61604635c725987e815b1a46');
    expect(composable.importState.value).toBe('success');
  });
  it('does not mark started tasks active when same task is also imported as completed', async () => {
    const composable = await loadComposable();
    const file = new File([startedLog() + completionLog()], 'notifications.log', {
      type: 'text/plain',
    });
    await composable.parseFile(file);
    await composable.confirmImport('pvp');
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('61604635c725987e815b1a46');
    expect(tarkovStore.setTaskUncompleted).not.toHaveBeenCalled();
  });
  it('auto-routes import mode from backend logs when session mode is detectable', async () => {
    const composable = await loadComposable();
    const notificationsFile = new File([completionLog()], 'push-notifications_000.log', {
      type: 'text/plain',
    });
    Object.defineProperty(notificationsFile, 'webkitRelativePath', {
      configurable: true,
      value: 'Logs/log_2026.02.21_10-00-00/push-notifications_000.log',
    });
    const backendFile = new File(
      [backendLog('gw-pve-01.escapefromtarkov.com', '/client/quest/list')],
      'backend_000.log',
      {
        type: 'text/plain',
      }
    );
    Object.defineProperty(backendFile, 'webkitRelativePath', {
      configurable: true,
      value: 'Logs/log_2026.02.21_10-00-00/backend_000.log',
    });
    await composable.parseFiles([notificationsFile, backendFile]);
    expect(composable.previewData.value?.matchedTaskIdsByMode.pve).toEqual([
      '61604635c725987e815b1a46',
    ]);
    await composable.confirmImport('pvp');
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(1, 'pve');
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('61604635c725987e815b1a46');
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(2, 'pvp');
  });
  it('defaults preview to latest major version and allows switching included versions', async () => {
    metadataStore.tasks = [{ id: '61604635c725987e815b1a46' }, { id: '5ac2426c86f774138762edfe' }];
    const composable = await loadComposable();
    const oldVersionFile = new File(
      [completionLog('61604635c725987e815b1a46')],
      '2025.07.17_20-43-24_0.16.8.1.38114 notifications.log',
      {
        type: 'text/plain',
      }
    );
    Object.defineProperty(oldVersionFile, 'webkitRelativePath', {
      configurable: true,
      value:
        'Logs/log_2025.07.17_20-43-24_0.16.8.1.38114/2025.07.17_20-43-24_0.16.8.1.38114 notifications.log',
    });
    const newVersionFile = new File(
      [completionLog('5ac2426c86f774138762edfe')],
      '2026.01.12_20-00-15_1.0.1.0.42625 push-notifications_000.log',
      {
        type: 'text/plain',
      }
    );
    Object.defineProperty(newVersionFile, 'webkitRelativePath', {
      configurable: true,
      value:
        'Logs/log_2026.01.12_20-00-15_1.0.1.0.42625/2026.01.12_20-00-15_1.0.1.0.42625 push-notifications_000.log',
    });
    await composable.parseFiles([oldVersionFile, newVersionFile]);
    expect(composable.previewData.value?.availableVersions).toEqual([
      '1.0.1.0.42625',
      '0.16.8.1.38114',
    ]);
    expect(composable.previewData.value?.includedVersions).toEqual(['1.0.1.0.42625']);
    expect(composable.previewData.value?.matchedTaskIds).toEqual(['5ac2426c86f774138762edfe']);
    composable.setIncludedVersions(['0.16.8.1.38114']);
    expect(composable.previewData.value?.includedVersions).toEqual(['0.16.8.1.38114']);
    expect(composable.previewData.value?.matchedTaskIds).toEqual(['61604635c725987e815b1a46']);
  });
});
describe('expanded log import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metadataStore.tasks = [{ id: '61604635c725987e815b1a46' }];
    tarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    tarkovStore.getCurrentProgressData.mockReturnValue({ taskCompletions: {} });
    tarkovStore.switchGameMode.mockImplementation(async () => undefined);
    tarkovStore.isTaskComplete.mockReturnValue(false);
  });
  it('does not write a notification replay into the mode active at replay time', async () => {
    const importer = await loadComposable();
    const original = completionLog(undefined, seasonDay);
    const replay = original.replace(`${seasonDay} 10:14:24.222`, `${seasonDay} 12:00:00.000`);
    await importer.parseFiles([
      new File(
        [
          `${seasonDay} 09:00:00.000|Info|application|Session mode: Regular\n${seasonDay} 11:00:00.000|Info|application|Session mode: Pve`,
        ],
        'application.log'
      ),
      new File([replay], 'late notifications.log'),
      new File([original], 'early notifications.log'),
    ]);
    await importer.confirmImport('pvp');
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledTimes(1);
    expect(tarkovStore.switchGameMode).not.toHaveBeenCalled();
  });
  it('imports a current Seasonal notification and restores the original mode', async () => {
    const importer = await loadComposable();
    const session = `${seasonDay.replaceAll('-', '.')}_10-00-00_1.1.0.1.46911`;
    const archive = zipSync({
      [`Logs/log_${session}/application.log`]: strToU8(
        `${seasonDay} 10:00:00.000|1.1.0.1.46911|Info|application|Session mode: PvpSeason`
      ),
      [`Logs/log_${session}/${session} push-notifications.log`]: strToU8(
        completionLog(undefined, seasonDay)
      ),
    });
    await importer.parseFile(new File([new Uint8Array(archive)], 'Logs.zip'));
    expect(importer.previewData.value?.matchedTaskIdsByMode.seasonal).toEqual([
      '61604635c725987e815b1a46',
    ]);
    await importer.confirmImport('pvp');
    expect(tarkovStore.switchGameMode.mock.calls).toEqual([['seasonal'], ['pvp']]);
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('61604635c725987e815b1a46');
    expect(importer.importState.value).toBe('success');
  });
  it('allows current unresolved events to be assigned to Seasonal', async () => {
    const importer = await loadComposable();
    await importer.parseFile(new File([completionLog(undefined, seasonDay)], 'notifications.log'));
    await importer.confirmImport('seasonal');
    expect(importer.importState.value).toBe('success');
    expect(tarkovStore.switchGameMode.mock.calls).toEqual([['seasonal'], ['pvp']]);
  });
  it('imports failure-only logs', async () => {
    const importer = await loadComposable();
    const failure = completionLog()
      .replace('"type": 12', '"type": 11')
      .replace('successMessageText', 'failMessageText');
    await importer.parseFile(new File([failure], 'notifications.log'));
    expect(importer.previewData.value?.matchedFailedTaskIds).toEqual(['61604635c725987e815b1a46']);
    await importer.confirmImport('pvp');
    expect(tarkovStore.setTaskFailed).toHaveBeenCalledWith('61604635c725987e815b1a46', {
      manual: true,
    });
    expect(tarkovStore.setTaskComplete).not.toHaveBeenCalled();
  });
  it('preserves existing completions when old logs show a failure', async () => {
    tarkovStore.isTaskComplete.mockReturnValue(true);
    const importer = await loadComposable();
    await importer.parseFile(
      new File([completionLog().replace('"type": 12', '"type": 11')], 'notifications.log')
    );
    await importer.confirmImport('pvp');
    expect(tarkovStore.setTaskFailed).not.toHaveBeenCalled();
  });
  it('reconciles unknown completions with known restarts after choosing a destination', async () => {
    const importer = await loadComposable();
    await importer.parseFiles([
      new File([completionLog()], 'notifications.log'),
      new File([backendLog()], 'backend.log'),
      new File([startedLog(undefined, '2026-02-21', '10:14:30.000')], 'push-notifications_001.log'),
    ]);
    await importer.confirmImport('pvp');
    expect(tarkovStore.setTaskUncompleted).toHaveBeenCalledWith('61604635c725987e815b1a46');
    expect(tarkovStore.setTaskComplete).not.toHaveBeenCalled();
  });
  it('keeps a single folder-selected file version instead of dropping its relative path', async () => {
    const importer = await loadComposable();
    const file = new File([completionLog()], 'notifications.log');
    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'Logs/log_2026.08.29_10-00-00_1.1.0.1.46911/notifications.log',
    });
    await importer.parseFiles([file]);
    expect(importer.previewData.value?.availableVersions).toEqual(['1.1.0.1.46911']);
  });
});
describe('destination catalog eligibility', () => {
  const taskId = '61604635c725987e815b1a46';
  beforeEach(() => {
    vi.clearAllMocks();
    metadataStore.tasks = [{ id: taskId }];
    tarkovStore.getCurrentGameMode.mockReturnValue('seasonal');
    tarkovStore.getCurrentProgressData.mockReturnValue({ taskCompletions: {} });
    tarkovStore.switchGameMode.mockImplementation(async () => undefined);
    tarkovStore.isTaskComplete.mockReturnValue(false);
  });
  it('does not let old unmatched daily quests block valid Seasonal imports', async () => {
    const importer = await loadComposable();
    await importer.parseFiles([
      new File([completionLog('aaaaaaaaaaaaaaaaaaaaaaaa')], 'notifications.log'),
      new File([completionLog(undefined, seasonDay)], 'push-notifications_001.log'),
    ]);
    await importer.confirmImport('seasonal');
    expect(importer.importState.value).toBe('success');
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith(taskId);
  });
  it('checks season eligibility after reconciling older states of the same task', async () => {
    const importer = await loadComposable();
    await importer.parseFiles([
      new File([startedLog()], 'notifications.log'),
      new File([completionLog(undefined, seasonDay)], 'push-notifications_001.log'),
    ]);
    await importer.confirmImport('seasonal');
    expect(importer.importState.value).toBe('success');
  });
  it('uses destination objectives rather than the currently selected mode metadata', async () => {
    const { loadEftImportTaskCatalog } = await import('@/utils/eftLogImportCatalog');
    vi.mocked(loadEftImportTaskCatalog).mockImplementationOnce(
      async () =>
        [
          { id: taskId, objectives: [{ id: 'destination-objective', type: 'giveItem', count: 5 }] },
        ] as Task[]
    );
    const importer = await loadComposable();
    await importer.parseFiles([
      new File([backendLog('gw-pve-01.escapefromtarkov.com')], 'backend.log'),
      new File([completionLog()], 'notifications.log'),
    ]);
    await importer.confirmImport('seasonal');
    expect(tarkovStore.setTaskObjectiveComplete).toHaveBeenCalledWith('destination-objective');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('destination-objective', 5);
  });
  it('does not mutate progress when a required destination catalog fails', async () => {
    const { loadEftImportTaskCatalog } = await import('@/utils/eftLogImportCatalog');
    vi.mocked(loadEftImportTaskCatalog).mockRejectedValueOnce(new Error('metadata unavailable'));
    const importer = await loadComposable();
    await importer.parseFiles([
      new File([backendLog('gw-pve-01.escapefromtarkov.com')], 'backend.log'),
      new File([completionLog()], 'notifications.log'),
    ]);
    expect(importer.importState.value).toBe('error');
    expect(tarkovStore.switchGameMode).not.toHaveBeenCalled();
    expect(tarkovStore.setTaskComplete).not.toHaveBeenCalled();
  });
});
describe('restart semantics', () => {
  it('restarts the actual stored failed shape with both complete and failed flags set', async () => {
    vi.clearAllMocks();
    const id = '61604635c725987e815b1a46';
    metadataStore.tasks = [{ id }];
    tarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    tarkovStore.getCurrentProgressData.mockReturnValue({
      taskCompletions: { [id]: { complete: true, failed: true } },
    });
    const importer = await loadComposable();
    await importer.parseFile(new File([startedLog(id)], 'notifications.log'));
    await importer.confirmImport('pvp');
    expect(tarkovStore.setTaskUncompleted).toHaveBeenCalledWith(id);
  });
});
describe('trader gating preference during import', () => {
  it.each([false, true])('respects trader gating = %s in the destination', async (enabled) => {
    vi.clearAllMocks();
    preferences.getTasksRequireTraderLevels = enabled;
    const id = '61604635c725987e815b1a46';
    metadataStore.tasks = [
      {
        id,
        minPlayerLevel: 5,
        traderRequirements: [
          {
            id: 'll',
            requirementType: 'level',
            trader: { id: 'prapor' },
            compareMethod: '>=',
            value: 2,
          },
          {
            id: 'rep',
            requirementType: 'reputation',
            trader: { id: 'prapor' },
            compareMethod: '>=',
            value: 0.2,
          },
        ],
      },
    ] as Task[];
    let current: GameMode = 'pvp';
    const writtenModes: GameMode[] = [];
    tarkovStore.getCurrentGameMode.mockImplementation(() => current);
    tarkovStore.switchGameMode.mockImplementation(async (mode) => {
      current = mode;
    });
    tarkovStore.setTraderLevel.mockImplementation(() => {
      writtenModes.push(current);
    });
    tarkovStore.getCurrentProgressData.mockReturnValue({ taskCompletions: {} });
    const importer = await loadComposable();
    await importer.parseFiles([
      new File([backendLog('gw-pve-01.escapefromtarkov.com')], 'backend.log'),
      new File([completionLog(id)], 'notifications.log'),
    ]);
    await importer.confirmImport('pvp');
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith(id);
    expect(tarkovStore.setLevel).toHaveBeenCalledWith(5);
    expect(tarkovStore.setTraderLevel).toHaveBeenCalledTimes(enabled ? 1 : 0);
    expect(tarkovStore.setTraderReputation).toHaveBeenCalledTimes(enabled ? 1 : 0);
    expect(writtenModes).toEqual(enabled ? ['pve'] : []);
    expect(current).toBe('pvp');
    preferences.getTasksRequireTraderLevels = true;
  });
});
