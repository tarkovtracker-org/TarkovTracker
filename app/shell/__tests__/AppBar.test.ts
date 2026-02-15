// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
const localeRef = ref('en');
const setLocale = vi.fn(async (value: string) => {
  localeRef.value = value;
});
const mockSupabase = {
  user: {
    id: '',
    loggedIn: false,
    photoURL: '',
    displayName: '',
    username: '',
  },
  signOut: vi.fn(),
};
const mockToast = {
  add: vi.fn(),
};
const mockSkillCalculation = {
  migrateLegacySkillOffsets: vi.fn(),
};
const mockMetadataStore = reactive({
  loading: false,
  hideoutLoading: false,
  updateLanguageAndGameMode: vi.fn(),
  fetchAllData: vi.fn(async () => {}),
});
const mockPreferencesStore = {
  getStreamerMode: false,
  getLocaleOverride: 'en' as string | null,
  setLocaleOverride: vi.fn(),
};
const routeState = reactive({
  name: 'tasks',
  params: {} as Record<string, unknown>,
});
const mockTarkovStore = {
  getCurrentGameMode: vi.fn(() => 'pvp'),
  getDisplayName: vi.fn(() => ''),
  getPvEProgressData: vi.fn((): { displayName: string | null } => ({ displayName: null })),
  getPvPProgressData: vi.fn((): { displayName: string | null } => ({ displayName: null })),
};
function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    availableLocales: ['en', 'de', 'fr'],
    locale: localeRef,
    setLocale,
    t: (key: string, params?: Record<string, unknown> | string) => {
      if (params && typeof params === 'object' && !Array.isArray(params)) {
        const templates: Record<string, string> = {
          'profile.title_with_mode': '{name} Profile {mode}',
        };
        const template = templates[key] ?? key;
        return Object.entries(params).reduce(
          (result, [k, v]) => result.replaceAll(`{${k}}`, String(v)),
          template
        );
      }
      return key;
    },
    te: () => false,
  }),
}));
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useWindowSize: () => ({
    width: ref(1280),
  }),
}));
vi.mock('@/stores/useApp', () => ({
  useAppStore: () => ({
    mobileDrawerExpanded: false,
    drawerRail: false,
    toggleMobileDrawerExpanded: vi.fn(),
    toggleDrawerRail: vi.fn(),
    setMobileDrawerExpanded: vi.fn(),
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => mockMetadataStore,
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => mockTarkovStore,
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: mockSupabase,
}));
mockNuxtImport('useRoute', () => () => ({
  ...routeState,
}));
mockNuxtImport('useSkillCalculation', () => () => mockSkillCalculation);
mockNuxtImport('useToast', () => () => mockToast);
const mountAppBar = async () => {
  const { default: AppBar } = await import('@/shell/AppBar.vue');
  return mount(AppBar, {
    global: {
      stubs: {
        AppTooltip: {
          template: '<span><slot /></span>',
        },
        DiscordIcon: true,
        NuxtLink: {
          template: '<a><slot /></a>',
        },
        UButton: {
          props: ['icon'],
          emits: ['click'],
          template: '<button :data-icon="icon" @click="$emit(\'click\')"><slot /></button>',
        },
        UDropdownMenu: {
          props: ['items'],
          template:
            '<div><slot /><template v-for="(group, groupIndex) in (items || [])" :key="groupIndex"><button v-for="item in group" :key="item.label" type="button" :data-menu-item="item.label" @click="item.onSelect?.()">{{ item.label }}</button></template></div>',
        },
        UIcon: true,
      },
    },
  });
};
describe('AppBar locale switching', () => {
  beforeEach(async () => {
    localeRef.value = 'en';
    routeState.name = 'tasks';
    routeState.params = {};
    setLocale.mockClear();
    setLocale.mockImplementation(async (value: string) => {
      localeRef.value = value;
    });
    mockMetadataStore.loading = false;
    mockMetadataStore.hideoutLoading = false;
    mockMetadataStore.updateLanguageAndGameMode.mockClear();
    mockMetadataStore.fetchAllData.mockClear();
    mockMetadataStore.fetchAllData.mockResolvedValue(undefined);
    mockPreferencesStore.getStreamerMode = false;
    mockPreferencesStore.getLocaleOverride = 'en';
    mockPreferencesStore.setLocaleOverride.mockClear();
    mockPreferencesStore.setLocaleOverride.mockImplementation((value: string | null) => {
      mockPreferencesStore.getLocaleOverride = value;
    });
    mockSkillCalculation.migrateLegacySkillOffsets.mockClear();
    mockTarkovStore.getCurrentGameMode.mockClear();
    mockTarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    mockTarkovStore.getDisplayName.mockClear();
    mockTarkovStore.getDisplayName.mockReturnValue('');
    mockTarkovStore.getPvEProgressData.mockClear();
    mockTarkovStore.getPvEProgressData.mockReturnValue({ displayName: null });
    mockTarkovStore.getPvPProgressData.mockClear();
    mockTarkovStore.getPvPProgressData.mockReturnValue({ displayName: null });
    mockSupabase.user.id = '';
    mockSupabase.user.displayName = '';
    mockSupabase.user.username = '';
    mockSupabase.user.loggedIn = false;
    mockSupabase.signOut.mockClear();
    mockToast.add.mockClear();
    const { logger } = await import('@/utils/logger');
    (logger.debug as Mock).mockClear();
    (logger.error as Mock).mockClear();
    (logger.warn as Mock).mockClear();
  });
  it('switches locale with setLocale and refreshes language-bound metadata', async () => {
    const wrapper = await mountAppBar();
    const select = wrapper.get('select');
    await select.setValue('de');
    await flushPromises();
    expect(setLocale).toHaveBeenCalledWith('de');
    expect(mockPreferencesStore.setLocaleOverride).toHaveBeenCalledWith('de');
    expect(mockMetadataStore.updateLanguageAndGameMode).toHaveBeenCalledWith('de');
    expect(mockMetadataStore.fetchAllData).toHaveBeenCalledWith(false);
    expect(mockSkillCalculation.migrateLegacySkillOffsets).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('does not run locale switch flow when selecting the active locale', async () => {
    const wrapper = await mountAppBar();
    const select = wrapper.get('select');
    await select.setValue('en');
    await flushPromises();
    expect(setLocale).not.toHaveBeenCalled();
    expect(mockPreferencesStore.setLocaleOverride).not.toHaveBeenCalled();
    expect(mockMetadataStore.updateLanguageAndGameMode).not.toHaveBeenCalled();
    expect(mockMetadataStore.fetchAllData).not.toHaveBeenCalled();
    expect(mockSkillCalculation.migrateLegacySkillOffsets).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('handles setLocale errors without running metadata refresh side effects', async () => {
    const wrapper = await mountAppBar();
    const select = wrapper.get('select');
    const localeError = new Error('locale switch failed');
    setLocale.mockRejectedValueOnce(localeError);
    await select.setValue('de');
    await flushPromises();
    expect(setLocale).toHaveBeenCalledWith('de');
    expect(mockPreferencesStore.setLocaleOverride).not.toHaveBeenCalled();
    expect(mockMetadataStore.updateLanguageAndGameMode).not.toHaveBeenCalled();
    expect(mockMetadataStore.fetchAllData).not.toHaveBeenCalled();
    expect(mockSkillCalculation.migrateLegacySkillOffsets).not.toHaveBeenCalled();
    const { logger } = await import('@/utils/logger');
    expect(logger.error).toHaveBeenCalledWith('[AppBar] Error switching locale:', localeError);
    wrapper.unmount();
  });
  it('rolls back locale when fetchAllData rejects after setLocale succeeds', async () => {
    const fetchError = new Error('fetch failed');
    const previousLocale = localeRef.value;
    mockMetadataStore.fetchAllData.mockRejectedValueOnce(fetchError);
    const wrapper = await mountAppBar();
    const select = wrapper.get('select');
    await select.setValue('de');
    await flushPromises();
    expect(setLocale).toHaveBeenNthCalledWith(1, 'de');
    expect(setLocale).toHaveBeenNthCalledWith(2, previousLocale);
    expect(setLocale).toHaveBeenCalledTimes(2);
    expect(mockPreferencesStore.setLocaleOverride.mock.calls.map(([value]) => value)).toEqual([
      'de',
      'en',
    ]);
    expect(mockMetadataStore.updateLanguageAndGameMode.mock.calls.map(([value]) => value)).toEqual([
      'de',
      'en',
    ]);
    expect(mockPreferencesStore.getLocaleOverride).toBe('en');
    expect(localeRef.value).toBe(previousLocale);
    const { logger } = await import('@/utils/logger');
    expect(logger.error).toHaveBeenCalledWith('[AppBar] Error switching locale:', fetchError);
    wrapper.unmount();
  });
  it('ignores stale failures from older locale switch requests', async () => {
    const staleFetch = createDeferred<undefined>();
    mockMetadataStore.fetchAllData
      .mockImplementationOnce(() => staleFetch.promise)
      .mockResolvedValueOnce(undefined);
    const wrapper = await mountAppBar();
    const select = wrapper.get('select');
    await select.setValue('de');
    await flushPromises();
    await select.setValue('fr');
    await flushPromises();
    staleFetch.reject(new Error('stale fetch failed'));
    await flushPromises();
    expect(localeRef.value).toBe('fr');
    expect(setLocale.mock.calls.map(([value]) => value)).toEqual(['de', 'fr']);
    expect(mockPreferencesStore.setLocaleOverride.mock.calls.map(([value]) => value)).toEqual([
      'de',
      'fr',
    ]);
    expect(mockMetadataStore.updateLanguageAndGameMode.mock.calls.map(([value]) => value)).toEqual([
      'de',
      'fr',
    ]);
    wrapper.unmount();
  });
});
describe('AppBar account menu', () => {
  beforeEach(() => {
    mockSupabase.user.loggedIn = true;
    mockSupabase.signOut.mockClear();
  });
  it('does not log out when clicking the account trigger button', async () => {
    const wrapper = await mountAppBar();
    const trigger = wrapper.get('button[aria-label="navigation_drawer.account_menu"]');
    await trigger.trigger('click');
    expect(mockSupabase.signOut).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('logs out when selecting the logout menu item', async () => {
    const wrapper = await mountAppBar();
    const logoutMenuItem = wrapper.get('[data-menu-item="navigation_drawer.logout"]');
    await logoutMenuItem.trigger('click');
    await flushPromises();
    expect(mockSupabase.signOut).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
describe('AppBar page title', () => {
  beforeEach(() => {
    routeState.name = 'tasks';
    routeState.params = {};
    mockPreferencesStore.getStreamerMode = false;
    mockSupabase.user.id = '';
    mockSupabase.user.displayName = '';
    mockSupabase.user.loggedIn = false;
    mockSupabase.user.username = '';
    mockTarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    mockTarkovStore.getDisplayName.mockReturnValue('');
    mockTarkovStore.getPvEProgressData.mockReturnValue({ displayName: null });
    mockTarkovStore.getPvPProgressData.mockReturnValue({ displayName: null });
  });
  it('renders profile title with username and route mode for own profile routes', async () => {
    routeState.name = 'profile-userId-mode';
    routeState.params = { mode: 'pve', userId: 'user-1' };
    mockSupabase.user.id = 'user-1';
    mockSupabase.user.username = 'Alpha';
    const wrapper = await mountAppBar();
    expect(wrapper.text()).toContain('Alpha Profile PVE');
    wrapper.unmount();
  });
  it('renders shared profile title from route user id instead of local progress data', async () => {
    routeState.name = 'profile-userId-mode';
    routeState.params = { mode: 'pve', userId: 'shared-user' };
    mockSupabase.user.id = 'viewer-user';
    mockTarkovStore.getDisplayName.mockReturnValue('ViewerDisplay');
    mockTarkovStore.getPvEProgressData.mockReturnValue({ displayName: 'ViewerProgress' });
    const wrapper = await mountAppBar();
    expect(wrapper.text()).toContain('shared-user Profile PVE');
    expect(wrapper.text()).not.toContain('ViewerProgress Profile PVE');
    expect(wrapper.text()).not.toContain('ViewerDisplay Profile PVE');
    wrapper.unmount();
  });
  it('uses non-streamer fallback label for own profile title when no name resolves', async () => {
    routeState.name = 'profile-userId-mode';
    routeState.params = { mode: 'pvp', userId: 'user-1' };
    mockSupabase.user.id = 'user-1';
    const wrapper = await mountAppBar();
    expect(wrapper.text()).toContain('app_bar.user_label Profile PVP');
    expect(wrapper.text()).not.toContain('app_bar.hidden_label Profile PVP');
    wrapper.unmount();
  });
  it('masks own profile title in streamer mode', async () => {
    routeState.name = 'profile-userId-mode';
    routeState.params = { mode: 'pvp', userId: 'user-1' };
    mockPreferencesStore.getStreamerMode = true;
    mockSupabase.user.displayName = 'AccountName';
    mockSupabase.user.id = 'user-1';
    mockSupabase.user.username = 'AccountUsername';
    mockTarkovStore.getDisplayName.mockReturnValue('OwnDisplayName');
    mockTarkovStore.getPvPProgressData.mockReturnValue({ displayName: 'OwnProgressName' });
    const wrapper = await mountAppBar();
    expect(wrapper.text()).toContain('app_bar.hidden_label Profile PVP');
    expect(wrapper.text()).not.toContain('OwnProgressName Profile PVP');
    expect(wrapper.text()).not.toContain('OwnDisplayName Profile PVP');
    expect(wrapper.text()).not.toContain('AccountName Profile PVP');
    expect(wrapper.text()).not.toContain('AccountUsername Profile PVP');
    wrapper.unmount();
  });
});
