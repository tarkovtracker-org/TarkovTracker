// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import AccountPage from '@/pages/account.vue';
const mockState = {
  isAdmin: false,
  isLoggedIn: false,
};
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: {
      get loggedIn() {
        return mockState.isLoggedIn;
      },
      id: 'user-1',
    },
  },
  deferHydration: () => () => {},
  hooks: {
    callHook: vi.fn(() => Promise.resolve()),
    callHookWith: vi.fn(() => Promise.resolve()),
    hookOnce: vi.fn(),
  },
  isHydrating: false,
  runWithContext: (fn: () => unknown) => fn(),
}));
mockNuxtImport('useSeoMeta', () => () => {});
mockNuxtImport('definePageMeta', () => () => {});
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStore: () => ({
    get isAdmin() {
      return mockState.isAdmin;
    },
  }),
  useSystemStoreWithSupabase: () => ({
    hasInitiallyLoaded: ref(true),
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
describe('account page', () => {
  beforeEach(() => {
    mockState.isAdmin = false;
    mockState.isLoggedIn = false;
    vi.clearAllMocks();
  });
  it('renders privacy card', () => {
    const wrapper = mount(AccountPage, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          AccountDeletionCard: true,
          ApiTokens: true,
          GenericCard: true,
          NuxtLink: { template: '<a><slot /></a>' },
          PrivacyCard: { template: '<div data-testid="privacy-card" />' },
          ProfileSharingCard: true,
          UAlert: true,
          UIcon: true,
        },
      },
    });
    expect(wrapper.find('[data-testid="privacy-card"]').exists()).toBe(true);
  });
  it('shows admin link when user is admin', () => {
    mockState.isAdmin = true;
    mockState.isLoggedIn = true;
    const wrapper = mount(AccountPage, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          AccountDeletionCard: true,
          ApiTokens: true,
          GenericCard: true,
          NuxtLink: { template: '<a><slot /></a>', props: ['to'] },
          PrivacyCard: true,
          ProfileSharingCard: true,
          UAlert: true,
          UIcon: true,
        },
      },
    });
    expect(wrapper.text()).toContain('settings.general.admin_panel');
  });
  it('hides admin link when user is not admin', () => {
    mockState.isAdmin = false;
    mockState.isLoggedIn = true;
    const wrapper = mount(AccountPage, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          AccountDeletionCard: true,
          ApiTokens: true,
          GenericCard: true,
          NuxtLink: { template: '<a><slot /></a>' },
          PrivacyCard: true,
          ProfileSharingCard: true,
          UAlert: true,
          UIcon: true,
        },
      },
    });
    expect(wrapper.text()).not.toContain('settings.general.admin_panel');
  });
});
