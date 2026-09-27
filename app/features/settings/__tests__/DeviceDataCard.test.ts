// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { resetCloudSaveStatus, setCloudSaveStatus } from '@/stores/tarkov/progressSaveStatus';
const { calls, deviceData, exportProgress, exportSupersededProgress, signOutNow, toastAdd, user } =
  vi.hoisted(() => {
    const order: string[] = [];
    return {
      calls: order,
      deviceData: {
        requestDeviceDataRemoval: vi.fn(() => order.push('request')),
        clearDeviceDataRemoval: vi.fn(() => order.push('clear')),
        removeAccountDeviceData: vi.fn(() => {
          order.push('remove');
          return true;
        }),
      },
      signOutNow: vi.fn(async () => {
        order.push('signOut');
        return true;
      }),
      exportProgress: vi.fn(async () => undefined),
      exportSupersededProgress: vi.fn(async () => undefined),
      toastAdd: vi.fn(),
      user: { id: 'user-1' as string | null, loggedIn: true },
    };
  });
const reactiveUser = reactive(user);
vi.mock('@/stores/tarkov/deviceData', () => deviceData);
vi.mock('@/composables/useSignOut', () => ({ useSignOut: () => ({ signOutNow }) }));
vi.mock('@/composables/useDataBackup', () => ({
  useDataBackup: () => ({ exportProgress, exportSupersededProgress }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { user: reactiveUser } }));
const mountCard = async () => {
  const { default: Card } = await import('@/features/settings/DeviceDataCard.vue');
  return mount(Card, {
    global: {
      stubs: {
        GenericCard: { template: '<section><slot name="content" /></section>' },
        UModal: {
          props: ['open'],
          emits: ['update:open'],
          template:
            '<div v-if="open"><button data-testid="modal-dismiss" @click="$emit(\'update:open\', false)">Dismiss</button><slot name="header" /><slot name="body" /><slot name="footer" :close="() => {}" /></div>',
        },
        UAlert: { props: ['title'], template: '<p v-bind="$attrs">{{ title }}</p>' },
        UIcon: true,
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
describe('DeviceDataCard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    calls.length = 0;
    deviceData.removeAccountDeviceData.mockImplementation(() => {
      calls.push('remove');
      return true;
    });
    resetCloudSaveStatus();
    user.id = 'user-1';
    user.loggedIn = true;
    signOutNow.mockImplementation(async () => {
      calls.push('signOut');
      return true;
    });
  });
  it('registers the removal before signing out, then removes stored copies', async () => {
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    expect(wrapper.find('[data-testid="device-data-pending-warning"]').exists()).toBe(false);
    await wrapper.get('[data-testid="device-data-confirm"]').trigger('click');
    await flushPromises();
    expect(calls).toEqual(['request', 'signOut', 'remove', 'clear']);
    expect(deviceData.removeAccountDeviceData).toHaveBeenCalledWith('user-1');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'settings.device_data.removed' })
    );
  });
  it('removes nothing and cancels the request when sign-out fails', async () => {
    signOutNow.mockImplementation(async () => {
      calls.push('signOut');
      return false;
    });
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    await wrapper.get('[data-testid="device-data-confirm"]').trigger('click');
    await flushPromises();
    expect(calls).toEqual(['request', 'signOut', 'clear']);
    expect(deviceData.removeAccountDeviceData).not.toHaveBeenCalled();
  });
  it('warns that pending cloud changes will be discarded and offers export', async () => {
    setCloudSaveStatus({ state: 'failed', failure: 'offline', retryAttempt: 3, nextRetryAt: null });
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    expect(wrapper.find('[data-testid="device-data-pending-warning"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="device-data-export"]').exists()).toBe(true);
  });
  it('is unavailable while signed out', async () => {
    user.id = null;
    user.loggedIn = false;
    const wrapper = await mountCard();
    expect(wrapper.get('[data-testid="device-data-remove"]').attributes('disabled')).toBeDefined();
  });
  it('offers export for the signed-in owner’s superseded progress copies', async () => {
    const { saveSupersededProgressCopy } = await import('@/stores/tarkov/supersededProgress');
    const { createDefaultOwnedProgressData } = await import('@/utils/progressSanitizers');
    saveSupersededProgressCopy('user-1', 'seasonal', 1, createDefaultOwnedProgressData(), 100);
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="superseded-progress-export"]').trigger('click');
    await flushPromises();
    expect(exportSupersededProgress).toHaveBeenCalledOnce();
  });
  it('refreshes superseded-copy visibility when the signed-in owner changes', async () => {
    const listSpy = vi.spyOn(
      await import('@/stores/tarkov/supersededProgress'),
      'listSupersededProgressCopies'
    );
    const wrapper = await mountCard();
    reactiveUser.id = 'user-2';
    await nextTick();
    expect(listSpy).toHaveBeenLastCalledWith('user-2');
    expect(wrapper.find('[data-testid="superseded-progress-export"]').exists()).toBe(false);
  });
  it('reports a storage cleanup failure instead of claiming removal succeeded', async () => {
    deviceData.removeAccountDeviceData.mockReturnValue(false);
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    await wrapper.get('[data-testid="device-data-confirm"]').trigger('click');
    await flushPromises();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'settings.device_data.remove_error', color: 'error' })
    );
    expect(toastAdd).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'settings.device_data.removed' })
    );
  });
  it('invalidates removal confirmation when the authenticated owner changes', async () => {
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    const oldConfirm = wrapper.get('[data-testid="device-data-confirm"]');
    reactiveUser.id = 'user-2';
    await oldConfirm.trigger('click');
    await flushPromises();
    expect(deviceData.requestDeviceDataRemoval).not.toHaveBeenCalled();
    expect(signOutNow).not.toHaveBeenCalled();
    expect(deviceData.removeAccountDeviceData).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="device-data-confirm"]').exists()).toBe(false);
  });
  it('rejects a stale account button even after the new owner opens another confirmation', async () => {
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    const oldConfirm = wrapper.get('[data-testid="device-data-confirm"]');
    reactiveUser.id = 'user-2';
    await nextTick();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    await oldConfirm.trigger('click');
    await flushPromises();
    expect(deviceData.removeAccountDeviceData).not.toHaveBeenCalled();
    expect(signOutNow).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="device-data-confirm"]').exists()).toBe(true);
    await wrapper.get('[data-testid="device-data-confirm"]').trigger('click');
    await flushPromises();
    expect(deviceData.removeAccountDeviceData).toHaveBeenCalledWith('user-2');
  });
  it('reports download failures without removing account data', async () => {
    setCloudSaveStatus({ state: 'pending', failure: null, retryAttempt: 0, nextRetryAt: null });
    exportProgress.mockRejectedValueOnce(new Error('Download unavailable'));
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    await wrapper.get('[data-testid="device-data-export"]').trigger('click');
    await flushPromises();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'settings.data_management.export_error_title',
        color: 'error',
      })
    );
    const { saveSupersededProgressCopy } = await import('@/stores/tarkov/supersededProgress');
    const { createDefaultOwnedProgressData } = await import('@/utils/progressSanitizers');
    saveSupersededProgressCopy('user-1', 'seasonal', 1, createDefaultOwnedProgressData(), 100);
    await flushPromises();
    exportSupersededProgress.mockRejectedValueOnce(new Error('Download unavailable'));
    await wrapper.get('[data-testid="superseded-progress-export"]').trigger('click');
    await flushPromises();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'settings.device_data.superseded_export_error',
        color: 'error',
      })
    );
    expect(deviceData.removeAccountDeviceData).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="device-data-confirm"]').exists()).toBe(true);
  });
  it('renders the confirmation heading and dismisses without removing data', async () => {
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    expect(wrapper.text()).toContain('settings.device_data.confirm_title');
    await wrapper.get('[data-testid="modal-dismiss"]').trigger('click');
    expect(wrapper.find('[data-testid="device-data-confirm"]').exists()).toBe(false);
    expect(deviceData.removeAccountDeviceData).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('clears owner-scoped export controls when the current account signs out', async () => {
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    reactiveUser.id = null;
    reactiveUser.loggedIn = false;
    await nextTick();
    expect(wrapper.find('[data-testid="device-data-confirm"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="superseded-progress-export"]').exists()).toBe(false);
    expect(deviceData.removeAccountDeviceData).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
