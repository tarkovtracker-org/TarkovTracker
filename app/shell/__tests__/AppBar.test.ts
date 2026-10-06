// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import { createDeferred } from '@/utils/test-helpers';
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
const supporterTierRef = ref<string | null>(null);
const mockUseSupporter = vi.fn(() => ({
  activeTier: supporterTierRef,
}));
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
const mockTarkovStore = {
  getCurrentGameMode: vi.fn(() => 'pvp'),
  getDisplayName: vi.fn(() => ''),
};
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    availableLocales: ['en', 'de', 'fr'],
    locale: localeRef,
    setLocale,
    t: (key: string) => key,
    te: () => false,
  }),
}));
const windowWidthRef = ref(1280);
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useWindowSize: () => ({
    width: windowWidthRef,
  }),
}));
vi.mock('@/composables/useKeybinds', () => ({
  useKeybinds: vi.fn(),
}));
// AppBar loads these through `defineAsyncComponent`. A VTU `stub` replaces what renders but does
// not stop the async loader, so the real ActivityLogPanel still pulls `@nuxt/ui` Badge and the
// generated `virtual:nuxt:...ui/badge.ts` theme module. Under parallel workers that import can
// resolve after this file's environment is torn down, failing the run with
// `EnvironmentTeardownError`. Mocking the modules keeps the loader short of `@nuxt/ui` entirely.
vi.mock('@/shell/ActivityLogPanel.vue', () => ({
  default: { name: 'ActivityLogPanel', template: '<div />' },
}));
vi.mock('@/features/omnibar/Omnibar.vue', () => ({
  default: { name: 'Omnibar', template: '<div />' },
}));
const mockThemeModeRef = ref<'dark' | 'light'>('dark');
const mockIsLightThemeRef = ref(false);
const mockToggleThemeMode = vi.fn();
vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({
    themeMode: mockThemeModeRef,
    isLightTheme: mockIsLightThemeRef,
    setThemeMode: vi.fn(),
    toggleThemeMode: mockToggleThemeMode,
  }),
}));
vi.mock('@/composables/useSupporter', () => ({
  useSupporter: () => mockUseSupporter(),
}));
vi.mock('@/stores/useActivityLogStore', () => ({
  useActivityLogStore: () => ({
    unreadCount: 0,
    hasUnread: false,
    allEntries: [],
    markAllAsRead: vi.fn(),
    clearLog: vi.fn(),
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
mockNuxtImport('useSkillCalculation', () => () => mockSkillCalculation);
mockNuxtImport('useToast', () => () => mockToast);
const mountAppBar = async () => {
  const { default: AppBar } = await import('@/shell/AppBar.vue');
  return mount(AppBar, {
    global: {
      stubs: {
        ActivityLogPanel: true,
        AppTooltip: {
          template: '<span><slot /></span>',
        },
        DiscordIcon: true,
        GlobalHelpLauncher: {
          template: '<div data-testid="global-help-launcher" />',
        },
        NuxtLink: {
          template: '<a><slot /></a>',
        },
        Omnibar: true,
        ProgressSaveStatusIndicator: true,
        SignOutConfirmModal: true,
        UButton: {
          props: ['icon', 'disabled', 'loading'],
          emits: ['click'],
          template:
            '<button :data-icon="icon" :disabled="disabled || undefined" @click="$emit(\'click\')"><slot /></button>',
        },
        UDropdownMenu: {
          props: ['items'],
          template: `<div><slot /><template v-for="(group, groupIndex) in (items || [])" :key="groupIndex"><button v-for="item in group" :key="item.label" type="button" :data-menu-item="item.label" :data-checked="item.type === 'checkbox' ? String(Boolean(item.checked)) : undefined" :data-locale-item="item.type === 'checkbox' ? '' : undefined" @click="item.onSelect?.()">{{ item.label }}</button></template></div>`,
        },
        UIcon: {
          props: ['name'],
          template: '<i :class="name" />',
        },
        UKbd: true,
        UPopover: {
          template: '<div><slot /><slot name="content" /></div>',
        },
      },
    },
  });
};
/** Picks a language from the app bar language menu by its native name. */
const chooseLocale = async (wrapper: Awaited<ReturnType<typeof mountAppBar>>, name: string) => {
  await wrapper.get(`[data-menu-item="${name}"]`).trigger('click');
};
describe('AppBar locale switching', () => {
  beforeEach(async () => {
    windowWidthRef.value = 1280;
    localeRef.value = 'en';
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
    supporterTierRef.value = null;
    mockUseSupporter.mockClear();
    mockTarkovStore.getCurrentGameMode.mockClear();
    mockTarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    mockTarkovStore.getDisplayName.mockClear();
    mockTarkovStore.getDisplayName.mockReturnValue('');
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
    await chooseLocale(wrapper, 'Deutsch');
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
    await chooseLocale(wrapper, 'English');
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
    const localeError = new Error('locale switch failed');
    setLocale.mockRejectedValueOnce(localeError);
    await chooseLocale(wrapper, 'Deutsch');
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
    await chooseLocale(wrapper, 'Deutsch');
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
  it('lists languages by native name and marks the active one', async () => {
    const wrapper = await mountAppBar();
    const items = wrapper.findAll('[data-locale-item]');
    expect(items.map((item) => item.text())).toEqual(['English', 'Deutsch', 'Français']);
    expect(wrapper.get('[data-menu-item="English"]').attributes('data-checked')).toBe('true');
    expect(wrapper.get('[data-menu-item="Deutsch"]').attributes('data-checked')).toBe('false');
    const trigger = wrapper.get('[data-testid="app-locale-menu"]');
    expect(trigger.attributes('aria-label')).toBe('settings.locale: English');
    expect(trigger.classes()).toEqual(expect.arrayContaining(['h-8', 'w-8', 'hidden']));
    wrapper.unmount();
  });
  it('ignores another switch while one is still loading, then allows it', async () => {
    const pendingFetch = createDeferred<undefined>();
    mockMetadataStore.fetchAllData
      .mockImplementationOnce(() => pendingFetch.promise)
      .mockResolvedValueOnce(undefined);
    const wrapper = await mountAppBar();
    await chooseLocale(wrapper, 'Deutsch');
    await flushPromises();
    const trigger = wrapper.get('[data-testid="app-locale-menu"]');
    expect(trigger.attributes('disabled')).toBeDefined();
    await chooseLocale(wrapper, 'Français');
    await flushPromises();
    expect(setLocale.mock.calls.map(([value]) => value)).toEqual(['de']);
    pendingFetch.resolve(undefined);
    await flushPromises();
    expect(trigger.attributes('disabled')).toBeUndefined();
    await chooseLocale(wrapper, 'Français');
    await flushPromises();
    expect(setLocale.mock.calls.map(([value]) => value)).toEqual(['de', 'fr']);
    expect(localeRef.value).toBe('fr');
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
  it('does not include a duplicate account settings menu item', async () => {
    const wrapper = await mountAppBar();
    expect(wrapper.find('[data-menu-item="common.account"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-menu-item="common.settings"]')).toHaveLength(1);
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
  it('asks for confirmation instead of discarding memory-only progress changes', async () => {
    const status = await import('@/stores/tarkov/progressSaveStatus');
    const { useSignOut } = await import('@/composables/useSignOut');
    status.recordLocalSave(false, 'quota');
    status.setCloudSaveStatus({
      state: 'failed',
      failure: 'offline',
      retryAttempt: 3,
      nextRetryAt: null,
    });
    const wrapper = await mountAppBar();
    await wrapper.get('[data-menu-item="navigation_drawer.logout"]').trigger('click');
    await flushPromises();
    expect(mockSupabase.signOut).not.toHaveBeenCalled();
    expect(useSignOut().confirmOpen.value).toBe(true);
    useSignOut().confirmOpen.value = false;
    status.recordLocalSave(true);
    status.resetCloudSaveStatus();
    wrapper.unmount();
  });
  it('signs out without confirmation when pending changes are saved locally', async () => {
    const status = await import('@/stores/tarkov/progressSaveStatus');
    status.recordLocalSave(true);
    status.setCloudSaveStatus({
      state: 'failed',
      failure: 'offline',
      retryAttempt: 3,
      nextRetryAt: null,
    });
    const wrapper = await mountAppBar();
    await wrapper.get('[data-menu-item="navigation_drawer.logout"]').trigger('click');
    await flushPromises();
    expect(mockSupabase.signOut).toHaveBeenCalledTimes(1);
    status.resetCloudSaveStatus();
    wrapper.unmount();
  });
});
describe('AppBar logged out actions', () => {
  beforeEach(() => {
    mockSupabase.user.loggedIn = false;
  });
  it('shows the account login control and no duplicate settings gear when not logged in', async () => {
    const wrapper = await mountAppBar();
    expect(wrapper.find('[aria-label="app_bar.login_aria"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('navigation_drawer.login');
    expect(wrapper.find('[aria-label="common.settings"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
describe('AppBar supporter badge', () => {
  beforeEach(() => {
    supporterTierRef.value = null;
  });
  it('renders the green Support Development CTA when there is no active tier', async () => {
    const wrapper = await mountAppBar();
    expect(wrapper.text()).toContain('common.support');
    expect(wrapper.text()).not.toContain('page.supporter.tier_chad_name');
    wrapper.unmount();
  });
  it('renders the chad tier badge for active chad subscribers', async () => {
    supporterTierRef.value = 'chad';
    const wrapper = await mountAppBar();
    // te() mock returns false, so AppBar falls back to the capitalized tier name
    expect(wrapper.text()).toContain('Chad');
    // The support CTA (v-else branch) is not rendered when a supporter tier is active.
    // The More menu always contains the support label, so we check the CTA link specifically.
    const supportCtaLinks = wrapper.findAll('a').filter((a) => {
      const text = a.text();
      return text.includes('common.support') && !a.attributes('data-menu-item');
    });
    expect(supportCtaLinks.length).toBe(0);
    wrapper.unmount();
  });
  it('falls back to the generic Supporter label for past supporters', async () => {
    supporterTierRef.value = 'supporter';
    const wrapper = await mountAppBar();
    expect(wrapper.text()).toContain('common.supporter');
    wrapper.unmount();
  });
});
describe('AppBar responsive layout', () => {
  beforeEach(() => {
    mockSupabase.user.loggedIn = false;
    supporterTierRef.value = null;
  });
  it('renders the More menu with Language, Support, Discord, and GitHub items', async () => {
    const wrapper = await mountAppBar();
    const moreMenuItems = wrapper.findAll('[data-menu-item]');
    const labels = moreMenuItems.map((el) => el.attributes('data-menu-item'));
    expect(labels).toContain('settings.locale');
    expect(labels).toContain('common.support');
    expect(labels).toContain('footer.call_to_action.discord');
    expect(labels).toContain('footer.call_to_action.github');
    wrapper.unmount();
  });
  it('renders Discord and GitHub as top-level external links with safe rel attributes', async () => {
    const wrapper = await mountAppBar();
    const discord = wrapper.find('a[aria-label="footer.call_to_action.discord"]');
    expect(discord.exists()).toBe(true);
    expect(discord.attributes('href')).toBe('https://discord.gg/M8nBgA2sT6');
    expect(discord.attributes('target')).toBe('_blank');
    expect(discord.attributes('rel')).toContain('noopener');
    const github = wrapper.find('a[aria-label="footer.call_to_action.github"]');
    expect(github.exists()).toBe(true);
    expect(github.attributes('href')).toBe('https://github.com/tarkovtracker-org/TarkovTracker');
    expect(github.attributes('target')).toBe('_blank');
    expect(github.attributes('rel')).toContain('noopener');
    wrapper.unmount();
  });
  it('hides top-level Discord and GitHub links below sm (the More menu covers them)', async () => {
    const wrapper = await mountAppBar();
    for (const label of ['footer.call_to_action.discord', 'footer.call_to_action.github']) {
      const classAttr = wrapper.find(`a[aria-label="${label}"]`).attributes('class') || '';
      expect(classAttr.split(/\s+/)).toContain('hidden');
      expect(classAttr).toContain('sm:inline-flex');
    }
    wrapper.unmount();
  });
  it('collapses the search trigger to a 32x32 icon button below sm', async () => {
    const wrapper = await mountAppBar();
    const search = wrapper.find('button[aria-label="omnibar.open_aria"]');
    expect(search.exists()).toBe(true);
    const classes = (search.attributes('class') || '').split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['h-8', 'w-8', 'shrink-0', 'sm:w-full']));
    const label = search
      .findAll('span')
      .find((s) => s.text() === 'omnibar.trigger_label' && s.findAll('span').length === 0);
    expect(label?.classes()).toEqual(expect.arrayContaining(['hidden', 'sm:inline']));
    wrapper.unmount();
  });
  it('renders Log In as icon-only below sm while keeping its accessible label', async () => {
    const wrapper = await mountAppBar();
    const login = wrapper.find('a[aria-label="app_bar.login_aria"]');
    const classes = (login.attributes('class') || '').split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['w-8', 'sm:w-auto']));
    const label = login.findAll('span').find((s) => s.text() === 'navigation_drawer.login');
    expect(label?.classes()).toEqual(expect.arrayContaining(['hidden', 'sm:inline']));
    wrapper.unmount();
  });
  it('wraps the Support CTA in a hidden sm:inline-flex container for CSS responsive visibility', async () => {
    const wrapper = await mountAppBar();
    const supportWrappers = wrapper.findAll('span.hidden').filter((span) => {
      const classAttr = span.attributes('class') || '';
      return classAttr.includes('sm:inline-flex');
    });
    expect(supportWrappers.length).toBeGreaterThanOrEqual(1);
    wrapper.unmount();
  });
  it('wraps the More menu in a sm:hidden container for CSS responsive visibility', async () => {
    const wrapper = await mountAppBar();
    const moreWrappers = wrapper.findAll('span').filter((span) => {
      const classAttr = span.attributes('class') || '';
      return classAttr.includes('sm:hidden');
    });
    expect(moreWrappers.length).toBe(1);
    wrapper.unmount();
  });
  it('gives the bell a 32x32 hit target with aria-label and tooltip', async () => {
    const wrapper = await mountAppBar();
    const bell = wrapper.find('button[aria-label="common.activity_log"]');
    expect(bell.exists()).toBe(true);
    const classAttr = bell.attributes('class') || '';
    expect(classAttr).toContain('h-8');
    expect(classAttr).toContain('w-8');
    wrapper.unmount();
  });
  it('renders the Log In button with an accessible primary treatment', async () => {
    const wrapper = await mountAppBar();
    const loginLink = wrapper.find('a[aria-label="app_bar.login_aria"]');
    expect(loginLink.exists()).toBe(true);
    const classAttr = loginLink.attributes('class') || '';
    expect(classAttr).toContain('bg-primary-500');
    expect(classAttr).toContain('hover:bg-primary-400');
    expect(classAttr).toContain('text-surface-950');
    expect(classAttr).toContain('h-8');
    wrapper.unmount();
  });
});
describe('AppBar authenticated state', () => {
  beforeEach(() => {
    mockSupabase.user.loggedIn = true;
    mockSupabase.user.id = 'user-1';
    mockSupabase.user.photoURL = '';
    mockSupabase.user.displayName = '';
    mockSupabase.user.username = '';
    mockTarkovStore.getDisplayName.mockReturnValue('');
    mockPreferencesStore.getStreamerMode = false;
  });
  it('renders the account menu trigger with avatar and chevron', async () => {
    const wrapper = await mountAppBar();
    const trigger = wrapper.find('button[aria-label="navigation_drawer.account_menu"]');
    expect(trigger.exists()).toBe(true);
    const classAttr = trigger.attributes('class') || '';
    expect(classAttr).toContain('h-8');
    expect(trigger.find('img').exists()).toBe(true);
    expect(trigger.find('.i-mdi-chevron-down').exists()).toBe(true);
    wrapper.unmount();
  });
  it('truncates long display names and exposes the full name as a tooltip', async () => {
    const displayName = 'A'.repeat(50);
    mockTarkovStore.getDisplayName.mockReturnValue(displayName);
    const wrapper = await mountAppBar();
    const trigger = wrapper.find('button[aria-label="navigation_drawer.account_menu"]');
    const nameSpan = trigger.find('span[data-long-name="true"]');
    expect(nameSpan.exists()).toBe(true);
    const classAttr = nameSpan.attributes('class') || '';
    expect(classAttr).toContain('hidden');
    expect(classAttr).toContain('sm:inline');
    expect(classAttr).toContain('truncate');
    expect(nameSpan.attributes('title')).toBe(displayName);
    wrapper.unmount();
  });
  it('keeps short display names on one line within the fixed-height account button', async () => {
    mockTarkovStore.getDisplayName.mockReturnValue('Short name');
    const wrapper = await mountAppBar();
    const trigger = wrapper.find('button[aria-label="navigation_drawer.account_menu"]');
    const nameSpan = trigger.find('span[data-long-name="false"]');
    expect(nameSpan.exists()).toBe(true);
    expect(nameSpan.attributes('data-long-name')).toBe('false');
    expect(nameSpan.classes()).toContain('truncate');
    expect(nameSpan.classes()).toContain('whitespace-nowrap');
    wrapper.unmount();
  });
  it('keeps a 24-character wide display name on one line', async () => {
    const displayName = 'W'.repeat(24);
    mockTarkovStore.getDisplayName.mockReturnValue(displayName);
    const wrapper = await mountAppBar();
    const trigger = wrapper.find('button[aria-label="navigation_drawer.account_menu"]');
    const nameSpan = trigger.find('span[data-long-name="false"]');
    expect(nameSpan.text()).toBe(displayName);
    expect(nameSpan.classes()).toContain('truncate');
    expect(nameSpan.classes()).toContain('whitespace-nowrap');
    expect(nameSpan.attributes('title')).toBe(displayName);
    wrapper.unmount();
  });
  it('falls back to default avatar when avatar image fails to load', async () => {
    mockSupabase.user.photoURL = 'https://example.com/broken.jpg';
    const wrapper = await mountAppBar();
    const img = wrapper.find('button[aria-label="navigation_drawer.account_menu"] img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/broken.jpg');
    await img.trigger('error');
    await flushPromises();
    expect(img.attributes('src')).toBe('/img/default-avatar.svg');
    wrapper.unmount();
  });
});
describe('AppBar theme toggle', () => {
  beforeEach(() => {
    mockThemeModeRef.value = 'dark';
    mockIsLightThemeRef.value = false;
    mockToggleThemeMode.mockClear();
  });
  it('renders sun icon and switch-to-light label in dark mode and calls toggleThemeMode on click', async () => {
    const wrapper = await mountAppBar();
    const themeBtn = wrapper.find('button[data-icon="i-heroicons-sun"]');
    expect(themeBtn.exists()).toBe(true);
    expect(themeBtn.attributes('aria-label')).toBe('app_bar.switch_to_light_theme');
    await themeBtn.trigger('click');
    expect(mockToggleThemeMode).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('renders moon icon and switch-to-dark label when light mode is active', async () => {
    mockThemeModeRef.value = 'light';
    mockIsLightThemeRef.value = true;
    const wrapper = await mountAppBar();
    const themeBtn = wrapper.find('button[data-icon="i-heroicons-moon"]');
    expect(themeBtn.exists()).toBe(true);
    expect(themeBtn.attributes('aria-label')).toBe('app_bar.switch_to_dark_theme');
    await themeBtn.trigger('click');
    expect(mockToggleThemeMode).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('wraps the header theme button in hidden sm:inline-flex for responsive visibility', async () => {
    const wrapper = await mountAppBar();
    const themeBtn = wrapper.find('button[data-icon="i-heroicons-sun"]');
    expect(themeBtn.classes()).toContain('hidden');
    expect(themeBtn.classes()).toContain('sm:inline-flex');
    wrapper.unmount();
  });
  it('includes the theme toggle in the mobile More dropdown items', async () => {
    const wrapper = await mountAppBar();
    const moreMenuItems = wrapper.findAll('[data-menu-item]');
    const labels = moreMenuItems.map((el) => el.attributes('data-menu-item'));
    expect(labels).toContain('app_bar.switch_to_light_theme');
    const themeItem = wrapper.find('[data-menu-item="app_bar.switch_to_light_theme"]');
    await themeItem.trigger('click');
    expect(mockToggleThemeMode).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
