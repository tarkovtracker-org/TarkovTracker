import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import AppearanceCard from '@/features/settings/AppearanceCard.vue';
import type { ThemeMode } from '@/utils/theme';
const { mockState, setters } = vi.hoisted(() => ({
  mockState: {
    themeMode: 'dark' as ThemeMode,
  },
  setters: {
    setThemeMode: vi.fn(),
  },
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
};
const mountCard = () =>
  mount(AppearanceCard, {
    global: {
      stubs,
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
describe('AppearanceCard', () => {
  beforeEach(() => {
    mockState.themeMode = 'dark';
    setters.setThemeMode.mockClear();
    pending.value = false;
    status.value = '';
    selectLocale.mockClear();
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
