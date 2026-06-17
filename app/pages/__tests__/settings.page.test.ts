// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import SettingsPage from '@/pages/settings.vue';
const { mockFns, mockState } = vi.hoisted(() => ({
  mockState: {
    isLoggedIn: false,
    isAdmin: false,
    gameEdition: 1,
    prestigeLevel: 0,
    routeHash: '',
    routePath: '/settings',
  },
  mockFns: {
    setGameEdition: vi.fn(),
    syncPvpPrestigeLevel: vi.fn(),
    resetPvPData: vi.fn(),
    resetPvEData: vi.fn(),
    resetAllData: vi.fn(),
    routerReplace: vi.fn(),
    seoMeta: vi.fn(),
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
  get path() {
    return mockState.routePath;
  },
  query: {},
  get hash() {
    return mockState.routeHash;
  },
}));
mockNuxtImport('useSeoMeta', () => mockFns.seoMeta);
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
vi.mock('@/features/settings/useDataManagementSession', () => ({
  useDataManagementSession: () => ({
    backup: {},
    eftLogs: {},
    tarkovDev: {},
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));
const defaultGlobalStubs = {
  AccountDeletionCard: { template: '<div data-testid="account-deletion-card" />' },
  ApiTokensCard: { template: '<div data-testid="api-tokens-card" />' },
  DataManagementCard: {
    props: ['session', 'view'],
    template:
      '<div :data-has-session="session ? \'true\' : \'false\'" :data-testid="`data-management-card-${view}`" />',
  },
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
  KeybindsCard: { template: '<div data-testid="keybinds-card" />' },
  MapSettingsCard: { template: '<div data-testid="map-settings-card" />' },
  PrestigeCard: { template: '<div data-testid="prestige-card" />' },
  PrivacyCard: { template: '<div data-testid="privacy-card" />' },
  ProfileSharingCard: { template: '<div data-testid="profile-sharing-card" />' },
  ResetProgressCard: { template: '<div data-testid="reset-progress-card" />' },
  SkillsCard: { template: '<div id="skills" data-testid="skills-card" />' },
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
const configureMockState = (
  options: {
    isLoggedIn?: boolean;
    isAdmin?: boolean;
    gameEdition?: number;
    prestigeLevel?: number;
    routeHash?: string;
    routePath?: string;
  } = {}
) => {
  mockState.isLoggedIn = options.isLoggedIn ?? false;
  mockState.isAdmin = options.isAdmin ?? false;
  mockState.gameEdition = options.gameEdition ?? 1;
  mockState.prestigeLevel = options.prestigeLevel ?? 0;
  mockState.routeHash = options.routeHash ?? '';
  mockState.routePath = options.routePath ?? '/settings';
};
describe('settings page', () => {
  beforeEach(() => {
    configureMockState();
    vi.clearAllMocks();
  });
  const globalConfig = {
    stubs: defaultGlobalStubs,
    mocks: { $t: (key: string) => key },
  };
  it('renders settings layout', async () => {
    const wrapper = await mountSuspended(SettingsPage, {
      global: globalConfig,
    });
    expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="experience-card"]').exists()).toBe(true);
    expect(wrapper.find('#progression').exists()).toBe(true);
  });
  describe('user states', () => {
    it('renders logged out state', async () => {
      configureMockState({ isLoggedIn: false });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    });
    it('renders logged in state', async () => {
      configureMockState({ isLoggedIn: true });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    });
    it('renders admin state', async () => {
      configureMockState({ isLoggedIn: true, isAdmin: true });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    });
  });
  describe('edition and prestige settings', () => {
    it('renders with different game editions', async () => {
      configureMockState({ gameEdition: 2 });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
    });
    it('renders with prestige level', async () => {
      configureMockState({ prestigeLevel: 3, routePath: '/prestige' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.find('[data-testid="prestige-card"]').exists()).toBe(true);
      expect(wrapper.find('#prestige').exists()).toBe(true);
    });
    it('opens the progression tab from the progression route', async () => {
      configureMockState({ routePath: '/progression' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="display-name-card"]').exists()).toBe(true);
      expect(wrapper.find('#progression').exists()).toBe(true);
    });
    it('opens the preferences tab from the preferences route', async () => {
      configureMockState({ routePath: '/preferences' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="privacy-card"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="task-display-card"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="keybinds-card"]').exists()).toBe(true);
      expect(wrapper.find('#progression').exists()).toBe(false);
    });
    it('opens the imports tab from the route hash', async () => {
      configureMockState({ routeHash: '#imports' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="data-management-card-imports"]').exists()).toBe(true);
      expect(
        wrapper.find('[data-testid="data-management-card-imports"]').attributes('data-has-session')
      ).toBe('true');
      expect(wrapper.find('#progression').exists()).toBe(false);
    });
    it('opens the imports tab from the legacy data management hash', async () => {
      configureMockState({ routeHash: '#data-management' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="data-management-card-imports"]').exists()).toBe(true);
      expect(wrapper.find('#progression').exists()).toBe(false);
    });
    it('opens the backup and restore tab from the route hash', async () => {
      configureMockState({ routeHash: '#backup-restore' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="data-management-card-backup"]').exists()).toBe(true);
      expect(wrapper.find('#progression').exists()).toBe(false);
    });
    it('opens the api tab from the route hash', async () => {
      configureMockState({ routeHash: '#api' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="api-tokens-card"]').exists()).toBe(true);
      expect(wrapper.find('#progression').exists()).toBe(false);
    });
    it('renders streamer mode on the preferences tab', async () => {
      configureMockState({ routeHash: '#preferences' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="privacy-card"]').exists()).toBe(true);
    });
    it('opens the account tab from the route hash without remounting', async () => {
      configureMockState({ routeHash: '#account' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(mockFns.routerReplace).not.toHaveBeenCalledWith({
        hash: '',
        path: '/account',
        query: {},
      });
      expect(wrapper.find('[data-testid="profile-sharing-card"]').exists()).toBe(true);
      expect(wrapper.find('#progression').exists()).toBe(false);
    });
    it('redirects the old settings account hash to the account route', async () => {
      configureMockState({ routeHash: '#settings-account' });
      await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '',
        path: '/account',
        query: {},
      });
    });
    it('opens the account tab from the account route without a hash', async () => {
      configureMockState({ routePath: '/account' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('[data-testid="profile-sharing-card"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="account-deletion-card"]').exists()).toBe(true);
      expect(wrapper.find('#progression').exists()).toBe(false);
    });
    it('shows the admin link on the account route for admins', async () => {
      configureMockState({ isAdmin: true, isLoggedIn: true, routePath: '/account' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.text()).toContain('settings.general.admin_panel');
    });
    it('groups desktop settings tabs and keeps mobile tabs in priority order', async () => {
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      expect(wrapper.text()).toContain('settings.tab_groups.game');
      expect(wrapper.text()).toContain('settings.tab_groups.account_advanced');
      expect(wrapper.findAll('[data-testid="tabs"] button').map((button) => button.text())).toEqual(
        [
          'settings.tabs.progression',
          'settings.tabs.preferences',
          'settings.tabs.imports',
          'settings.tabs.prestige',
          'settings.tabs.account',
          'settings.tabs.backup_restore',
          'settings.tabs.api',
          'settings.tabs.streamer_tools',
        ]
      );
    });
    it('marks settings control routes as noindex', async () => {
      configureMockState({ routePath: '/progression' });
      await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      expect(mockFns.seoMeta).toHaveBeenCalledWith(
        expect.objectContaining({
          robots: 'noindex, nofollow',
        })
      );
    });
    it('keeps legacy skill deep links on the progression tab', async () => {
      configureMockState({ routeHash: '#settings-skills' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('#progression').exists()).toBe(true);
      expect(wrapper.find('[data-testid="skills-card"]').exists()).toBe(true);
    });
    it('keeps skill deep links on the progression tab', async () => {
      configureMockState({ routeHash: '#skills' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await vi.dynamicImportSettled();
      expect(wrapper.find('#progression').exists()).toBe(true);
      expect(wrapper.find('[data-testid="skills-card"]').exists()).toBe(true);
    });
    it('updates the hash when selecting the progression tab', async () => {
      configureMockState({ routePath: '/account' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="tab-progression"]').trigger('click');
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '#progression',
        query: {},
      });
    });
    it('updates the hash when selecting the preferences tab', async () => {
      configureMockState({ routePath: '/prestige' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="tab-preferences"]').trigger('click');
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '#preferences',
        query: {},
      });
    });
    it('updates the hash when selecting the prestige tab', async () => {
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="tab-prestige"]').trigger('click');
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '#prestige',
        query: {},
      });
    });
    it('updates the hash when selecting the account tab', async () => {
      configureMockState({ routeHash: '#prestige' });
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="tab-account"]').trigger('click');
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '#account',
        query: {},
      });
    });
    it('updates the route hash when selecting the imports tab', async () => {
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="tab-imports"]').trigger('click');
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '#imports',
        query: {},
      });
    });
    it('updates the route hash when selecting the backup and restore tab', async () => {
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="tab-backup-restore"]').trigger('click');
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '#backup-restore',
        query: {},
      });
    });
    it('updates the route hash when selecting the api tab', async () => {
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="tab-api"]').trigger('click');
      expect(mockFns.routerReplace).toHaveBeenCalledWith({
        hash: '#api',
        query: {},
      });
    });
    it('preserves state for previously visited tab panels after switching', async () => {
      const wrapper = await mountSuspended(SettingsPage, {
        global: globalConfig,
      });
      await wrapper.get('[data-testid="display-name-input"]').setValue('cached-name');
      await wrapper.get('[data-testid="tab-preferences"]').trigger('click');
      await wrapper.vm.$nextTick();
      expect(wrapper.find('#progression').exists()).toBe(true);
      await wrapper.get('[data-testid="tab-progression"]').trigger('click');
      await wrapper.vm.$nextTick();
      expect(
        (wrapper.get('[data-testid="display-name-input"]').element as HTMLInputElement).value
      ).toBe('cached-name');
    });
  });
});
