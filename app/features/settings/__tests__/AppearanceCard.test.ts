import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  });
  it('renders dark and light options in a radiogroup', () => {
    const wrapper = mountCard();
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true);
    const options = wrapper.findAll('[role="radio"]');
    expect(options).toHaveLength(2);
    expect(options[0]!.text()).toContain('settings.appearance.theme_dark');
    expect(options[1]!.text()).toContain('settings.appearance.theme_light');
  });
  it('marks the current mode as checked', () => {
    const wrapper = mountCard();
    const options = wrapper.findAll('[role="radio"]');
    expect(options[0]!.attributes('aria-checked')).toBe('true');
    expect(options[1]!.attributes('aria-checked')).toBe('false');
  });
  it('marks light as checked when light mode is active', () => {
    mockState.themeMode = 'light';
    const wrapper = mountCard();
    const options = wrapper.findAll('[role="radio"]');
    expect(options[0]!.attributes('aria-checked')).toBe('false');
    expect(options[1]!.attributes('aria-checked')).toBe('true');
  });
  it('selects light mode when the light option is clicked', async () => {
    const wrapper = mountCard();
    await wrapper.findAll('[role="radio"]')[1]!.trigger('click');
    expect(setters.setThemeMode).toHaveBeenCalledWith('light');
  });
  it('selects dark mode when the dark option is clicked', async () => {
    mockState.themeMode = 'light';
    const wrapper = mountCard();
    await wrapper.findAll('[role="radio"]')[0]!.trigger('click');
    expect(setters.setThemeMode).toHaveBeenCalledWith('dark');
  });
});
