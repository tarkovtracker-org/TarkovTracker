import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
const metadataStore: { tasks: Task[] } = {
  tasks: [{ id: '61604635c725987e815b1a46' }],
};
const tarkovStore = {
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
  switchGameMode: vi.fn(async () => undefined),
};
const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};
const i18nMessages: Record<string, string> = {
  'settings.log_import.selected_files': 'Selected files',
  'settings.log_import.selected_files_count': '{count} selected files',
  'settings.log_import.errors.apply_import_failed':
    'Failed to apply imported task completion data.',
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
const completionLog = (questId = '61604635c725987e815b1a46') => `
2026-02-21 10:14:24.222|Info|push-notifications|Got notification | ChatMessageReceived
{
  "type": "new_message",
  "eventId": "event-123",
  "dialogId": "54cb57776803fa99248b456e",
  "message": {
    "_id": "msg-1",
    "uid": "54cb57776803fa99248b456e",
    "type": 12,
    "dt": 1764602065,
    "text": "quest started",
    "templateId": "${questId} successMessageText 54cb57776803fa99248b456e 0"
  }
}
`;
const startedLog = (questId = '61604635c725987e815b1a46') => `
2026-02-21 10:14:20.000|Info|push-notifications|Got notification | ChatMessageReceived
{
  "type": "new_message",
  "eventId": "event-started",
  "dialogId": "54cb57776803fa99248b456e",
  "message": {
    "_id": "msg-started",
    "uid": "54cb57776803fa99248b456e",
    "type": 10,
    "dt": 1764602060,
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
