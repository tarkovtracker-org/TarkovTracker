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
mockNuxtImport('useRoute', () => () => ({
  ...routeState,
}));
mockNuxtImport('useSkillCalculation', () => () => mockSkillCalculation);
mockNuxtImport('useToast', () => () => mockToast);
const SelectMenuFixedStub = {
  props: ['items', 'modelValue'],
  emits: ['update:modelValue'],
  template:
    '<label data-testid="select-menu-fixed"><slot name="leading" /><select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in (items || [])" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>',
};
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
        SelectMenuFixed: SelectMenuFixedStub,
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
describe('AppBar locale switching', () => {
  beforeEach(async () => {
    windowWidthRef.value = 1280;
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
    supporterTierRef.value = null;
    mockUseSupporter.mockClear();
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
  it('does not include a duplicate account settings menu item', async () => {
    const wrapper = await mountAppBar();
    expect(wrapper.find('[data-menu-item="settings.tabs.account"]').exists()).toBe(false);
    expect(wrapper.find('[data-menu-item="navigation_drawer.settings"]').exists()).toBe(true);
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
describe('AppBar logged out actions', () => {
  beforeEach(() => {
    mockSupabase.user.loggedIn = false;
  });
  it('shows the account login control and no duplicate settings gear when not logged in', async () => {
    const wrapper = await mountAppBar();
    expect(wrapper.find('[aria-label="app_bar.login_aria"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('navigation_drawer.login');
    expect(wrapper.find('[aria-label="navigation_drawer.settings"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
describe('AppBar supporter badge', () => {
  beforeEach(() => {
    supporterTierRef.value = null;
  });
  it('renders the green Support Development CTA when there is no active tier', async () => {
    const wrapper = await mountAppBar();
    expect(wrapper.text()).toContain('footer.support_button');
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
      return text.includes('footer.support_button') && !a.attributes('data-menu-item');
    });
    expect(supportCtaLinks.length).toBe(0);
    wrapper.unmount();
  });
  it('falls back to the generic Supporter label for past supporters', async () => {
    supporterTierRef.value = 'supporter';
    const wrapper = await mountAppBar();
    expect(wrapper.text()).toContain('app_bar.supporter_badge_label');
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
    expect(labels).toContain('footer.support_button');
    expect(labels).toContain('footer.call_to_action.discord');
    expect(labels).toContain('footer.call_to_action.github');
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
  it('gives the bell a 36x36 hit target with aria-label and tooltip', async () => {
    const wrapper = await mountAppBar();
    const bell = wrapper.find('button[aria-label="activity_log.aria_label"]');
    expect(bell.exists()).toBe(true);
    const classAttr = bell.attributes('class') || '';
    expect(classAttr).toContain('h-9');
    expect(classAttr).toContain('w-9');
    wrapper.unmount();
  });
  it('renders the Log In button with a filled primary background', async () => {
    const wrapper = await mountAppBar();
    const loginLink = wrapper.find('a[aria-label="app_bar.login_aria"]');
    expect(loginLink.exists()).toBe(true);
    const classAttr = loginLink.attributes('class') || '';
    expect(classAttr).toContain('bg-primary-600');
    expect(classAttr).toContain('h-9');
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
    expect(classAttr).toContain('h-9');
    expect(trigger.find('img').exists()).toBe(true);
    expect(trigger.find('.i-mdi-chevron-down').exists()).toBe(true);
    wrapper.unmount();
  });
  it('truncates the display name with sm:inline and truncate class', async () => {
    mockTarkovStore.getDisplayName.mockReturnValue('A'.repeat(50));
    const wrapper = await mountAppBar();
    const trigger = wrapper.find('button[aria-label="navigation_drawer.account_menu"]');
    const nameSpan = trigger.find('span.truncate');
    expect(nameSpan.exists()).toBe(true);
    const classAttr = nameSpan.attributes('class') || '';
    expect(classAttr).toContain('hidden');
    expect(classAttr).toContain('sm:inline');
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
