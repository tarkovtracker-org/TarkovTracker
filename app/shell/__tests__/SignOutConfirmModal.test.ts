// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignOut } from '@/composables/useSignOut';
import {
  recordLocalSave,
  registerCloudRetryHandler,
  resetCloudSaveStatus,
  setCloudSaveStatus,
} from '@/stores/tarkov/progressSaveStatus';
const { exportProgress, signOut, toastAdd } = vi.hoisted(() => ({
  exportProgress: vi.fn(),
  signOut: vi.fn(),
  toastAdd: vi.fn(),
}));
vi.mock('@/composables/useDataBackup', () => ({
  useDataBackup: () => ({ exportProgress }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { signOut } }));
const markUnsaved = () => {
  recordLocalSave(false, 'quota');
  setCloudSaveStatus({ state: 'failed', failure: 'offline', retryAttempt: 3, nextRetryAt: null });
};
const mountModal = async () => {
  const { default: Modal } = await import('@/shell/SignOutConfirmModal.vue');
  return mount(Modal, {
    global: {
      stubs: {
        UModal: {
          props: ['open'],
          template:
            '<div v-if="open"><slot name="header" /><slot name="body" /><slot name="footer" :close="() => {}" /></div>',
        },
        UAlert: { props: ['title'], template: '<p>{{ title }}</p>' },
        UIcon: true,
        UButton: {
          emits: ['click'],
          template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });
};
describe('SignOutConfirmModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue(undefined);
    resetCloudSaveStatus();
    recordLocalSave(true);
    useSignOut().confirmOpen.value = false;
  });
  it('opens instead of signing out when changes are memory-only', async () => {
    markUnsaved();
    const wrapper = await mountModal();
    await expect(useSignOut().requestSignOut()).resolves.toBe(false);
    await flushPromises();
    expect(signOut).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('sign_out_confirm.risk');
  });
  it('retries without signing out and closes once the changes are saved', async () => {
    markUnsaved();
    registerCloudRetryHandler(async () => {
      resetCloudSaveStatus();
      return true;
    });
    const wrapper = await mountModal();
    useSignOut().confirmOpen.value = true;
    await flushPromises();
    await wrapper.get('[data-testid="sign-out-retry"]').trigger('click');
    await flushPromises();
    expect(signOut).not.toHaveBeenCalled();
    expect(useSignOut().confirmOpen.value).toBe(false);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'sign_out_confirm.retry_succeeded' })
    );
  });
  it('stays open when a retry fails', async () => {
    markUnsaved();
    registerCloudRetryHandler(async () => false);
    const wrapper = await mountModal();
    useSignOut().confirmOpen.value = true;
    await flushPromises();
    await wrapper.get('[data-testid="sign-out-retry"]').trigger('click');
    await flushPromises();
    expect(useSignOut().confirmOpen.value).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });
  it('exports without signing out', async () => {
    markUnsaved();
    const wrapper = await mountModal();
    useSignOut().confirmOpen.value = true;
    await flushPromises();
    await wrapper.get('[data-testid="sign-out-export"]').trigger('click');
    await flushPromises();
    expect(exportProgress).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
    expect(useSignOut().confirmOpen.value).toBe(true);
  });
  it('signs out only after the explicit discard action', async () => {
    markUnsaved();
    const wrapper = await mountModal();
    useSignOut().confirmOpen.value = true;
    await flushPromises();
    await wrapper.get('[data-testid="sign-out-discard"]').trigger('click');
    await flushPromises();
    expect(signOut).toHaveBeenCalledOnce();
    expect(useSignOut().confirmOpen.value).toBe(false);
  });
  it('reports a failed sign-out', async () => {
    signOut.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(useSignOut().requestSignOut()).resolves.toBe(false);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'app_bar.logout_failed', color: 'error' })
    );
  });
});
