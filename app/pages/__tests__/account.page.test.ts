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
const mockFns = {
  resetAllData: vi.fn(),
  resetPvEData: vi.fn(),
  resetPvPData: vi.fn(),
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
mockNuxtImport('useToast', () => () => ({
  add: vi.fn(),
}));
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
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    resetAllData: mockFns.resetAllData,
    resetPvEData: mockFns.resetPvEData,
    resetPvPData: mockFns.resetPvPData,
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
  it('renders streamer mode card', () => {
    const wrapper = mount(AccountPage, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          AccountDeletionCard: true,
          ApiTokens: true,
          GenericCard: true,
          'i18n-t': { template: '<span><slot /><slot name="word" /></span>' },
          NuxtLink: { template: '<a><slot /></a>' },
          PrivacyCard: { template: '<div data-testid="privacy-card" />' },
          ProfileSharingCard: true,
          UAlert: true,
          UButton: true,
          UIcon: true,
          UInput: true,
          UModal: true,
        },
      },
    });
    expect(wrapper.find('[data-testid="privacy-card"]').exists()).toBe(true);
  });
});
