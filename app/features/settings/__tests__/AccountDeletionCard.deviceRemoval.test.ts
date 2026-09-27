// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import AccountDeletionCard from '@/features/settings/AccountDeletionCard.vue';
const { user, signOut, invoke, remove, request, reset, refreshedOwner } = vi.hoisted(() => ({
  user: { id: 'deleted-owner' as string | null, loggedIn: true, providers: [] },
  signOut: vi.fn(),
  invoke: vi.fn(),
  remove: vi.fn(),
  request: vi.fn(),
  reset: vi.fn(),
  refreshedOwner: { id: 'deleted-owner' },
}));
const reactiveUser = reactive(user);
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: reactiveUser,
    signOut,
    client: {
      auth: { getSession: async () => ({ data: { session: {} }, error: null }) },
      functions: { invoke },
    },
  },
}));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/utils/supabaseAuth', () => ({
  refreshSupabaseSession: async () => ({
    access_token: 'deleted-owner-fixture-token',
    user: { id: refreshedOwner.id },
  }),
}));
vi.mock('@/stores/tarkov/deviceData', () => ({
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
vi.mock('@/utils/clientStorage', () => ({ clearUserScopedAppStorage: reset }));
const mountCard = () =>
  mount(AccountDeletionCard, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        GenericCard: { template: '<section><slot name="content" /></section>' },
        UModal: {
          props: ['open'],
          template:
            '<div v-if="open"><slot name="body" /><slot name="footer" :close="() => {}" /></div>',
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
    reactiveUser.id = 'deleted-owner';
    refreshedOwner.id = 'deleted-owner';
    user.loggedIn = true;
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    remove.mockReturnValue(true);
    signOut.mockResolvedValue(undefined);
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
      expect(request).toHaveBeenCalledWith('deleted-owner');
      expect(request.mock.invocationCallOrder[0]).toBeLessThan(
        signOut.mock.invocationCallOrder[0]!
      );
      expect(remove).toHaveBeenCalledWith('deleted-owner');
      expect(remove).not.toHaveBeenCalledWith('new-owner');
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
  it('cancels an account deletion if identity changes during the request', async () => {
    invoke.mockImplementationOnce(async () => {
      reactiveUser.id = 'new-owner';
      return { data: { success: true }, error: null };
    });
    const wrapper = mountCard();
    await clickText(wrapper, 'settings.account.begin_deletion');
    await wrapper.get('input').setValue('settings.account_data.confirm_phrase_value');
    await clickText(wrapper, 'settings.account_data.delete_forever');
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text() === 'settings.account_data.go_to_dashboard')
    ).toBe(false);
    expect(remove).toHaveBeenCalledWith('deleted-owner');
    expect(remove).not.toHaveBeenCalledWith('new-owner');
    expect(reset).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
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
});
