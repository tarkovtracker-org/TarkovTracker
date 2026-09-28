// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { resetCloudSaveStatus, setCloudSaveStatus } from '@/stores/tarkov/progressSaveStatus';
const {
  calls,
  deviceData,
  exportProgress,
  exportSupersededProgress,
  lastFailure,
  signOutNow,
  signOutThisDevice,
  toastAdd,
  user,
} = vi.hoisted(() => {
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
    signOutNow: vi.fn(async (_owner?: string | null, _options?: unknown) => {
      order.push('signOut');
      return true;
    }),
    signOutThisDevice: vi.fn(async (_owner: string | null) => {
      order.push('signOutThisDevice');
      return true;
    }),
    lastFailure: { value: null as 'session_changed' | 'revocation_unavailable' | null },
    exportProgress: vi.fn(async () => undefined),
    exportSupersededProgress: vi.fn(async () => undefined),
    toastAdd: vi.fn(),
    user: { id: 'user-1' as string | null, loggedIn: true },
  };
});
const reactiveUser = reactive(user);
vi.mock('@/stores/tarkov/deviceData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/tarkov/deviceData')>()),
  ...deviceData,
}));
vi.mock('@/composables/useSignOut', () => ({
  useSignOut: () => ({ signOutNow, signOutThisDevice, lastFailure }),
}));
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
            '<div v-if="open"><button data-testid="modal-dismiss" @click="$emit(\'update:open\', false)">Dismiss</button><slot name="title" /><slot name="body" /><slot name="footer" :close="() => {}" /></div>',
        },
        UAlert: {
          props: ['title'],
          template: '<div v-bind="$attrs"><p>{{ title }}</p><slot name="actions" /></div>',
        },
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
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    calls.length = 0;
    lastFailure.value = null;
    const { clearIncompleteDeviceDataRemoval } = await import('@/stores/tarkov/deviceData');
    clearIncompleteDeviceDataRemoval('user-1');
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
  it('signs out the confirmed owner explicitly, without the device-only toast fallback', async () => {
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    await wrapper.get('[data-testid="device-data-confirm"]').trigger('click');
    await flushPromises();
    expect(signOutNow).toHaveBeenCalledWith('user-1', { offerDeviceOnlyFallback: false });
  });
  it('keeps a retry bound to the signed-out owner when cleanup fails after sign-out', async () => {
    deviceData.removeAccountDeviceData.mockReturnValue(false);
    signOutNow.mockImplementation(async () => {
      reactiveUser.id = null;
      reactiveUser.loggedIn = false;
      return true;
    });
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    await wrapper.get('[data-testid="device-data-confirm"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="device-data-remove"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="device-data-remove-incomplete"]').exists()).toBe(true);
    toastAdd.mockClear();
    // The retry runs the real owner-scoped removal for the captured owner, not the signed-in one.
    await wrapper.get('[data-testid="device-data-retry-removal"]').trigger('click');
    await flushPromises();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'settings.device_data.removed', color: 'success' })
    );
    expect(wrapper.find('[data-testid="device-data-remove-incomplete"]').exists()).toBe(false);
  });
  it('hides the pending retry while the removed owner is signed in again', async () => {
    const { markDeviceDataRemovalIncomplete } = await import('@/stores/tarkov/deviceData');
    markDeviceDataRemovalIncomplete('user-1');
    const wrapper = await mountCard();
    expect(wrapper.find('[data-testid="device-data-remove-incomplete"]').exists()).toBe(false);
    reactiveUser.id = 'user-2';
    await nextTick();
    expect(wrapper.find('[data-testid="device-data-remove-incomplete"]').exists()).toBe(true);
  });
  it('offers a disclosed device-only sign-out when the server cannot be reached', async () => {
    signOutNow.mockImplementation(async () => {
      calls.push('signOut');
      lastFailure.value = 'revocation_unavailable';
      return false;
    });
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    expect(wrapper.find('[data-testid="device-data-confirm-device-only"]').exists()).toBe(false);
    await wrapper.get('[data-testid="device-data-confirm"]').trigger('click');
    await flushPromises();
    expect(deviceData.removeAccountDeviceData).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="device-data-revocation-unavailable"]').exists()).toBe(true);
    await wrapper.get('[data-testid="device-data-confirm-device-only"]').trigger('click');
    await flushPromises();
    expect(signOutThisDevice).toHaveBeenCalledWith('user-1');
    expect(calls).toEqual([
      'request',
      'signOut',
      'clear',
      'request',
      'signOutThisDevice',
      'remove',
      'clear',
    ]);
  });
  it('does not offer the device-only path when a different account took over', async () => {
    signOutNow.mockImplementation(async () => {
      lastFailure.value = 'session_changed';
      return false;
    });
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    await wrapper.get('[data-testid="device-data-confirm"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="device-data-confirm-device-only"]').exists()).toBe(false);
  });
  it('reports a thrown cleanup as incomplete and clears the removal request', async () => {
    deviceData.removeAccountDeviceData.mockImplementation(() => {
      throw new Error('storage exploded');
    });
    signOutNow.mockImplementation(async () => {
      reactiveUser.id = null;
      reactiveUser.loggedIn = false;
      return true;
    });
    const wrapper = await mountCard();
    await wrapper.get('[data-testid="device-data-remove"]').trigger('click');
    await wrapper.get('[data-testid="device-data-confirm"]').trigger('click');
    await flushPromises();
    expect(deviceData.clearDeviceDataRemoval).toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'settings.device_data.remove_error', color: 'error' })
    );
    expect(wrapper.find('[data-testid="device-data-remove-incomplete"]').exists()).toBe(true);
  });
  it('refreshes superseded copies when another tab changes them', async () => {
    const wrapper = await mountCard();
    expect(wrapper.find('[data-testid="superseded-progress-export"]').exists()).toBe(false);
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
    expect(wrapper.find('[data-testid="superseded-progress-export"]').exists()).toBe(false);
    window.dispatchEvent(new StorageEvent('storage', { key }));
    await nextTick();
    expect(wrapper.find('[data-testid="superseded-progress-export"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('shows a removal retry recorded by another tab', async () => {
    const wrapper = await mountCard();
    expect(wrapper.find('[data-testid="device-data-remove-incomplete"]').exists()).toBe(false);
    const { STORAGE_KEYS } = await import('@/utils/storageKeys');
    const key = `${STORAGE_KEYS.deviceDataRemovalIncompletePrefix}user-9`;
    Storage.prototype.setItem.call(localStorage, key, 'user-9');
    window.dispatchEvent(new StorageEvent('storage', { key }));
    await nextTick();
    expect(wrapper.find('[data-testid="device-data-remove-incomplete"]').exists()).toBe(true);
    Storage.prototype.removeItem.call(localStorage, key);
    window.dispatchEvent(new StorageEvent('storage', { key }));
    await nextTick();
    expect(wrapper.find('[data-testid="device-data-remove-incomplete"]').exists()).toBe(false);
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
