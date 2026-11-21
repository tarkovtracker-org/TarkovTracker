// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import AppPreferencesCard from '@/features/settings/AppPreferencesCard.vue';
import type { ThemeMode } from '@/utils/theme';
const { mockState, setters } = vi.hoisted(() => ({
  mockState: {
    themeMode: 'dark' as ThemeMode,
  },
  setters: {
    setThemeMode: vi.fn(),
    setStreamerMode: vi.fn(),
    setWikiUseAntifandom: vi.fn(),
  },
}));
const loggedIn = ref(false);
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: {
      get loggedIn() {
        return loggedIn.value;
      },
    },
  },
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    getStreamerMode: false,
    getWikiUseAntifandom: true,
    setStreamerMode: setters.setStreamerMode,
    setWikiUseAntifandom: setters.setWikiUseAntifandom,
  }),
}));
vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({
    themeMode: mockState.themeMode,
    isLightTheme: mockState.themeMode === 'light',
    setThemeMode: setters.setThemeMode,
    toggleThemeMode: vi.fn(),
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const pending = ref(false);
const status = ref('');
const selectLocale = vi.fn();
vi.mock('@/composables/useLocaleSwitch', () => ({
  useLocaleSwitch: () => ({
    locale: ref('en'),
    availableLocales: ['en', 'de'],
    pending,
    status,
    isDisabled: (code: string) => pending.value || (code === 'de' && status.value !== ''),
    selectLocale,
  }),
}));
const stubs = {
  GenericCard: {
    template: '<section><h2>{{ title }}</h2><slot name="content" /></section>',
    props: ['title', 'icon', 'iconColor', 'highlightColor', 'fillHeight', 'titleClasses'],
  },
  UIcon: { template: '<span />', props: ['name'] },
  USeparator: true,
  USwitch: {
    template: `<button type="button" role="switch" :aria-checked="modelValue" :disabled="disabled" @click="$emit('update:modelValue', !modelValue)" />`,
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
  },
};
const mountCard = () =>
  mount(AppPreferencesCard, {
    global: {
      stubs,
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
describe('AppPreferencesCard', () => {
  beforeEach(() => {
    mockState.themeMode = 'dark';
    vi.clearAllMocks();
    loggedIn.value = false;
    pending.value = false;
    status.value = '';
  });
  it('renders the theme, language, and both switches inside App Preferences', () => {
    const wrapper = mountCard();
    const card = wrapper.get('section');
    expect(card.get('h2').text()).toBe('settings.app_preferences.title');
    expect(card.find('fieldset').exists()).toBe(true);
    expect(card.find('select').exists()).toBe(true);
    expect(card.findAll('[role="switch"]')).toHaveLength(2);
  });
  it('keeps privacy mode disabled for guests and lets them change the wiki preference', async () => {
    const wrapper = mountCard();
    const privacy = wrapper.get<HTMLButtonElement>(
      'button[aria-labelledby="settings-privacy-mode-label"]'
    );
    const wiki = wrapper.get<HTMLButtonElement>(
      'button[aria-labelledby="settings-antifandom-label"]'
    );
    expect(privacy.element.disabled).toBe(true);
    await wiki.trigger('click');
    expect(setters.setWikiUseAntifandom).toHaveBeenCalledWith(false);
  });
  it('lets signed-in users toggle privacy mode and preserves the cooldown', async () => {
    loggedIn.value = true;
    const wrapper = mountCard();
    try {
      vi.useFakeTimers();
      const privacy = wrapper.get<HTMLButtonElement>(
        'button[aria-labelledby="settings-privacy-mode-label"]'
      );
      expect(privacy.element.disabled).toBe(false);
      await privacy.trigger('click');
      expect(setters.setStreamerMode).toHaveBeenCalledWith(true);
      expect(privacy.element.disabled).toBe(true);
      await vi.advanceTimersByTimeAsync(499);
      expect(privacy.element.disabled).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(privacy.element.disabled).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
  it('renders dark and light options in a fieldset', () => {
    const wrapper = mountCard();
    expect(wrapper.find('fieldset').exists()).toBe(true);
    const options = wrapper.findAll('input[type="radio"]');
    expect(options).toHaveLength(2);
    expect(wrapper.text()).toContain('settings.appearance.theme_dark');
    expect(wrapper.text()).toContain('settings.appearance.theme_light');
  });
  it('stacks the selector below the copy on mobile without shrinking the controls', () => {
    const wrapper = mountCard();
    const fieldset = wrapper.get('fieldset');
    expect(fieldset.classes()).toContain('shrink-0');
    const layoutClasses = fieldset.element.parentElement!.classList;
    expect(layoutClasses.contains('flex-col')).toBe(true);
    expect(layoutClasses.contains('sm:flex-row')).toBe(true);
  });
  it('uses a separate offset focus outline without replacing the selection ring', () => {
    const wrapper = mountCard();
    const labels = wrapper.findAll('fieldset label');
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.classes()).toContain('focus-within:outline-2');
      expect(label.classes()).toContain('focus-within:outline-offset-2');
      expect(label.classes()).toContain('light:focus-within:outline-surface-50');
      expect(label.classes()).not.toContain('focus-within:ring-primary-500');
    }
  });
  it('marks the current mode as checked', () => {
    const wrapper = mountCard();
    const options = wrapper.findAll('input[type="radio"]');
    expect((options[0]!.element as HTMLInputElement).checked).toBe(true);
    expect(options[0]!.element.closest('label')!.classList.contains('light:ring-surface-300')).toBe(
      true
    );
    expect((options[1]!.element as HTMLInputElement).checked).toBe(false);
  });
  it('marks light as checked when light mode is active', () => {
    mockState.themeMode = 'light';
    const wrapper = mountCard();
    const options = wrapper.findAll('input[type="radio"]');
    expect((options[0]!.element as HTMLInputElement).checked).toBe(false);
    expect((options[1]!.element as HTMLInputElement).checked).toBe(true);
  });
  it('selects light mode when the light option is changed', async () => {
    const wrapper = mountCard();
    await wrapper.findAll('input[type="radio"]')[1]!.trigger('change');
    expect(setters.setThemeMode).toHaveBeenCalledWith('light');
  });
  it('selects dark mode when the dark option is changed', async () => {
    mockState.themeMode = 'light';
    const wrapper = mountCard();
    await wrapper.findAll('input[type="radio"]')[0]!.trigger('change');
    expect(setters.setThemeMode).toHaveBeenCalledWith('dark');
  });
  it('renders native language options and uses the shared locale action', async () => {
    const wrapper = mountCard();
    expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
      'English',
      'Deutsch',
    ]);
    await wrapper.get('select').setValue('de');
    expect(selectLocale).toHaveBeenCalledWith('de');
  });
  it('restores the active language when a selection does not change the locale', async () => {
    const wrapper = mountCard();
    await wrapper.get('select').setValue('de');
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('en');
  });
  it('disables the selector while loading and exposes shared feedback', async () => {
    pending.value = true;
    status.value = 'Loading language';
    const wrapper = mountCard();
    expect(wrapper.get('select').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[role="status"]').text()).toBe('Loading language');
    pending.value = false;
    status.value = 'Wait 10s';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('select').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('option[value="de"]').attributes('disabled')).toBeDefined();
  });
});
