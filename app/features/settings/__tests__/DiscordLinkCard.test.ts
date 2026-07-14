// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DiscordLinkCard from '@/features/settings/DiscordLinkCard.vue';
const {
  invokeMock,
  linkIdentityMock,
  maybeSingleMock,
  readyMock,
  replaceMock,
  routeState,
  selectMock,
  userState,
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
        linkIdentity: linkIdentityMock,
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
  template: '<div :data-color="color">{{ title }} {{ description }}</div>',
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
      data: { discord_username: 'linked-user' },
      error: null,
    });
    const wrapper = await mountCard();
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Linked as linked-user');
    expect(invokeMock).not.toHaveBeenCalled();
  });
  it('retries loading after OAuth return and then syncs roles', async () => {
    routeState.query = { discord_linked: '1' };
    routeState.hash = '#account';
    maybeSingleMock
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('trigger lag') })
      .mockResolvedValueOnce({
        data: { discord_username: 'linked-user' },
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
    expect(replaceMock).toHaveBeenCalledWith({ query: {}, hash: '#account' });
    expect(wrapper.text()).toContain('Linked as linked-user');
  });
  it('shows a warning when the linked Discord account has not joined the server', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { discord_username: 'linked-user' },
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
  it('sends logged-out users to login without starting identity linking', async () => {
    userState.id = null;
    const wrapper = await mountCard();
    expect(wrapper.get('a').attributes('href')).toBe('/login?redirect=%2Fsettings%23account');
    expect(wrapper.text()).toContain('settings.discord_link.login_to_link');
    expect(linkIdentityMock).not.toHaveBeenCalled();
  });
});
