// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import AdminPage from '@/pages/admin.vue';
const state = {
  hasInitiallyLoaded: true,
  isAdmin: true,
  loadError: null as Error | null,
};
const pushMock = vi.fn();
mockNuxtImport('definePageMeta', () => () => {});
mockNuxtImport('useSeoMeta', () => () => {});
mockNuxtImport('useRouter', () => () => ({
  push: pushMock,
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: {
      displayName: 'Admin',
      email: 'admin@example.com',
    },
  },
}));
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStoreWithSupabase: () => ({
    hasInitiallyLoaded: ref(state.hasInitiallyLoaded),
    loadError: ref(state.loadError),
    systemStore: {
      get isAdmin() {
        return state.isAdmin;
      },
    },
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
describe('admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.hasInitiallyLoaded = true;
    state.isAdmin = true;
    state.loadError = null;
  });
  it('renders admin cards for authorized admins', () => {
    const wrapper = mount(AdminPage, {
      global: {
        stubs: {
          AdminAuditLog: { template: '<div data-testid="audit-log" />' },
          AdminCacheCard: { template: '<div data-testid="cache-card" />' },
          UAlert: true,
          UIcon: true,
        },
      },
    });
    expect(wrapper.find('[data-testid="cache-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="audit-log"]').exists()).toBe(true);
  });
  it('redirects non-admin users to home', async () => {
    state.isAdmin = false;
    mount(AdminPage, {
      global: {
        stubs: {
          AdminAuditLog: true,
          AdminCacheCard: true,
          UAlert: true,
          UIcon: true,
        },
      },
    });
    await nextTick();
    expect(pushMock).toHaveBeenCalledWith('/');
  });
});
