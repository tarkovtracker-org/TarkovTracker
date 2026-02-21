import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataManagementCard from '@/features/settings/DataManagementCard.vue';
const { backupFns, backupState, tarkovDevFns, tarkovDevState, toastAddMock, tarkovStoreState } =
  vi.hoisted(() => ({
    backupFns: {
      confirmBackupImport: vi.fn(async () => undefined),
      exportProgress: vi.fn(async () => undefined),
      parseBackupFile: vi.fn(async () => undefined),
      resetImport: vi.fn(),
    },
    backupState: {
      exportError: { value: null as string | null },
      importError: { value: null as string | null },
      importPreview: { value: null as Record<string, unknown> | null },
      importState: { value: 'idle' as 'idle' | 'preview' | 'success' | 'error' },
    },
    tarkovDevFns: {
      confirmImport: vi.fn(async () => undefined),
      parseFile: vi.fn(async () => undefined),
      reset: vi.fn(),
    },
    tarkovDevState: {
      importError: { value: null as string | null },
      previewData: { value: null as Record<string, unknown> | null },
      importState: { value: 'idle' as 'idle' | 'preview' | 'success' | 'error' },
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
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    editions: [
      { value: 1, title: 'Standard' },
      { value: 2, title: 'Left Behind' },
    ],
    playerLevels: [{ exp: 0, level: 1 }],
  }),
}));
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
    toastAddMock.mockReset();
    backupState.exportError.value = null;
    backupState.importError.value = null;
    backupState.importPreview.value = null;
    backupState.importState.value = 'idle';
    tarkovDevState.importError.value = null;
    tarkovDevState.importState.value = 'idle';
    tarkovDevState.previewData.value = null;
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
});
