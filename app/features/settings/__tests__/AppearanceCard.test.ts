import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppearanceCard from '@/features/settings/AppearanceCard.vue';
const mockPreferencesStore = {
  getThemeMode: 'dark' as 'dark' | 'light',
  setThemeMode: vi.fn(),
};
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) =>
      (
        ({
          'settings.interface.appearance.dark': 'Dark',
          'settings.interface.appearance.description': 'Choose your preferred interface theme.',
          'settings.interface.appearance.light': 'Light',
          'settings.interface.appearance.mode': 'Theme mode',
          'settings.interface.appearance.title': 'Appearance',
          'settings.theme': 'Theme',
        }) as const
      )[key] ?? key,
  }),
}));
describe('AppearanceCard', () => {
  beforeEach(() => {
    mockPreferencesStore.getThemeMode = 'dark';
    mockPreferencesStore.setThemeMode.mockClear();
  });
  it('renders the current theme mode', () => {
    const wrapper = mount(AppearanceCard, {
      global: {
        stubs: {
          GenericCard: {
            template: '<div><slot name="content" /></div>',
          },
          SelectMenuFixed: {
            props: ['modelValue', 'items'],
            emits: ['update:modelValue'],
            template:
              '<select data-testid="theme-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="opt in items" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select>',
          },
          UIcon: true,
        },
      },
    });
    const select = wrapper.get('[data-testid="theme-select"]');
    expect((select.element as HTMLSelectElement).value).toBe('dark');
  });
  it('updates theme mode through preferences store', async () => {
    const wrapper = mount(AppearanceCard, {
      global: {
        stubs: {
          GenericCard: {
            template: '<div><slot name="content" /></div>',
          },
          SelectMenuFixed: {
            props: ['modelValue', 'items'],
            emits: ['update:modelValue'],
            template:
              '<select data-testid="theme-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="opt in items" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select>',
          },
          UIcon: true,
        },
      },
    });
    await wrapper.get('[data-testid="theme-select"]').setValue('light');
    expect(mockPreferencesStore.setThemeMode).toHaveBeenCalledWith('light');
  });
});
