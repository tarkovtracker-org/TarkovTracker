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
const createMetadataStore = () =>
  reactive({
    loading: false,
    hideoutLoading: false,
    updateLanguageAndGameMode: vi.fn(),
    fetchAllData: vi.fn(async () => {}),
    hasCriticalLocaleCache: vi.fn(async () => true),
  });
let mockMetadataStore = createMetadataStore();
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
const appBarWidthRef = ref(1700);
const drawerRailRef = ref(false);
beforeEach(() => {
  appBarWidthRef.value = 1700;
  drawerRailRef.value = false;
  windowWidthRef.value = 1280;
});
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useElementSize: () => ({ width: appBarWidthRef }),
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
vi.mock('@/features/omnibar/AppSearch.vue', () => ({
  default: {
    name: 'AppSearch',
    props: ['shortcutParts', 'keyShortcuts'],
    template:
      '<div data-testid="app-search" :data-shortcut="shortcutParts.join(\'+\')" :data-aria="keyShortcuts" />',
  },
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
    get drawerRail() {
      return drawerRailRef.value;
    },
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
        GlobalHelpLauncher: {
          props: ['open', 'showTrigger', 'reference'],
          template:
            '<div data-testid="global-help-launcher" :data-open="String(open)" :data-direct="String(showTrigger)" :data-anchored="String(Boolean(reference))" />',
        },
        NuxtLink: {
          template: '<a><slot /></a>',
        },
        ProgressSaveStatusIndicator: true,
        SignOutConfirmModal: true,
        UButton: {
          props: ['icon', 'disabled', 'loading'],
          emits: ['click'],
          template:
            '<button :data-icon="icon" :disabled="disabled || undefined" @click="$emit(\'click\')"><slot /></button>',
        },
        UDropdownMenu: {
          props: { items: Array, content: Object, modal: { type: Boolean, default: true } },
          data: () => ({ expandedSubmenu: '', preventedCloseFocus: false }),
          methods: {
            selectItem(
              item: { onSelect?: () => void },
              content?: { onCloseAutoFocus?: (event: Event) => void }
            ) {
              item.onSelect?.();
              const event = new Event('close-auto-focus', { cancelable: true });
              content?.onCloseAutoFocus?.(event);
              return event.defaultPrevented;
            },
          },
          template: `<div data-dropdown-menu :data-modal="String(modal)" :data-prevented-close-focus="String(preventedCloseFocus)"><slot /><template v-for="(group, groupIndex) in (items || [])" :key="groupIndex"><template v-for="item in group" :key="item.label"><button type="button" :disabled="item.disabled" :data-menu-item="item.label" :data-to="item.to" :data-target="item.target" :data-rel="item.rel" :data-checked="item.type === 'checkbox' ? String(Boolean(item.checked)) : undefined" :data-locale-item="item.type === 'checkbox' ? '' : undefined" @click="item.children ? expandedSubmenu = item.label : preventedCloseFocus = selectItem(item, content)">{{ item.label }}</button><div v-if="item.children && expandedSubmenu === item.label" data-submenu><template v-for="(children, childGroupIndex) in item.children" :key="childGroupIndex"><button v-for="child in children" :key="child.label" type="button" :disabled="child.disabled" :data-menu-item="child.label" :data-checked="String(Boolean(child.checked))" @click="child.onSelect?.()">{{ child.label }}</button></template></div></template></template></div>`,
        },
        UIcon: {
          props: ['name'],
          template: '<i :class="name" />',
        },
        UKbd: true,
        UPopover: {
          props: ['open', 'reference'],
          template:
            '<div data-testid="activity-popover" :data-open="String(open)" :data-anchored="String(Boolean(reference))"><slot /><slot name="content" /></div>',
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
    mockMetadataStore = createMetadataStore();
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
    expect(mockMetadataStore.fetchAllData).toHaveBeenCalledWith(false, {
      signal: expect.any(AbortSignal),
    });
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
    expect(logger.error).toHaveBeenCalledWith(
      '[LocaleSwitch] Error switching locale:',
      localeError
    );
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
    expect(mockMetadataStore.fetchAllData).toHaveBeenCalledTimes(2);
    expect(mockPreferencesStore.getLocaleOverride).toBe('en');
    expect(localeRef.value).toBe(previousLocale);
    const { logger } = await import('@/utils/logger');
    expect(logger.error).toHaveBeenCalledWith('[LocaleSwitch] Error switching locale:', fetchError);
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
    expect(trigger.classes()).toContain('size-10');
    wrapper.unmount();
  });
  it('switches language through the mobile More submenu', async () => {
    appBarWidthRef.value = 311;
    windowWidthRef.value = 375;
    const wrapper = await mountAppBar();
    const moreMenu = wrapper
      .findAll('[data-dropdown-menu]')
      .find((menu) => menu.find('button[aria-label="common.more"]').exists());
    expect(moreMenu).toBeDefined();
    await moreMenu!.get('button[aria-label="common.more"]').trigger('click');
    expect(moreMenu!.find('[data-submenu]').exists()).toBe(false);
    await moreMenu!.get('[data-menu-item="settings.locale"]').trigger('click');
    const submenu = moreMenu!.get('[data-submenu]');
    expect(submenu.findAll('button').map((item) => item.text())).toEqual([
      'English',
      'Deutsch',
      'Français',
    ]);
    expect(submenu.get('[data-menu-item="English"]').attributes('data-checked')).toBe('true');
    await submenu.get('[data-menu-item="Deutsch"]').trigger('click');
    await flushPromises();
    expect(setLocale).toHaveBeenCalledWith('de');
    expect(mockPreferencesStore.setLocaleOverride).toHaveBeenCalledWith('de');
    expect(mockMetadataStore.updateLanguageAndGameMode).toHaveBeenCalledWith('de');
    expect(mockMetadataStore.fetchAllData).toHaveBeenCalledWith(false, {
      signal: expect.any(AbortSignal),
    });
    expect(submenu.get('[data-menu-item="Deutsch"]').attributes('data-checked')).toBe('true');
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
    appBarWidthRef.value = 311;
    await flushPromises();
    expect(wrapper.get('[data-menu-item="settings.locale"]').attributes('disabled')).toBeDefined();
    appBarWidthRef.value = 1700;
    await flushPromises();
    for (const item of wrapper.findAll('[data-locale-item]')) {
      expect(item.attributes('disabled')).toBeDefined();
    }
    await chooseLocale(wrapper, 'Français');
    await flushPromises();
    expect(setLocale.mock.calls.map(([value]) => value)).toEqual(['de']);
    pendingFetch.resolve(undefined);
    await flushPromises();
    expect(wrapper.get('[data-testid="app-locale-menu"]').attributes('disabled')).toBeUndefined();
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
  it('moves utilities into More as the app bar narrows', async () => {
    const wrapper = await mountAppBar();
    const localeTrigger = () => wrapper.find('[data-testid="app-locale-menu"]');
    const showThemeItem = () => wrapper.find('[data-menu-item="app_bar.switch_to_light_theme"]');
    const activityTrigger = () => wrapper.find('button[aria-label="common.activity_log"]');
    expect(localeTrigger().exists()).toBe(true);
    expect(showThemeItem().exists()).toBe(false);
    expect(activityTrigger().exists()).toBe(true);
    appBarWidthRef.value = 1200;
    await flushPromises();
    expect(localeTrigger().exists()).toBe(false);
    expect(wrapper.find('[data-menu-item="settings.locale"]').exists()).toBe(true);
    expect(showThemeItem().exists()).toBe(true);
    expect(activityTrigger().exists()).toBe(true);
    appBarWidthRef.value = 311;
    await flushPromises();
    expect(activityTrigger().exists()).toBe(false);
    expect(wrapper.find('[data-menu-item="common.activity_log"]').exists()).toBe(true);
    expect(wrapper.find('[data-menu-item="app_bar.help_community_aria"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('keeps Support and safe community links in More on a wide app bar', async () => {
    const wrapper = await mountAppBar();
    expect(wrapper.get('[data-menu-item="common.support"]').attributes('data-to')).toBe(
      '/supporter'
    );
    const discord = wrapper.get('[data-menu-item="footer.call_to_action.discord"]');
    expect(discord.attributes('data-to')).toBe('https://discord.gg/M8nBgA2sT6');
    expect(discord.attributes('data-target')).toBe('_blank');
    expect(discord.attributes('data-rel')).toContain('noopener');
    const github = wrapper.get('[data-menu-item="footer.call_to_action.github"]');
    expect(github.attributes('data-to')).toBe('https://github.com/tarkovtracker-org/TarkovTracker');
    expect(github.attributes('data-target')).toBe('_blank');
    expect(github.attributes('data-rel')).toContain('noopener');
    wrapper.unmount();
  });
  it('opens activity anchored to More when the activity trigger is hidden', async () => {
    appBarWidthRef.value = 311;
    const wrapper = await mountAppBar();
    const panel = wrapper.get('[data-testid="activity-popover"]');
    expect(panel.attributes('data-open')).toBe('false');
    const item = wrapper.get('[data-menu-item="common.activity_log"]');
    await item.trigger('click');
    expect(
      item.element.closest('[data-dropdown-menu]')?.getAttribute('data-prevented-close-focus')
    ).toBe('true');
    await flushPromises();
    expect(panel.attributes('data-open')).toBe('true');
    expect(panel.attributes('data-anchored')).toBe('true');
    wrapper.unmount();
  });
  it('opens the existing help launcher from More when the help trigger is hidden', async () => {
    appBarWidthRef.value = 1200;
    const wrapper = await mountAppBar();
    const launcher = wrapper.get('[data-testid="global-help-launcher"]');
    expect(launcher.attributes('data-open')).toBe('false');
    const item = wrapper.get('[data-menu-item="app_bar.help_community_aria"]');
    await item.trigger('click');
    expect(
      item.element.closest('[data-dropdown-menu]')?.getAttribute('data-prevented-close-focus')
    ).toBe('true');
    await flushPromises();
    expect(launcher.attributes('data-open')).toBe('true');
    expect(launcher.attributes('data-anchored')).toBe('true');
    wrapper.unmount();
  });
  it('switches Help between the direct icon and More at the toolbar breakpoint', async () => {
    appBarWidthRef.value = 1280;
    const wrapper = await mountAppBar();
    const launcher = wrapper.get('[data-testid="global-help-launcher"]');
    expect(launcher.attributes('data-direct')).toBe('true');
    expect(wrapper.find('[data-menu-item="app_bar.help_community_aria"]').exists()).toBe(false);
    appBarWidthRef.value = 1279;
    await flushPromises();
    expect(launcher.attributes('data-direct')).toBe('false');
    expect(wrapper.find('[data-menu-item="app_bar.help_community_aria"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('uses the current sidebar width as the cap for the right gutter', async () => {
    const wrapper = await mountAppBar();
    const header = wrapper.get('header').element;
    expect(header.style.getPropertyValue('--app-bar-gutter')).toBe('224px');
    drawerRailRef.value = true;
    await flushPromises();
    expect(header.style.getPropertyValue('--app-bar-gutter')).toBe('64px');
    wrapper.unmount();
  });
  it('keeps the supporter link inside More when the badge no longer fits', async () => {
    appBarWidthRef.value = 1200;
    supporterTierRef.value = 'chad';
    const wrapper = await mountAppBar();
    expect(wrapper.find('a[aria-label="app_bar.supporter_badge_aria"]').exists()).toBe(false);
    expect(wrapper.get('[data-menu-item="Chad"]').attributes('data-to')).toBe('/supporter');
    wrapper.unmount();
  });
  it('renders the inline app search with the configured shortcut', async () => {
    const wrapper = await mountAppBar();
    const search = wrapper.find('[data-testid="app-search"]');
    expect(search.attributes('data-shortcut')).toBe('Ctrl+K');
    expect(search.attributes('data-aria')).toBe('Control+K');
    wrapper.unmount();
  });
  it('renders Log In as icon-only on a narrow app bar while keeping its accessible label', async () => {
    const wrapper = await mountAppBar();
    const login = wrapper.find('a[aria-label="app_bar.login_aria"]');
    const classes = (login.attributes('class') || '').split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['w-10', '@min-[561px]:w-auto']));
    const label = login.findAll('span').find((s) => s.text() === 'navigation_drawer.login');
    expect(label?.classes()).toEqual(expect.arrayContaining(['hidden', '@min-[561px]:inline']));
    wrapper.unmount();
  });
  it('gives the bell a 40x40 hit target with aria-label and tooltip', async () => {
    const wrapper = await mountAppBar();
    const bell = wrapper.find('button[aria-label="common.activity_log"]');
    expect(bell.exists()).toBe(true);
    const classAttr = bell.attributes('class') || '';
    expect(classAttr).toContain('size-10');
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
    expect(classAttr).toContain('h-10');
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
  it('renders the account trigger in a non-modal dropdown to preserve page scrolling', async () => {
    const wrapper = await mountAppBar();
    const trigger = wrapper.find('button[aria-label="navigation_drawer.account_menu"]');
    expect(trigger.exists()).toBe(true);
    const classAttr = trigger.attributes('class') || '';
    expect(classAttr).toContain('h-10');
    expect(trigger.find('img').exists()).toBe(true);
    expect(trigger.find('.i-lucide-chevron-down').exists()).toBe(true);
    expect(trigger.element.closest('[data-dropdown-menu]')?.getAttribute('data-modal')).toBe(
      'false'
    );
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
    expect(classAttr).toContain('@min-[1041px]:inline');
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
    const themeBtn = wrapper.find('button[data-icon="i-lucide-sun"]');
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
    const themeBtn = wrapper.find('button[data-icon="i-lucide-moon"]');
    expect(themeBtn.exists()).toBe(true);
    expect(themeBtn.attributes('aria-label')).toBe('app_bar.switch_to_dark_theme');
    await themeBtn.trigger('click');
    expect(mockToggleThemeMode).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('includes the theme toggle in the mobile More dropdown items', async () => {
    appBarWidthRef.value = 311;
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
