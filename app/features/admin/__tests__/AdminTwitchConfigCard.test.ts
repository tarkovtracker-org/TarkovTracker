// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import AdminTwitchConfigCard from '@/features/admin/AdminTwitchConfigCard.vue';
import { logger } from '@/utils/logger';
import { ADMIN_CARD_STUBS } from './adminCardStubs';
const { fetchMock, getSessionMock, refreshSessionMock, toastAddMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
  toastAddMock: vi.fn(),
}));
const systemStore = reactive({ isAdmin: true });
vi.stubGlobal('$fetch', fetchMock);
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStoreWithSupabase: () => ({ systemStore }),
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    client: {
      auth: {
        getSession: getSessionMock,
        refreshSession: refreshSessionMock,
      },
    },
  },
}));
mockNuxtImport('useToast', () => () => ({ add: toastAddMock }));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: { channel?: string }) => params?.channel ?? key,
  }),
}));
const mountCard = () =>
  mount(AdminTwitchConfigCard, {
    global: {
      stubs: ADMIN_CARD_STUBS,
    },
  });
describe('AdminTwitchConfigCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    systemStore.isAdmin = true;
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } });
    refreshSessionMock.mockResolvedValue({ data: { session: null } });
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/config') {
        return Promise.resolve({ channel: 'streamer', displayName: 'Streamer', enabled: true });
      }
      return Promise.resolve({ cacheInvalidated: true, config: {}, version: 1 });
    });
  });
  it('loads the effective Twitch configuration', async () => {
    const wrapper = mountCard();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/twitch/config', { cache: 'no-store' });
    expect(wrapper.findAll('input')[0]!.attributes('value')).toBe('streamer');
    expect(wrapper.findAll('input')[1]!.attributes('value')).toBe('Streamer');
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });
  it('does not send a write request when the current user is not an admin', async () => {
    systemStore.isAdmin = false;
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/twitch-config', expect.anything());
  });
  it('applies the saved configuration returned by the API', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/config') {
        return Promise.resolve({ channel: 'streamer', displayName: 'Streamer', enabled: true });
      }
      return Promise.resolve({
        cacheInvalidated: true,
        config: { channel: 'streamer', displayName: 'streamer', enabled: true },
        version: 2,
      });
    });
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.findAll('input')[1]!.setValue('   ');
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/twitch-config',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer admin-token' },
        body: { channel: 'streamer', displayName: '', enabled: true },
      })
    );
    expect(wrapper.findAll('input')[1]!.attributes('value')).toBe('streamer');
  });
  it('warns when the config was saved but cache invalidation failed', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/config') {
        return Promise.resolve({ channel: 'streamer', displayName: 'Streamer', enabled: true });
      }
      return Promise.resolve({
        cacheInvalidated: false,
        config: { channel: 'streamer', displayName: 'Streamer', enabled: true },
        version: 2,
      });
    });
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'warning',
        title: 'admin.twitch_config_saved_with_warning_title',
      })
    );
  });
  it('maps the server error code to localized copy on failure', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/config') {
        return Promise.resolve({ channel: 'streamer', displayName: 'Streamer', enabled: true });
      }
      return Promise.reject(
        Object.assign(new Error('Bad Request'), {
          data: { data: { code: 'invalid_channel' }, statusMessage: 'Invalid channel' },
        })
      );
    });
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error', description: 'admin.error.invalid_channel' })
    );
  });
  it('reports and logs a load failure separately from a save failure', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const error = new Error('offline');
    fetchMock.mockImplementation(() => Promise.reject(error));
    mountCard();
    await flushPromises();
    expect(warnSpy).toHaveBeenCalledWith(
      '[AdminTwitchConfigCard] Failed to load Twitch config',
      error
    );
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        title: 'admin.twitch_config_load_failed_title',
      })
    );
  });
  it('logs a save failure before displaying the existing error toast', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const error = Object.assign(new Error('Bad Request'), {
      data: { data: { code: 'invalid_channel' }, statusMessage: 'Invalid channel' },
    });
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/config') {
        return Promise.resolve({ channel: 'streamer', displayName: 'Streamer', enabled: true });
      }
      return Promise.reject(error);
    });
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(warnSpy).toHaveBeenCalledWith(
      '[AdminTwitchConfigCard] Failed to save Twitch config',
      error
    );
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error', description: 'admin.error.invalid_channel' })
    );
  });
  it('shows the localized sign-in prompt when no session token is available', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        description: 'admin.error.authentication_required',
      })
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/twitch-config', expect.anything());
  });
});
