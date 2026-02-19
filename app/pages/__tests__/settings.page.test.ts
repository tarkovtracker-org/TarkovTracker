// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import SettingsPage from '@/pages/settings.vue';
// Module-level state that mocks can reference
const mockState = {
  isLoggedIn: false,
  isAdmin: false,
  gameEdition: 1,
  prestigeLevel: 0,
};
const mockFns = {
  setGameEdition: vi.fn(),
  setPrestigeLevel: vi.fn(),
  resetPvPData: vi.fn(),
  resetPvEData: vi.fn(),
  resetAllData: vi.fn(),
};
// Top-level mocks using mockNuxtImport (auto-hoisted)
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: {
      get loggedIn() {
        return mockState.isLoggedIn;
      },
      displayName: 'User',
      photoURL: '',
    },
  },
  deferHydration: () => () => {},
  isHydrating: false,
  runWithContext: (fn: () => unknown) => fn(),
  hooks: {
    hookOnce: vi.fn(),
    callHookWith: vi.fn(() => Promise.resolve()),
    callHook: vi.fn(() => Promise.resolve()),
  },
}));
mockNuxtImport('useToast', () => () => ({
  add: vi.fn(),
}));
mockNuxtImport('useRouter', () => () => ({
  replace: vi.fn(),
  resolve: vi.fn(() => ({ href: '/' })),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));
mockNuxtImport('useSeoMeta', () => () => {});
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    editions: [
      { value: 1, title: 'Standard' },
      { value: 2, title: 'Left Behind' },
      { value: 3, title: 'Prepare for Escape' },
    ],
  }),
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
    getCurrentGameMode: () => 'pvp',
    getGameEdition: () => mockState.gameEdition,
    setGameEdition: mockFns.setGameEdition,
    getPrestigeLevel: () => mockState.prestigeLevel,
    setPrestigeLevel: mockFns.setPrestigeLevel,
    resetPvPData: mockFns.resetPvPData,
    resetPvEData: mockFns.resetPvEData,
    resetAllData: mockFns.resetAllData,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));
const defaultGlobalStubs = {
  DataManagementCard: true,
  DisplayNameCard: true,
  ApiTokens: true,
  NuxtLink: { template: '<a><slot /></a>' },
  SelectMenuFixed: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template:
      '<select data-testid="u-select" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="opt in (items || [])" :key="opt.value ?? opt" :value="opt.value ?? opt">{{ opt.label || opt }}</option></select>',
  },
  'i18n-t': { template: '<span><slot /><slot name="word" /></span>' },
  ExperienceCard: true,
  GenericCard: {
    template: '<div data-testid="generic-card"><slot /><slot name="content" /></div>',
  },
  MapSettingsCard: true,
  ProfileSharingCard: true,
  SkillsCard: true,
  UAlert: true,
  UBadge: true,
  UButton: {
    props: ['disabled'],
    emits: ['click'],
    template:
      '<button data-testid="u-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  UIcon: true,
  UInput: true,
  UModal: true,
  TaskDisplayCard: true,
  USelectMenu: {
    props: ['modelValue', 'items', 'options'],
    emits: ['update:modelValue'],
    template:
      '<select data-testid="u-select" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="opt in (items || options || [])" :key="opt.value ?? opt" :value="opt.value ?? opt">{{ opt.label || opt.title || opt }}</option></select>',
  },
  UTooltip: { template: '<span><slot /></span>' },
};
// Helper to configure mock state for each test
const configureMockState = (
  options: {
    isLoggedIn?: boolean;
    isAdmin?: boolean;
    gameEdition?: number;
    prestigeLevel?: number;
  } = {}
) => {
  mockState.isLoggedIn = options.isLoggedIn ?? false;
  mockState.isAdmin = options.isAdmin ?? false;
  mockState.gameEdition = options.gameEdition ?? 1;
  mockState.prestigeLevel = options.prestigeLevel ?? 0;
};
describe('settings page', () => {
  beforeEach(() => {
    // Reset mock state to defaults before each test
    configureMockState();
    vi.clearAllMocks();
  });
  const globalConfig = {
    stubs: defaultGlobalStubs,
    mocks: { $t: (key: string) => key },
  };
  it('renders settings layout', () => {
    const wrapper = mount(SettingsPage, {
      global: globalConfig,
    });
    expect(wrapper.find('[data-testid="generic-card"]').exists()).toBe(true);
  });
  describe('user states', () => {
    it('renders logged out state', () => {
      configureMockState({ isLoggedIn: false });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="generic-card"]').exists()).toBe(true);
    });
    it('renders logged in state', () => {
      configureMockState({ isLoggedIn: true });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="generic-card"]').exists()).toBe(true);
    });
    it('renders admin state', () => {
      configureMockState({ isLoggedIn: true, isAdmin: true });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="generic-card"]').exists()).toBe(true);
    });
  });
  describe('edition and prestige settings', () => {
    it('renders with different game editions', () => {
      configureMockState({ gameEdition: 2 });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="generic-card"]').exists()).toBe(true);
    });
    it('renders with prestige level', () => {
      configureMockState({ prestigeLevel: 3 });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="generic-card"]').exists()).toBe(true);
    });
    it('renders edition select with numeric value handling', () => {
      configureMockState({ gameEdition: 2 });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      const selects = wrapper.findAll('[data-testid="u-select"]');
      expect(selects.length).toBeGreaterThan(0);
      const editionSelect = selects[0];
      expect(editionSelect?.exists()).toBe(true);
    });
  });
});
