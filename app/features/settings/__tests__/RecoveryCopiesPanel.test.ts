// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
import type { UseDataBackupReturn } from '@/composables/useDataBackup';
const { toastAdd, user } = vi.hoisted(() => ({
  toastAdd: vi.fn(),
  user: { id: 'user-1' as string | null, loggedIn: true },
}));
const reactiveUser = reactive(user);
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { user: reactiveUser } }));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    $state: { pvp: { level: 30, taskCompletions: { current: { complete: true } } } },
  }),
}));
vi.mock('@/stores/tarkov/progressAuthority', async () => {
  const { createProgressPolicyAuthority } = await import('#tests/test-helpers/progressAuthority');
  return createProgressPolicyAuthority();
});
const createBackup = () => ({
  confirmRecoveryArchiveSaved: vi.fn(async () => undefined),
  discardSupersededProgress: vi.fn(),
  exportDeviceProgressRecovery: vi.fn(async () => undefined),
  exportSupersededProgress: vi.fn(async (_copyId?: string) => undefined),
  legacyProgressRecoveryCount: ref(0),
  legacyProgressRecoveryOverflow: ref(false),
  recoveryExportPending: ref(false),
  restoreSupersededProgress: vi.fn(),
  reviewOlderTabProgress: vi.fn(async () => undefined),
});
let backup = createBackup();
const saveCopy = async (mode: 'pvp' | 'seasonal', seasonNumber: number | null, at = 100) => {
  const { saveSupersededProgressCopy } = await import('@/stores/tarkov/supersededProgress');
  const { createDefaultOwnedProgressData } = await import('@/utils/progressSanitizers');
  const progress = { ...createDefaultOwnedProgressData(), level: 12 + at };
  return saveSupersededProgressCopy('user-1', mode, seasonNumber, progress, at)!;
};
const mountPanel = async () => {
  const { default: Panel } = await import('@/features/settings/RecoveryCopiesPanel.vue');
  return mount(Panel, {
    props: { backup: backup as unknown as UseDataBackupReturn, parsing: false },
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) =>
          params ? `${key}:${JSON.stringify(params)}` : key,
      },
      stubs: {
        UButton: {
          props: ['disabled'],
          emits: ['click'],
          template:
            '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });
};
describe('RecoveryCopiesPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    backup = createBackup();
    user.id = 'user-1';
    user.loggedIn = true;
  });
  it('shows only the device archive link when nothing needs recovery', async () => {
    const wrapper = await mountPanel();
    expect(wrapper.find('[data-testid="recovery-copies"]').exists()).toBe(false);
    await wrapper.get('[data-testid="device-recovery-archive-download"]').trigger('click');
    await flushPromises();
    expect(backup.exportDeviceProgressRecovery).toHaveBeenCalledOnce();
    expect(toastAdd).not.toHaveBeenCalled();
  });
  it('reports a failed device archive download', async () => {
    backup.exportDeviceProgressRecovery.mockRejectedValueOnce(new Error('quota'));
    const wrapper = await mountPanel();
    await wrapper.get('[data-testid="device-recovery-archive-download"]').trigger('click');
    await flushPromises();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        description: 'settings.data_management.recovery_export_failed',
      })
    );
  });
  it('moves the archive download into the older-tab section when older copies exist', async () => {
    backup.legacyProgressRecoveryCount.value = 1;
    const wrapper = await mountPanel();
    expect(wrapper.find('[data-testid="recovery-copies"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="older-tab-review-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="device-progress-recovery-export"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="device-recovery-archive-download"]').exists()).toBe(false);
  });
  it('restores a copy only after the player confirms the replacement', async () => {
    const copy = await saveCopy('pvp', null);
    const wrapper = await mountPanel();
    const item = wrapper.get(`[data-testid="superseded-copy-${copy.id}"]`);
    await item.get('[data-testid="superseded-restore"]').trigger('click');
    expect(backup.restoreSupersededProgress).not.toHaveBeenCalled();
    expect(item.text()).toContain('settings.data_management.superseded_restore_confirmation');
    // The confirmation describes the current progress the restore would replace.
    expect(item.text()).toMatch(/level\\?":30/);
    await item.get('[data-testid="superseded-confirm"]').trigger('click');
    expect(backup.restoreSupersededProgress).toHaveBeenCalledWith(copy.id);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: expect.stringContaining('settings.data_management.superseded_restored'),
      })
    );
  });
  it('reports why a restore was refused', async () => {
    const copy = await saveCopy('pvp', null);
    backup.restoreSupersededProgress.mockImplementationOnce(() => {
      throw new Error('settings.data_management.superseded_restore_keep_failed');
    });
    const wrapper = await mountPanel();
    await wrapper.get('[data-testid="superseded-restore"]').trigger('click');
    await wrapper.get('[data-testid="superseded-confirm"]').trigger('click');
    expect(backup.restoreSupersededProgress).toHaveBeenCalledWith(copy.id);
    expect(toastAdd).toHaveBeenCalledWith({
      color: 'error',
      title: 'settings.data_management.superseded_restore_keep_failed',
    });
  });
  it('offers download and discard, but not restore, for an earlier season', async () => {
    const copy = await saveCopy('seasonal', ACTIVE_SEASON_NUMBER - 1);
    const wrapper = await mountPanel();
    const item = wrapper.get(`[data-testid="superseded-copy-${copy.id}"]`);
    expect(item.text()).toContain('settings.data_management.superseded_other_season');
    expect(item.find('[data-testid="superseded-restore"]').exists()).toBe(false);
    await item.get('[data-testid="superseded-download"]').trigger('click');
    await flushPromises();
    expect(backup.exportSupersededProgress).toHaveBeenCalledWith(copy.id);
    await item.get('[data-testid="superseded-discard"]').trigger('click');
    expect(backup.discardSupersededProgress).not.toHaveBeenCalled();
    await item.get('[data-testid="superseded-confirm"]').trigger('click');
    expect(backup.discardSupersededProgress).toHaveBeenCalledWith(copy.id);
  });
  it('allows restoring a Seasonal copy from the current season', async () => {
    await saveCopy('seasonal', ACTIVE_SEASON_NUMBER);
    const wrapper = await mountPanel();
    expect(wrapper.find('[data-testid="superseded-restore"]').exists()).toBe(true);
  });
  it('follows copies added by another tab and hides them from another account', async () => {
    const wrapper = await mountPanel();
    expect(wrapper.find('[data-testid="recovery-copies"]').exists()).toBe(false);
    const { STORAGE_KEYS } = await import('@/utils/storageKeys');
    const { createDefaultOwnedProgressData } = await import('@/utils/progressSanitizers');
    const key = `${STORAGE_KEYS.progressSupersededPrefix}user-1_100_other-tab`;
    Storage.prototype.setItem.call(
      localStorage,
      key,
      JSON.stringify({
        id: '100_other-tab',
        ownerId: 'user-1',
        mode: 'pvp',
        seasonNumber: null,
        supersededAt: 100,
        progress: createDefaultOwnedProgressData(),
      })
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    await nextTick();
    expect(wrapper.find('[data-testid="recovery-copies"]').exists()).toBe(false);
    window.dispatchEvent(new StorageEvent('storage', { key }));
    await nextTick();
    expect(wrapper.find('[data-testid="superseded-copy-100_other-tab"]').exists()).toBe(true);
    reactiveUser.id = 'user-2';
    await nextTick();
    expect(wrapper.find('[data-testid="recovery-copies"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
