// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import AccountDeletionCard from '@/features/settings/AccountDeletionCard.vue';
import { STORAGE_KEYS } from '@/utils/storageKeys';
const {
  user,
  signOut,
  signOutThisDevice,
  invoke,
  remove,
  request,
  recordOutcome,
  reset,
  refreshedOwner,
  sessionSwitch,
  toastAdd,
} = vi.hoisted(() => ({
  user: { id: 'deleted-owner' as string | null, loggedIn: true, providers: [] },
  signOut: vi.fn(),
  signOutThisDevice: vi.fn(),
  invoke: vi.fn(),
  remove: vi.fn(),
  request: vi.fn(),
  recordOutcome: vi.fn(),
  reset: vi.fn(),
  refreshedOwner: { id: 'deleted-owner' },
  sessionSwitch: { value: false },
  toastAdd: vi.fn(),
}));
const reactiveUser = reactive(user);
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: reactiveUser,
    signOut,
    signOutThisDevice,
    client: {
      auth: {
        getSession: async () => {
          if (sessionSwitch.value) reactiveUser.id = 'new-owner';
          return { data: { session: {} }, error: null };
        },
      },
      functions: { invoke },
    },
  },
}));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/utils/supabaseAuth', () => ({
  refreshSupabaseSession: async () => ({
    access_token: 'deleted-owner-fixture-token',
    user: { id: refreshedOwner.id },
  }),
}));
vi.mock('@/stores/tarkov/deviceData', () => ({
  recordDeviceDataRemovalOutcome: recordOutcome,
  removeAccountDeviceData: remove,
  requestDeviceDataRemoval: request,
}));
vi.mock('@/stores/useActivityLogStore', () => ({
  useActivityLogStore: () => ({ resetForSession: reset }),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({ resetToDefaults: reset }),
}));
vi.mock('@/stores/useSystemStore', () => ({ useSystemStore: () => ({ $reset: reset }) }));
vi.mock('@/stores/useTeamStore', () => ({ useTeamStore: () => ({ $reset: reset }) }));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({ $reset: reset }),
  resetTarkovSync: reset,
}));
const mountCard = () =>
  mount(AccountDeletionCard, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        GenericCard: { template: '<section><slot name="content" /></section>' },
        UModal: {
          props: ['open'],
          template:
            '<div v-if="open"><slot name="description" /><slot name="body" /><slot name="footer" :close="() => {}" /></div>',
        },
        UInput: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        UButton: {
          props: ['disabled'],
          template: '<button :disabled="disabled"><slot /></button>',
        },
        UIcon: true,
        UTooltip: true,
        AppTooltip: true,
        UBadge: true,
        UAlert: true,
      },
    },
  });
const clickText = async (wrapper: ReturnType<typeof mountCard>, text: string) => {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text);
  expect(button).toBeDefined();
  await button!.trigger('click');
  await flushPromises();
};
describe('account deletion device removal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    reactiveUser.id = 'deleted-owner';
    refreshedOwner.id = 'deleted-owner';
    sessionSwitch.value = false;
    user.loggedIn = true;
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    remove.mockReturnValue(true);
    // A completed sign-out hydrates the signed-out state, as the real plugin does.
    signOut.mockImplementation(async () => {
      reactiveUser.id = null;
      return 'signed_out';
    });
    signOutThisDevice.mockImplementation(async () => {
      reactiveUser.id = null;
    });
  });
  it.each([false, true])(
    'forgets only the deleted owner after sign-out (failure: %s)',
    async (fails) => {
      signOut.mockImplementationOnce(async () => {
        reactiveUser.id = 'new-owner';
        if (fails) throw new Error('Offline');
      });
      const wrapper = mountCard();
      await clickText(wrapper, 'settings.account.begin_deletion');
      await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
      await clickText(wrapper, 'settings.account_data.delete_forever');
      expect(invoke).toHaveBeenCalledWith('account-delete', {
        headers: { Authorization: 'Bearer deleted-owner-fixture-token' },
      });
      await clickText(wrapper, 'settings.account_data.go_to_dashboard');
      expect(signOut).toHaveBeenCalledWith('deleted-owner', 'local');
      expect(request).toHaveBeenCalledWith('deleted-owner');
      expect(request.mock.invocationCallOrder[0]).toBeLessThan(
        signOut.mock.invocationCallOrder[0]!
      );
      expect(remove).toHaveBeenCalledWith('deleted-owner');
      expect(remove).not.toHaveBeenCalledWith('new-owner');
      expect(signOutThisDevice).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
      wrapper.unmount();
    }
  );
  it('preserves a new account that signs in after deletion succeeds', async () => {
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    reactiveUser.id = 'new-owner';
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(signOut).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('deleted-owner');
    expect(remove).not.toHaveBeenCalledWith('new-owner');
    wrapper.unmount();
  });
  it('cleans the deleted session after its own sign-out', async () => {
    signOut.mockImplementationOnce(async () => {
      reactiveUser.id = null;
    });
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(reset).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('deleted-owner');
    wrapper.unmount();
  });
  it("does not clear another account's active progress after deleting the current account", async () => {
    const foreignProgress = JSON.stringify({ _userId: 'new-owner', data: null });
    localStorage.setItem(STORAGE_KEYS.progress, foreignProgress);
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(foreignProgress);
    expect(remove).toHaveBeenCalledWith('deleted-owner');
    wrapper.unmount();
  });
  it('reports the original account as deleted when identity changes during the request', async () => {
    invoke.mockImplementationOnce(async () => {
      reactiveUser.id = 'new-owner';
      return { data: { success: true }, error: null };
    });
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(wrapper.text()).toContain('settings.account_data.other_session_deleted_description');
    expect(wrapper.text()).not.toContain('settings.account_data.session_changed');
    expect(remove).toHaveBeenCalledWith('deleted-owner');
    expect(remove).not.toHaveBeenCalledWith('new-owner');
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(reset).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('signs out the deleted account if it becomes current again during deletion', async () => {
    invoke.mockImplementationOnce(async () => {
      reactiveUser.id = null;
      reactiveUser.id = 'deleted-owner';
      return { data: { success: true }, error: null };
    });
    signOut.mockImplementationOnce(async () => {
      reactiveUser.id = null;
    });
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(wrapper.text()).toContain('settings.account_data.delete_success_description');
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(request).toHaveBeenCalledWith('deleted-owner');
    expect(signOut).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('deleted-owner');
    wrapper.unmount();
  });
  it('checks the current identity again when leaving the deletion success dialog', async () => {
    invoke.mockImplementationOnce(async () => {
      reactiveUser.id = 'new-owner';
      return { data: { success: true }, error: null };
    });
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(wrapper.text()).toContain('settings.account_data.other_session_deleted_description');
    reactiveUser.id = 'deleted-owner';
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(signOut).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalled();
    wrapper.unmount();
  });
  it('closes a stale confirmation and clears its phrase before a new account can open it', async () => {
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    const oldDelete = wrapper
      .findAll('button')
      .find((button) => button.text() === 'settings.account_data.delete_forever')!;
    reactiveUser.id = 'new-owner';
    await flushPromises();
    expect(wrapper.find('input').exists()).toBe(false);
    await clickText(wrapper, 'settings.account.begin_deletion');
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('');
    await oldDelete.trigger('click');
    await flushPromises();
    expect(wrapper.find('input').exists()).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('stops before invocation and closes the dialog when the session switches during verification', async () => {
    sessionSwitch.value = true;
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(invoke).not.toHaveBeenCalled();
    expect(wrapper.find('input').exists()).toBe(false);
    expect(toastAdd).toHaveBeenCalledWith({
      title: 'settings.account_data.session_changed',
      color: 'warning',
    });
    expect(remove).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('reports scheduled cleanup after the original account was deleted', async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, cleanupScheduled: true, message: 'Queued' },
      error: null,
    });
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(wrapper.text()).toContain('settings.account_data.cleanup_pending');
    wrapper.unmount();
  });
  it('warns and offers an owner-scoped retry when device cleanup fails', async () => {
    remove.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(wrapper.text()).toContain('settings.account_data.device_cleanup_failed');
    expect(wrapper.text()).toContain('settings.account_data.delete_success_cleanup_failed_sr_only');
    expect(wrapper.text()).not.toContain('settings.account_data.redirect_message');
    const dashboardButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'settings.account_data.go_to_dashboard');
    expect(dashboardButton?.attributes('disabled')).toBeDefined();
    expect(remove).toHaveBeenCalledWith('deleted-owner');
    expect(recordOutcome).toHaveBeenLastCalledWith('deleted-owner', false);
    await clickText(wrapper, 'settings.account_data.retry_device_cleanup');
    expect(recordOutcome).toHaveBeenLastCalledWith('deleted-owner', true);
    expect(wrapper.text()).not.toContain('settings.account_data.device_cleanup_failed');
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(2, 'deleted-owner');
    expect(remove).not.toHaveBeenCalledWith('new-owner');
    expect(signOut).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('allows explicit continuation while warning that persistent device data remains', async () => {
    remove.mockReturnValue(false);
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(wrapper.text()).toContain('settings.account_data.device_cleanup_failed');
    expect(wrapper.text()).toContain('settings.account_data.delete_success_cleanup_failed_sr_only');
    await clickText(wrapper, 'settings.account_data.retry_device_cleanup');
    expect(wrapper.text()).toContain('settings.account_data.device_cleanup_failed');
    const dashboardButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'settings.account_data.go_to_dashboard');
    expect(dashboardButton?.attributes('disabled')).toBeDefined();
    await clickText(wrapper, 'settings.account_data.continue_with_device_data_remaining');
    expect(remove).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenNthCalledWith(3, 'deleted-owner');
    expect(remove).not.toHaveBeenCalledWith('new-owner');
    expect(signOut).toHaveBeenCalledWith('deleted-owner', 'local');
    wrapper.unmount();
  });
  it('keeps the warning open when cleanup fails during dashboard continuation', async () => {
    remove.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(wrapper.text()).not.toContain('settings.account_data.device_cleanup_failed');
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(wrapper.text()).toContain('settings.account_data.device_cleanup_failed');
    expect(remove).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it('rejects a refreshed session for a different account before invoking deletion', async () => {
    refreshedOwner.id = 'new-owner';
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(invoke).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('clears this device session when local sign-out of the deleted account fails', async () => {
    signOut.mockRejectedValueOnce(new Error('storage write failed'));
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(signOutThisDevice).toHaveBeenCalledWith('deleted-owner');
    expect(remove).toHaveBeenLastCalledWith('deleted-owner');
    expect(wrapper.text()).not.toContain('settings.account_data.session_end_failed');
    wrapper.unmount();
  });
  it('stays on the dialog while the deleted account session is still active', async () => {
    signOut.mockRejectedValueOnce(new Error('storage write failed'));
    signOutThisDevice.mockRejectedValueOnce(new Error('storage write failed'));
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    const removalsBefore = remove.mock.calls.length;
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(wrapper.text()).toContain('settings.account_data.session_end_failed');
    expect(remove).toHaveBeenCalledTimes(removalsBefore);
    expect(reset).not.toHaveBeenCalled();
    // Retrying from the same button ends the session and continues.
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(wrapper.text()).not.toContain('settings.account_data.session_end_failed');
    expect(remove).toHaveBeenCalledTimes(removalsBefore + 1);
    wrapper.unmount();
  });
  it('does not fall back to a device-only sign-out when another account took over', async () => {
    const changed = new Error('Supabase session changed before sign-out');
    changed.name = 'SupabaseSessionChangedError';
    signOut.mockImplementationOnce(async () => {
      reactiveUser.id = 'new-owner';
      throw changed;
    });
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    await clickText(wrapper, 'settings.account_data.go_to_dashboard');
    expect(signOutThisDevice).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalledWith('new-owner');
    wrapper.unmount();
  });
});
