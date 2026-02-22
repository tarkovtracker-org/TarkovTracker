import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataManagementCard from '@/features/settings/DataManagementCard.vue';
const {
  backupFns,
  backupState,
  eftLogsFns,
  eftLogsState,
  tarkovDevFns,
  tarkovDevState,
  toastAddMock,
  tarkovStoreState,
} = vi.hoisted(() => ({
  backupFns: {
    confirmBackupImport: vi.fn(async () => undefined),
    exportProgress: vi.fn(async () => undefined),
    parseBackupFile: vi.fn(async () => undefined),
    resetImport: vi.fn(),
  },
  backupState: {
    exportError: { __v_isRef: true as const, value: null as string | null },
    importError: { __v_isRef: true as const, value: null as string | null },
    importPreview: { __v_isRef: true as const, value: null as Record<string, unknown> | null },
    importState: {
      __v_isRef: true as const,
      value: 'idle' as 'idle' | 'preview' | 'success' | 'error',
    },
  },
  tarkovDevFns: {
    confirmImport: vi.fn(async () => undefined),
    parseFile: vi.fn(async () => undefined),
    reset: vi.fn(),
  },
  tarkovDevState: {
    importError: { __v_isRef: true as const, value: null as string | null },
    previewData: { __v_isRef: true as const, value: null as Record<string, unknown> | null },
    importState: {
      __v_isRef: true as const,
      value: 'idle' as 'idle' | 'preview' | 'success' | 'error',
    },
  },
  eftLogsFns: {
    confirmImport: vi.fn(async () => undefined),
    parseFile: vi.fn(async () => undefined),
    parseFiles: vi.fn(async () => undefined),
    reset: vi.fn(),
    setIncludedVersions: vi.fn(),
  },
  eftLogsState: {
    importError: { __v_isRef: true as const, value: null as string | null },
    previewData: { __v_isRef: true as const, value: null as Record<string, unknown> | null },
    importState: {
      __v_isRef: true as const,
      value: 'idle' as 'idle' | 'preview' | 'success' | 'error',
    },
  },
  toastAddMock: vi.fn(),
  tarkovStoreState: {
    currentMode: 'pvp' as 'pvp' | 'pve',
    tarkovUid: null as number | null,
  },
}));
mockNuxtImport('useToast', () => () => ({
  add: toastAddMock,
}));
vi.mock('@/composables/useDataBackup', () => ({
  useDataBackup: () => ({
    exportProgress: backupFns.exportProgress,
    exportError: backupState.exportError,
    importState: backupState.importState,
    importPreview: backupState.importPreview,
    importError: backupState.importError,
    parseBackupFile: backupFns.parseBackupFile,
    confirmBackupImport: backupFns.confirmBackupImport,
    resetImport: backupFns.resetImport,
  }),
}));
vi.mock('@/composables/useTarkovDevImport', () => ({
  useTarkovDevImport: () => ({
    importState: tarkovDevState.importState,
    previewData: tarkovDevState.previewData,
    importError: tarkovDevState.importError,
    parseFile: tarkovDevFns.parseFile,
    confirmImport: tarkovDevFns.confirmImport,
    reset: tarkovDevFns.reset,
  }),
}));
vi.mock('@/composables/useEftLogsImport', () => ({
  useEftLogsImport: () => ({
    importState: eftLogsState.importState,
    previewData: eftLogsState.previewData,
    importError: eftLogsState.importError,
    parseFile: eftLogsFns.parseFile,
    parseFiles: eftLogsFns.parseFiles,
    setIncludedVersions: eftLogsFns.setIncludedVersions,
    confirmImport: eftLogsFns.confirmImport,
    reset: eftLogsFns.reset,
  }),
}));
vi.mock('@/stores/useMetadata', () => {
  const taskNamesById: Record<string, string> = {
    '5ac2426c86f774138762edfe': 'Shortage',
    '61604635c725987e815b1a46': 'An Apple a Day Keeps the Doctor Away',
  };
  return {
    useMetadataStore: () => ({
      editions: [
        { value: 1, title: 'Standard' },
        { value: 2, title: 'Left Behind' },
      ],
      getTaskById: (taskId: string) => {
        const name = taskNamesById[taskId];
        if (!name) return undefined;
        return { id: taskId, name };
      },
      playerLevels: [{ exp: 0, level: 1 }],
      tasks: Object.entries(taskNamesById).map(([id, name]) => ({ id, name })),
    }),
  };
});
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => tarkovStoreState.currentMode,
    getPvEProgressData: () => ({}),
    getPvPProgressData: () => ({}),
    getTarkovUid: () => tarkovStoreState.tarkovUid,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params && typeof params === 'object') {
        return `${key}:${JSON.stringify(params)}`;
      }
      return key;
    },
  }),
}));
const UButton = {
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  props: ['disabled', 'href', 'target', 'rel'],
  emits: ['click'],
};
const findButtonByText = (wrapper: ReturnType<typeof mount>, text: string) => {
  return wrapper.findAll('button').find((button) => button.text().includes(text));
};
const asVm = <T>(vm: unknown) => vm as T;
describe('DataManagementCard', () => {
  beforeEach(() => {
    backupFns.confirmBackupImport.mockReset();
    backupFns.exportProgress.mockReset();
    backupFns.parseBackupFile.mockReset();
    backupFns.resetImport.mockReset();
    tarkovDevFns.confirmImport.mockReset();
    tarkovDevFns.parseFile.mockReset();
    tarkovDevFns.reset.mockReset();
    eftLogsFns.confirmImport.mockReset();
    eftLogsFns.parseFile.mockReset();
    eftLogsFns.parseFiles.mockReset();
    eftLogsFns.reset.mockReset();
    eftLogsFns.setIncludedVersions.mockReset();
    toastAddMock.mockReset();
    backupState.exportError.value = null;
    backupState.importError.value = null;
    backupState.importPreview.value = null;
    backupState.importState.value = 'idle';
    tarkovDevState.importError.value = null;
    tarkovDevState.importState.value = 'idle';
    tarkovDevState.previewData.value = null;
    eftLogsState.importError.value = null;
    eftLogsState.importState.value = 'idle';
    eftLogsState.previewData.value = null;
    tarkovStoreState.currentMode = 'pvp';
    tarkovStoreState.tarkovUid = null;
  });
  const createWrapper = () =>
    mount(DataManagementCard, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          GameModeToggle: true,
          GenericCard: {
            template: '<div><slot name="content" /></div>',
          },
          ResetProgressSection: true,
          UAlert: true,
          UButton,
          UIcon: true,
          UInput: {
            template:
              '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
            props: ['modelValue'],
            emits: ['update:modelValue'],
          },
          UTooltip: {
            template: '<div><slot /></div>',
          },
          UCheckbox: {
            template:
              '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:model-value\', $event.target.checked)" />',
            props: ['disabled', 'label', 'modelValue'],
            emits: ['update:model-value'],
          },
          USeparator: true,
        },
      },
    });
  it('shows toast when export fails', async () => {
    backupState.exportError.value = 'Export failed';
    backupFns.exportProgress.mockImplementation(async () => {
      throw new Error('export failed');
    });
    const wrapper = createWrapper();
    const exportButton = findButtonByText(wrapper, 'settings.data_management.export_button');
    expect(exportButton).toBeTruthy();
    await exportButton!.trigger('click');
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        description: 'Export failed',
        title: 'settings.data_management.export_error_title',
      })
    );
  });
  it('confirms backup import and shows success toast', async () => {
    backupState.importState.value = 'preview';
    backupFns.confirmBackupImport.mockImplementation(async () => {
      backupState.importState.value = 'success';
    });
    const wrapper = createWrapper();
    await asVm<{ handleBackupConfirm: () => Promise<void> }>(wrapper.vm).handleBackupConfirm();
    expect(backupFns.confirmBackupImport).toHaveBeenCalledWith({ pve: true, pvp: true });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: 'settings.data_management.import_success_title',
      })
    );
  });
  it('forwards tarkov.dev confirmation using current target mode', async () => {
    tarkovStoreState.currentMode = 'pve';
    const wrapper = createWrapper();
    await asVm<{ handleTarkovDevConfirm: () => Promise<void> }>(
      wrapper.vm
    ).handleTarkovDevConfirm();
    expect(tarkovDevFns.confirmImport).toHaveBeenCalledWith('pve');
    asVm<{ resetTarkovDevImport: () => void }>(wrapper.vm).resetTarkovDevImport();
    expect(tarkovDevFns.reset).toHaveBeenCalledTimes(1);
  });
  it('forwards EFT logs confirmation using current target mode', async () => {
    tarkovStoreState.currentMode = 'pve';
    const wrapper = createWrapper();
    await asVm<{ handleEftLogsConfirm: () => Promise<void> }>(wrapper.vm).handleEftLogsConfirm();
    expect(eftLogsFns.confirmImport).toHaveBeenCalledWith('pve');
    asVm<{ resetEftLogsImport: () => void }>(wrapper.vm).resetEftLogsImport();
    expect(eftLogsFns.reset).toHaveBeenCalledTimes(1);
  });
  it('hides EFT mode toggle when all matched events are auto-detected', () => {
    eftLogsState.importState.value = 'preview';
    eftLogsState.previewData.value = {
      chatMessageCount: 2,
      completionEventCount: 1,
      dedupedCompletionEventCount: 1,
      dedupedStartedEventCount: 0,
      filesParsed: 1,
      matchedStartedTaskIds: [],
      matchedStartedTaskIdsByMode: { pve: [], pvp: [], unknown: [] },
      matchedTaskIds: ['61604635c725987e815b1a46'],
      matchedTaskIdsByMode: { pve: [], pvp: ['61604635c725987e815b1a46'], unknown: [] },
      questIds: ['61604635c725987e815b1a46'],
      scannedEntries: 20,
      sourceFileName: 'Logs.zip',
      startedEventCount: 0,
      startedQuestIds: [],
      unmatchedQuestIds: [],
      unmatchedStartedQuestIds: [],
    };
    const wrapper = createWrapper();
    expect(wrapper.find('game-mode-toggle-stub').exists()).toBe(false);
    expect(wrapper.text()).toContain('settings.log_import.mode_summary_pvp');
  });
  it('shows EFT mode toggle when unknown-mode events are present', () => {
    eftLogsState.importState.value = 'preview';
    eftLogsState.previewData.value = {
      chatMessageCount: 2,
      completionEventCount: 1,
      dedupedCompletionEventCount: 1,
      dedupedStartedEventCount: 0,
      filesParsed: 1,
      matchedStartedTaskIds: [],
      matchedStartedTaskIdsByMode: { pve: [], pvp: [], unknown: ['5ac2426c86f774138762edfe'] },
      matchedTaskIds: ['61604635c725987e815b1a46'],
      matchedTaskIdsByMode: { pve: [], pvp: [], unknown: ['61604635c725987e815b1a46'] },
      questIds: ['61604635c725987e815b1a46'],
      scannedEntries: 20,
      sourceFileName: 'Logs.zip',
      startedEventCount: 0,
      startedQuestIds: [],
      unmatchedQuestIds: [],
      unmatchedStartedQuestIds: [],
    };
    const wrapper = createWrapper();
    expect(wrapper.find('game-mode-toggle-stub').exists()).toBe(true);
    expect(wrapper.text()).toContain(
      'An Apple a Day Keeps the Doctor Away (61604635c725987e815b1a46)'
    );
    expect(wrapper.text()).toContain('Shortage (5ac2426c86f774138762edfe)');
  });
  it('excludes completed tasks from EFT active task count', () => {
    eftLogsState.importState.value = 'preview';
    eftLogsState.previewData.value = {
      chatMessageCount: 3,
      completionEventCount: 2,
      dedupedCompletionEventCount: 2,
      dedupedStartedEventCount: 2,
      filesParsed: 1,
      matchedStartedTaskIds: ['61604635c725987e815b1a46', '5ac2426c86f774138762edfe'],
      matchedStartedTaskIdsByMode: {
        pve: [],
        pvp: ['61604635c725987e815b1a46', '5ac2426c86f774138762edfe'],
        unknown: [],
      },
      matchedTaskIds: ['61604635c725987e815b1a46'],
      matchedTaskIdsByMode: { pve: [], pvp: ['61604635c725987e815b1a46'], unknown: [] },
      questIds: ['61604635c725987e815b1a46'],
      scannedEntries: 30,
      sourceFileName: 'Logs.zip',
      startedEventCount: 2,
      startedQuestIds: ['61604635c725987e815b1a46', '5ac2426c86f774138762edfe'],
      unmatchedQuestIds: [],
      unmatchedStartedQuestIds: [],
    };
    const wrapper = createWrapper();
    expect(asVm<{ eftLogsCompletedCount: number }>(wrapper.vm).eftLogsCompletedCount).toBe(1);
    expect(asVm<{ eftLogsActiveCount: number }>(wrapper.vm).eftLogsActiveCount).toBe(1);
  });
});
