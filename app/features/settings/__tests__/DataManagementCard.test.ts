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
    exportDebugSnapshot: vi.fn(async () => undefined),
    exportProgress: vi.fn(async () => undefined),
    parseBackupFile: vi.fn(async () => undefined),
    resetImport: vi.fn(),
  },
  backupState: {
    debugExportError: { __v_isRef: true as const, value: null as string | null },
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
    parseProfileUrl: vi.fn<
      (profileUrl: string) => Promise<{
        mode: 'pvp' | 'pve' | null;
        profileJsonUrl: string;
        tarkovUid: number;
      } | null>
    >(async () => null),
    reset: vi.fn(),
  },
  tarkovDevState: {
    importError: { __v_isRef: true as const, value: null as string | null },
    previewData: { __v_isRef: true as const, value: null as Record<string, unknown> | null },
    importState: {
      __v_isRef: true as const,
      value: 'idle' as 'idle' | 'loading' | 'preview' | 'success' | 'error',
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
    setTarkovUid: vi.fn<(uid: number | null) => void>(),
    tarkovUid: null as number | null,
  },
}));
mockNuxtImport('useToast', () => () => ({
  add: toastAddMock,
}));
vi.mock('@/composables/useDataBackup', () => ({
  useDataBackup: () => ({
    exportDebugSnapshot: backupFns.exportDebugSnapshot,
    debugExportError: backupState.debugExportError,
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
    parseProfileUrl: tarkovDevFns.parseProfileUrl,
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
    setTarkovUid: tarkovStoreState.setTarkovUid,
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
  props: ['disabled', 'href', 'loading', 'target', 'rel'],
  emits: ['click'],
};
const findButtonByText = (wrapper: ReturnType<typeof mount>, text: string) => {
  return wrapper.findAll('button').find((button) => button.text().includes(text));
};
const asVm = <T>(vm: unknown) => vm as T;
describe('DataManagementCard', () => {
  beforeEach(() => {
    backupFns.confirmBackupImport.mockReset();
    backupFns.exportDebugSnapshot.mockReset();
    backupFns.exportProgress.mockReset();
    backupFns.parseBackupFile.mockReset();
    backupFns.resetImport.mockReset();
    tarkovDevFns.confirmImport.mockReset();
    tarkovDevFns.parseFile.mockReset();
    tarkovDevFns.parseProfileUrl.mockReset();
    tarkovDevFns.reset.mockReset();
    eftLogsFns.confirmImport.mockReset();
    eftLogsFns.parseFile.mockReset();
    eftLogsFns.parseFiles.mockReset();
    eftLogsFns.reset.mockReset();
    eftLogsFns.setIncludedVersions.mockReset();
    tarkovStoreState.setTarkovUid.mockClear();
    tarkovStoreState.setTarkovUid.mockImplementation((uid: number | null) => {
      tarkovStoreState.tarkovUid = uid;
    });
    toastAddMock.mockReset();
    backupState.debugExportError.value = null;
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
  const createWrapper = (props: { view?: 'all' | 'imports' | 'backup' } = {}) =>
    mount(DataManagementCard, {
      props,
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
              '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
            props: ['disabled', 'modelValue'],
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
  it('limits the imports view to profile and log import actions', () => {
    const wrapper = createWrapper({ view: 'imports' });
    expect(findButtonByText(wrapper, 'settings.tarkov_dev_import.fetch_profile')).toBeTruthy();
    expect(
      findButtonByText(wrapper, 'settings.data_management.import_eft_logs_folder_button')
    ).toBeTruthy();
    expect(findButtonByText(wrapper, 'settings.data_management.export_button')).toBeUndefined();
    expect(
      findButtonByText(wrapper, 'settings.data_management.debug_export_button')
    ).toBeUndefined();
  });
  it('limits the backup view to backup and debug actions', () => {
    const wrapper = createWrapper({ view: 'backup' });
    expect(findButtonByText(wrapper, 'settings.data_management.export_button')).toBeTruthy();
    expect(findButtonByText(wrapper, 'settings.data_management.debug_export_button')).toBeTruthy();
    expect(findButtonByText(wrapper, 'settings.tarkov_dev_import.fetch_profile')).toBeUndefined();
    expect(
      findButtonByText(wrapper, 'settings.data_management.import_eft_logs_folder_button')
    ).toBeUndefined();
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
  it('shows toast when debug export fails', async () => {
    backupState.debugExportError.value = 'Debug export failed';
    backupFns.exportDebugSnapshot.mockImplementation(async () => {
      throw new Error('debug export failed');
    });
    const wrapper = createWrapper();
    const exportButton = findButtonByText(wrapper, 'settings.data_management.debug_export_button');
    expect(exportButton).toBeTruthy();
    await exportButton!.trigger('click');
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        description: 'Debug export failed',
        title: 'settings.data_management.debug_export_error_title',
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
  it('fetches tarkov.dev profile url and uses the url mode for import preview', async () => {
    tarkovDevFns.parseProfileUrl.mockResolvedValue({
      mode: 'pve',
      profileJsonUrl: 'https://players.tarkov.dev/profile/8560316.json',
      tarkovUid: 8560316,
    });
    const wrapper = createWrapper();
    const vm = asVm<{
      handleTarkovDevProfileUrlSubmit: () => Promise<void>;
      tarkovDevProfileUrlInput: string;
      tarkovDevTargetMode: 'pvp' | 'pve';
    }>(wrapper.vm);
    vm.tarkovDevProfileUrlInput = 'https://tarkov.dev/players/pve/8560316';
    await vm.handleTarkovDevProfileUrlSubmit();
    expect(tarkovDevFns.parseProfileUrl).toHaveBeenCalledWith(
      'https://tarkov.dev/players/pve/8560316'
    );
    expect(vm.tarkovDevTargetMode).toBe('pve');
  });
  it('keeps the current tarkov.dev target mode when the fetched source has no mode', async () => {
    tarkovDevFns.parseProfileUrl.mockResolvedValue({
      mode: null,
      profileJsonUrl: 'https://players.tarkov.dev/profile/8560316.json',
      tarkovUid: 8560316,
    });
    const wrapper = createWrapper();
    const vm = asVm<{
      handleTarkovDevProfileUrlSubmit: () => Promise<void>;
      tarkovDevProfileUrlInput: string;
      tarkovDevTargetMode: 'pvp' | 'pve';
    }>(wrapper.vm);
    vm.tarkovDevTargetMode = 'pve';
    vm.tarkovDevProfileUrlInput = 'https://players.tarkov.dev/profile/8560316.json';
    await vm.handleTarkovDevProfileUrlSubmit();
    expect(tarkovDevFns.parseProfileUrl).toHaveBeenCalledWith(
      'https://players.tarkov.dev/profile/8560316.json'
    );
    expect(vm.tarkovDevTargetMode).toBe('pve');
  });
  it('disables import actions while tarkov.dev profile fetch is loading', () => {
    tarkovDevState.importState.value = 'loading';
    const wrapper = createWrapper();
    expect(
      findButtonByText(wrapper, 'settings.data_management.import_backup_button')?.attributes(
        'disabled'
      )
    ).toBeDefined();
    expect(
      findButtonByText(
        wrapper,
        'settings.data_management.import_eft_logs_folder_button'
      )?.attributes('disabled')
    ).toBeDefined();
    expect(
      findButtonByText(wrapper, 'settings.tarkov_dev_import.fetch_profile')?.attributes('disabled')
    ).toBeDefined();
    expect(wrapper.find('input:not([type="file"])').attributes('disabled')).toBeDefined();
    expect(asVm<{ isAnyImportActive: boolean }>(wrapper.vm).isAnyImportActive).toBe(true);
    expect(asVm<{ isAnyImportPreviewActive: boolean }>(wrapper.vm).isAnyImportPreviewActive).toBe(
      false
    );
  });
  it('refetches a linked tarkov.dev profile from the selected source mode', async () => {
    tarkovDevFns.parseProfileUrl.mockResolvedValue({
      mode: 'pve',
      profileJsonUrl: 'https://players.tarkov.dev/profile/123456.json',
      tarkovUid: 123456,
    });
    tarkovStoreState.currentMode = 'pvp';
    tarkovStoreState.tarkovUid = 123456;
    const wrapper = createWrapper();
    expect(findButtonByText(wrapper, 'settings.tarkov_dev_import.fetch_profile')).toBeUndefined();
    await findButtonByText(wrapper, 'settings.tarkov_dev_import.refetch_mode_pve')!.trigger(
      'click'
    );
    await asVm<{ handleTarkovDevRefetch: () => Promise<void> }>(
      wrapper.vm
    ).handleTarkovDevRefetch();
    expect(tarkovDevFns.parseProfileUrl).toHaveBeenCalledWith(
      'https://tarkov.dev/players/pve/123456'
    );
    expect(asVm<{ tarkovDevTargetMode: 'pvp' | 'pve' }>(wrapper.vm).tarkovDevTargetMode).toBe(
      'pve'
    );
  });
  it('shows arena as disabled for linked tarkov.dev refetches', () => {
    tarkovStoreState.tarkovUid = 123456;
    const wrapper = createWrapper();
    const arenaButton = findButtonByText(wrapper, 'settings.tarkov_dev_import.refetch_mode_arena');
    expect(arenaButton?.attributes('disabled')).toBeDefined();
  });
  it('unlinks a tarkov.dev profile without resetting imported tracker data', () => {
    tarkovStoreState.tarkovUid = 123456;
    const wrapper = createWrapper();
    asVm<{ handleTarkovDevUnlink: () => void }>(wrapper.vm).handleTarkovDevUnlink();
    expect(tarkovStoreState.setTarkovUid).toHaveBeenCalledWith(null);
    expect(tarkovStoreState.tarkovUid).toBeNull();
    expect(backupFns.resetImport).not.toHaveBeenCalled();
    expect(tarkovDevFns.reset).not.toHaveBeenCalled();
  });
  it('keeps parsed tarkov.dev skill values collapsed behind preview details', () => {
    tarkovDevState.importState.value = 'preview';
    tarkovDevState.previewData.value = {
      displayName: 'Tester',
      gameEditionGuess: null,
      pmcFaction: 'USEC',
      prestigeLevel: 0,
      skills: {
        Strength: 12,
        Endurance: 5,
        MyUnknownSkill: 2,
      },
      tarkovUid: 123456,
      totalXP: 0,
    };
    const wrapper = createWrapper();
    const skillDetails = wrapper.find('details');
    expect(skillDetails.exists()).toBe(true);
    expect(skillDetails.attributes('open')).toBeUndefined();
    expect(wrapper.text()).toContain('settings.tarkov_dev_import.skills_details_toggle');
    expect(wrapper.text()).toContain('Endurance');
    expect(wrapper.text()).toContain('Strength');
    expect(wrapper.text()).toContain('MyUnknownSkill');
    expect(wrapper.text()).toContain('12');
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
  it.each([
    { expected: 'https://tarkov.dev/players/regular/123456', mode: 'pvp' as const },
    { expected: 'https://tarkov.dev/players/pve/123456', mode: 'pve' as const },
  ])('builds linked tarkov.dev url from the current mode ($mode)', ({ mode, expected }) => {
    tarkovStoreState.currentMode = mode;
    tarkovStoreState.tarkovUid = 123456;
    const wrapper = createWrapper();
    expect(asVm<{ tarkovDevProfileUrl: string }>(wrapper.vm).tarkovDevProfileUrl).toBe(expected);
  });
  it('forwards EFT logs confirmation using current target mode', async () => {
    tarkovStoreState.currentMode = 'pve';
    const wrapper = createWrapper();
    await asVm<{ handleEftLogsConfirm: () => Promise<void> }>(wrapper.vm).handleEftLogsConfirm();
    expect(eftLogsFns.confirmImport).toHaveBeenCalledWith('pve');
    asVm<{ resetEftLogsImport: () => void }>(wrapper.vm).resetEftLogsImport();
    expect(eftLogsFns.reset).toHaveBeenCalledTimes(1);
  });
  it('shows info toast when EFT logs import has no quest events', async () => {
    eftLogsFns.parseFiles.mockImplementation(async () => {
      eftLogsState.importState.value = 'error';
      eftLogsState.importError.value = 'settings.log_import.errors.no_quest_events_found';
    });
    const wrapper = createWrapper();
    await asVm<{ handleEftLogsFolderChange: (event: Event) => Promise<void> }>(
      wrapper.vm
    ).handleEftLogsFolderChange({
      target: {
        files: [new File(['mock-log'], 'push-notifications_000.log', { type: 'text/plain' })],
        value: 'selected',
      },
    } as unknown as Event);
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'info',
        title: 'settings.log_import.cleared_logs_toast_title',
        description: 'settings.log_import.cleared_logs_toast_description',
      })
    );
  });
  it('shows info toast when EFT logs import has no notification logs', async () => {
    eftLogsFns.parseFiles.mockImplementation(async () => {
      eftLogsState.importState.value = 'error';
      eftLogsState.importError.value = 'settings.log_import.errors.no_notification_logs_found';
    });
    const wrapper = createWrapper();
    await asVm<{ handleEftLogsFolderChange: (event: Event) => Promise<void> }>(
      wrapper.vm
    ).handleEftLogsFolderChange({
      target: {
        files: [new File(['mock-log'], 'backend_000.log', { type: 'text/plain' })],
        value: 'selected',
      },
    } as unknown as Event);
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'info',
        title: 'settings.log_import.cleared_logs_toast_title',
        description: 'settings.log_import.cleared_logs_toast_description',
      })
    );
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
