// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginRequiredAlert from '@/components/ui/LoginRequiredAlert.vue';
import DiscordLinkCard from '@/features/settings/DiscordLinkCard.vue';
const {
  invokeMock,
  linkIdentityMock,
  maybeSingleMock,
  readyMock,
  replaceMock,
  routeState,
  selectMock,
  unlinkIdentityMock,
  userState,
  userGetMock,
} = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const selectMock = vi.fn(() => ({
    eq: () => ({
      maybeSingle: maybeSingleMock,
    }),
  }));
  return {
    invokeMock: vi.fn(),
    linkIdentityMock: vi.fn(),
    maybeSingleMock,
    readyMock: vi.fn().mockResolvedValue(undefined),
    replaceMock: vi.fn().mockResolvedValue(undefined),
    routeState: {
      query: {} as Record<string, string | undefined>,
      hash: '',
    },
    selectMock,
    unlinkIdentityMock: vi.fn(),
    userGetMock: vi.fn(),
    userState: {
      id: 'user-1' as string | null,
    },
  };
});
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: userState,
    ready: readyMock,
    client: {
      from: () => ({
        select: selectMock,
      }),
      functions: {
        invoke: invokeMock,
      },
      auth: {
        getUser: userGetMock,
        linkIdentity: linkIdentityMock,
        unlinkIdentity: unlinkIdentityMock,
      },
    },
  },
}));
mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useRouter', () => () => ({
  replace: replaceMock,
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (key === 'settings.discord_link.linked_as') {
      return `Linked as ${String(params?.username ?? '')}`;
    }
    return key;
  },
}));
const GenericCard = {
  template: '<div><slot name="content" /></div>',
  props: ['icon', 'iconColor', 'highlightColor', 'fillHeight', 'title', 'titleClasses'],
};
const UAlert = {
  template:
    '<div :data-color="color">{{ title }} {{ description }}<slot name="description" /></div>',
  props: ['color', 'variant', 'icon', 'title', 'description'],
};
const UButton = {
  template:
    '<a v-if="to" :href="to"><slot /></a><button v-else type="button" @click="$emit(\'click\')"><slot /></button>',
  props: ['color', 'variant', 'icon', 'loading', 'to'],
};
const UIcon = { template: '<span />', props: ['name', 'class'] };
describe('DiscordLinkCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    routeState.query = {};
    routeState.hash = '';
    userState.id = 'user-1';
    readyMock.mockClear().mockResolvedValue(undefined);
    replaceMock.mockClear().mockResolvedValue(undefined);
    invokeMock.mockClear().mockResolvedValue({ data: { synced: true }, error: null });
    linkIdentityMock.mockClear();
    unlinkIdentityMock.mockClear().mockResolvedValue({ error: null });
    userGetMock.mockClear().mockResolvedValue({
      data: {
        user: {
          identities: [
            {
              id: 'identity-1',
              provider: 'discord',
              identity_data: { provider_id: 'discord-123', full_name: 'linked-user' },
            },
            { id: 'identity-2', provider: 'email' },
          ],
        },
      },
      error: null,
    });
    maybeSingleMock.mockReset();
    selectMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const mountCard = async () => {
    const wrapper = mount(DiscordLinkCard, {
      global: {
        stubs: {
          GenericCard,
          UAlert,
          UButton,
          UIcon,
        },
      },
    });
    await flushPromises();
    return wrapper;
  };
  it('loads an existing Discord link on mount', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { discord_user_id: 'discord-123' },
      error: null,
    });
    const wrapper = await mountCard();
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Linked as linked-user');
    expect(invokeMock).not.toHaveBeenCalled();
  });
  it('shows the unique Discord username instead of the stored ID or display name', async () => {
    const numericId = '1'.repeat(18);
    maybeSingleMock.mockResolvedValue({
      data: {
        discord_user_id: 'discord-123',
        discord_username: numericId,
        discord_display_name: 'Display Name',
      },
      error: null,
    });
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain('Linked as linked-user');
    expect(wrapper.text()).not.toContain(numericId);
    expect(wrapper.text()).not.toContain('Display Name');
    expect(selectMock).toHaveBeenCalledWith('discord_user_id');
  });
  it('keeps the link usable when the Discord username cannot be loaded', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { discord_user_id: 'discord-123', discord_username: 'Display Name' },
      error: null,
    });
    userGetMock.mockResolvedValue({ data: { user: null }, error: new Error('Auth unavailable') });
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain('settings.discord_link.linked');
    expect(wrapper.text()).not.toContain('Linked as');
    expect(wrapper.text()).not.toContain('Display Name');
    expect(wrapper.findAll('button')).toHaveLength(2);
    expect(wrapper.findComponent(UAlert).exists()).toBe(false);
  });
  it('does not load a username when no Discord account is linked', async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: null,
    });
    const wrapper = await mountCard();
    expect(userGetMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('settings.discord_link.link_account');
  });
  it('retries loading after OAuth return and then syncs roles', async () => {
    routeState.query = {
      discord_linked: '1',
      code: 'consumed-code',
      sb_flow_id: 'flow-id',
      from: 'profile',
    };
    routeState.hash = '#account';
    maybeSingleMock
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('trigger lag') })
      .mockResolvedValueOnce({
        data: { discord_user_id: 'discord-123' },
        error: null,
      });
    const mountPromise = mount(DiscordLinkCard, {
      global: {
        stubs: {
          GenericCard,
          UAlert,
          UButton,
          UIcon,
        },
      },
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    const wrapper = await mountPromise;
    await flushPromises();
    expect(readyMock).toHaveBeenCalled();
    expect(maybeSingleMock).toHaveBeenCalledTimes(3);
    expect(invokeMock).toHaveBeenCalledWith('discord-role-sync', { body: {} });
    expect(replaceMock).toHaveBeenCalledWith({ query: { from: 'profile' }, hash: '#account' });
    expect(wrapper.text()).toContain('Linked as linked-user');
  });
  it('preserves the complete callback for retry when session readiness fails', async () => {
    routeState.query = { discord_linked: '1', code: 'unused-code', sb_flow_id: 'flow-id' };
    routeState.hash = '#account';
    readyMock.mockRejectedValueOnce(new Error('temporary initialization failure'));
    const wrapper = await mountCard();
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('settings.discord_link.load_error');
  });
  it('shows a warning when the linked Discord account has not joined the server', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { discord_user_id: 'discord-123' },
      error: null,
    });
    invokeMock.mockResolvedValue({
      data: { synced: false, reason: 'not_in_guild' },
      error: null,
    });
    const wrapper = await mountCard();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-color="warning"]').text()).toContain(
      'settings.discord_link.not_in_guild'
    );
  });
  it('unlinks the identity after revoking the Linked role', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { discord_user_id: 'discord-123' },
      error: null,
    });
    invokeMock.mockResolvedValue({ data: { revoked: true }, error: null });
    const wrapper = await mountCard();
    await wrapper.findAll('button')[1]!.trigger('click');
    await flushPromises();
    expect(invokeMock).toHaveBeenCalledWith('discord-unlink', { body: {} });
    expect(unlinkIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'identity-1', provider: 'discord' })
    );
    expect(wrapper.text()).toContain('settings.discord_link.link_account');
  });
  it.each([{ provider_id: 'discord-123' }, { sub: 'discord-123' }])(
    'unlinks the displayed Discord account when another identity comes first (%j)',
    async (metadata) => {
      const linkedIdentity = {
        id: 'identity-linked',
        provider: 'discord',
        identity_data: { ...metadata, full_name: 'linked-user' },
      };
      maybeSingleMock.mockResolvedValue({ data: { discord_user_id: 'discord-123' }, error: null });
      userGetMock.mockResolvedValue({
        data: {
          user: {
            identities: [
              {
                id: 'identity-other',
                provider: 'discord',
                identity_data: { provider_id: 'discord-other', full_name: 'wrong-user' },
              },
              linkedIdentity,
              { id: 'identity-email', provider: 'email' },
            ],
          },
        },
        error: null,
      });
      const wrapper = await mountCard();
      expect(wrapper.text()).toContain('Linked as linked-user');
      await wrapper.findAll('button')[1]!.trigger('click');
      await flushPromises();
      expect(invokeMock).toHaveBeenCalledWith('discord-unlink', { body: {} });
      expect(unlinkIdentityMock).toHaveBeenCalledWith(linkedIdentity);
      expect(wrapper.text()).toContain('settings.discord_link.link_account');
    }
  );
  it('keeps the link when its matching Discord identity is missing', async () => {
    maybeSingleMock.mockResolvedValue({ data: { discord_user_id: 'discord-123' }, error: null });
    userGetMock.mockResolvedValue({
      data: {
        user: {
          identities: [
            {
              id: 'identity-other',
              provider: 'discord',
              identity_data: { provider_id: 'discord-other' },
            },
            { id: 'identity-email', provider: 'email' },
          ],
        },
      },
      error: null,
    });
    const wrapper = await mountCard();
    await wrapper.findAll('button')[1]!.trigger('click');
    await flushPromises();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(unlinkIdentityMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('settings.discord_link.unlink_error');
  });
  it('restores the Linked role when identity unlinking fails', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { discord_user_id: 'discord-123' },
      error: null,
    });
    invokeMock
      .mockResolvedValueOnce({ data: { revoked: true }, error: null })
      .mockResolvedValueOnce({ data: { synced: true }, error: null });
    unlinkIdentityMock.mockResolvedValue({ error: new Error('identity unlink failed') });
    const wrapper = await mountCard();
    await wrapper.findAll('button')[1]!.trigger('click');
    await flushPromises();
    expect(invokeMock.mock.calls).toEqual([
      ['discord-unlink', { body: {} }],
      ['discord-role-sync', { body: {} }],
    ]);
    expect(wrapper.text()).toContain('settings.discord_link.unlink_error');
  });
  it('restores managed roles and keeps the identity linked when role revocation fails', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { discord_user_id: 'discord-123' },
      error: null,
    });
    invokeMock
      .mockResolvedValueOnce({ data: null, error: new Error('Discord unavailable') })
      .mockResolvedValueOnce({ data: { synced: true }, error: null });
    const wrapper = await mountCard();
    await wrapper.findAll('button')[1]!.trigger('click');
    await flushPromises();
    expect(unlinkIdentityMock).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls).toEqual([
      ['discord-unlink', { body: {} }],
      ['discord-role-sync', { body: {} }],
    ]);
    expect(wrapper.text()).toContain('settings.discord_link.unlink_error');
  });
  it('does not revoke roles when Discord is the only login identity', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { discord_user_id: 'discord-123' },
      error: null,
    });
    userGetMock.mockResolvedValue({
      data: {
        user: {
          identities: [
            {
              id: 'identity-1',
              provider: 'discord',
              identity_data: { provider_id: 'discord-123' },
            },
          ],
        },
      },
      error: null,
    });
    const wrapper = await mountCard();
    await wrapper.findAll('button')[1]!.trigger('click');
    await flushPromises();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(unlinkIdentityMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('settings.discord_link.unlink_requires_login');
  });
  it('sends logged-out users to login without starting identity linking', async () => {
    userState.id = null;
    const wrapper = await mountCard();
    expect(wrapper.findComponent(LoginRequiredAlert).exists()).toBe(true);
    expect(wrapper.get('a').attributes('href')).toBe('/login?redirect=%2Fsettings%23account');
    expect(wrapper.text()).toContain('settings.discord_link.login_to_link');
    expect(linkIdentityMock).not.toHaveBeenCalled();
  });
});
