import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import AppearanceCard from '@/features/settings/AppearanceCard.vue';
const mockPreferencesStore = {
  getThemeMode: 'dark' as 'dark' | 'light',
  setThemeMode: vi.fn(),
};
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      settings: {
        theme: 'Theme',
        interface: {
          appearance: {
            title: 'Appearance',
            description: 'Choose your preferred interface theme.',
            mode: 'Theme mode',
            light: 'Light',
            dark: 'Dark',
          },
        },
      },
    },
  },
});
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
describe('AppearanceCard', () => {
  beforeEach(() => {
    mockPreferencesStore.getThemeMode = 'dark';
    mockPreferencesStore.setThemeMode.mockClear();
  });
  it('renders the current theme mode', () => {
    const wrapper = mount(AppearanceCard, {
      global: {
        plugins: [i18n],
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
        plugins: [i18n],
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
