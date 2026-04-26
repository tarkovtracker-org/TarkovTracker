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
  routeHash: '',
};
const mockFns = {
  setGameEdition: vi.fn(),
  syncPvpPrestigeLevel: vi.fn(),
  resetPvPData: vi.fn(),
  resetPvEData: vi.fn(),
  resetAllData: vi.fn(),
  routerReplace: vi.fn(),
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
  replace: mockFns.routerReplace,
  resolve: vi.fn(() => ({ href: '/' })),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));
mockNuxtImport('useRoute', () => () => ({
  path: '/settings',
  query: {},
  get hash() {
    return mockState.routeHash;
  },
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
    getPvPProgressData: () => ({ prestigeLevel: mockState.prestigeLevel }),
    syncPvpPrestigeLevel: mockFns.syncPvpPrestigeLevel,
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
  ApiTokensCard: { template: '<div data-testid="api-tokens-card" />' },
  DataManagementCard: { template: '<div data-testid="data-management-card" />' },
  DisplayNameCard: {
    data: () => ({
      localValue: '',
    }),
    template: `
      <div data-testid="display-name-card">
        <input data-testid="display-name-input" v-model="localValue" />
      </div>
    `,
  },
  NuxtLink: { template: '<a><slot /></a>' },
  SelectMenuFixed: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template:
      '<select data-testid="u-select" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="opt in (items || [])" :key="opt.value ?? opt" :value="opt.value ?? opt">{{ opt.label || opt }}</option></select>',
  },
  'i18n-t': { template: '<span><slot /><slot name="word" /></span>' },
  ExperienceCard: { template: '<div data-testid="experience-card" />' },
  MapSettingsCard: { template: '<div data-testid="map-settings-card" />' },
  PrestigeCard: { template: '<div data-testid="prestige-card" />' },
  ProfileSharingCard: true,
  SkillsCard: { template: '<div id="settings-skills" data-testid="skills-card" />' },
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
  TaskDisplayCard: { template: '<div data-testid="task-display-card" />' },
  UTabs: {
    props: ['items', 'modelValue'],
    emits: ['update:modelValue'],
    template: `
      <div data-testid="tabs">
        <button
          v-for="item in (items || [])"
          :key="item.value"
          type="button"
          :data-testid="'tab-' + item.value"
          @click="$emit('update:modelValue', item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    `,
  },
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
    routeHash?: string;
  } = {}
) => {
  mockState.isLoggedIn = options.isLoggedIn ?? false;
  mockState.isAdmin = options.isAdmin ?? false;
  mockState.gameEdition = options.gameEdition ?? 1;
  mockState.prestigeLevel = options.prestigeLevel ?? 0;
  mockState.routeHash = options.routeHash ?? '';
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
    expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="prestige-card"]').exists()).toBe(true);
    expect(wrapper.find('#settings-progression').exists()).toBe(true);
  });
  describe('user states', () => {
    it('renders logged out state', () => {
      configureMockState({ isLoggedIn: false });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    });
    it('renders logged in state', () => {
      configureMockState({ isLoggedIn: true });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    });
    it('renders admin state', () => {
      configureMockState({ isLoggedIn: true, isAdmin: true });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    });
  });
  describe('edition and prestige settings', () => {
    it('renders with different game editions', () => {
      configureMockState({ gameEdition: 2 });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    });
    it('renders with prestige level', () => {
      configureMockState({ prestigeLevel: 3 });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    });
    it('opens the data management tab from the route hash', async () => {
      configureMockState({ routeHash: '#settings-data-management' });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="data-management-card"]').exists()).toBe(true);
      expect(wrapper.find('#settings-progression').exists()).toBe(false);
    });
    it('opens the api tab from the route hash', async () => {
      configureMockState({ routeHash: '#api' });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="api-tokens-card"]').exists()).toBe(true);
      expect(wrapper.find('#settings-progression').exists()).toBe(false);
    });
    it('keeps skill deep links on the progression tab', async () => {
      configureMockState({ routeHash: '#settings-skills' });
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('#settings-progression').exists()).toBe(true);
      expect(wrapper.find('[data-testid="skills-card"]').exists()).toBe(true);
    });
    it('updates the route hash when selecting a tab', async () => {
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="tab-preferences"]').trigger('click');
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '#settings-preferences',
        path: '/settings',
        query: {},
      });
    });
    it('updates the route hash when selecting the api tab', async () => {
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="tab-api"]').trigger('click');
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '#api',
        path: '/settings',
        query: {},
      });
    });
    it('preserves state for previously visited tab panels after switching', async () => {
      const wrapper = mount(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="display-name-input"]').setValue('cached-name');
      await wrapper.get('[data-testid="tab-preferences"]').trigger('click');
      await wrapper.vm.$nextTick();
      expect(wrapper.find('#settings-progression').exists()).toBe(true);
      await wrapper.get('[data-testid="tab-progression"]').trigger('click');
      await wrapper.vm.$nextTick();
      expect(
        (wrapper.get('[data-testid="display-name-input"]').element as HTMLInputElement).value
      ).toBe('cached-name');
    });
  });
});
