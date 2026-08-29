// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import AdminSupporterAccessCard from '@/features/admin/AdminSupporterAccessCard.vue';
import { ADMIN_CARD_STUBS } from './adminCardStubs';
const { fetchMock, getSessionMock, refreshSessionMock, toastAddMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
  toastAddMock: vi.fn(),
}));
const systemStore = reactive({ isAdmin: true });
const supabaseUser = reactive({ id: 'user-1' });
vi.mock('@/composables/useSupporter', () => ({
  useSupporter: () => ({ fetchStatus: vi.fn() }),
}));
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
    user: supabaseUser,
  },
}));
mockNuxtImport('useToast', () => () => ({ add: toastAddMock }));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const mountCard = () =>
  mount(AdminSupporterAccessCard, {
    global: {
      stubs: ADMIN_CARD_STUBS,
    },
  });
describe('AdminSupporterAccessCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('$fetch', fetchMock);
    systemStore.isAdmin = true;
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } });
    refreshSessionMock.mockResolvedValue({ data: { session: null } });
    fetchMock.mockRejectedValue(
      Object.assign(new Error('Bad Request'), {
        data: { data: { code: 'invalid_tier' }, statusMessage: 'Invalid tier' },
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('maps the server error code to localized copy on failure', async () => {
    const wrapper = mountCard();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error', description: 'admin.error.invalid_tier' })
    );
  });
  it('uses generic localized copy for unknown codes', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('Bad Request'), {
        data: { data: { code: 'unknown_admin_error' } },
      })
    );
    const wrapper = mountCard();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        description: 'admin.supporter_override_failed_description',
      })
    );
  });
  it('shows the localized sign-in prompt when no session token is available', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const wrapper = mountCard();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        description: 'admin.error.authentication_required',
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
