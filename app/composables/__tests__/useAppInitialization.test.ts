// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive, ref } from 'vue';
import { useAppInitialization } from '@/composables/useAppInitialization';
const localeRef = ref('en');
const setLocale = vi.fn(async (value: string) => {
  localeRef.value = value;
});
const mockPreferencesStore = reactive({
  localeOverride: 'de' as string | null,
});
const mockShowLoadFailed = vi.fn();
const mockSupabase = {
  user: {
    loggedIn: false,
    id: null as string | null,
  },
};
const mockInitializeTarkovSync = vi.fn(async () => {});
const mockResetTarkovSync = vi.fn();
const mockMigrateDataIfNeeded = vi.fn(async () => {});
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    availableLocales: ['en', 'de', 'fr'],
    locale: localeRef,
    setLocale,
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
vi.mock('@/composables/useToastI18n', () => ({
  useToastI18n: () => ({
    showLoadFailed: mockShowLoadFailed,
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  initializeTarkovSync: () => mockInitializeTarkovSync(),
  resetTarkovSync: (...args: unknown[]) => mockResetTarkovSync(...args),
  useTarkovStore: () => ({
    migrateDataIfNeeded: () => mockMigrateDataIfNeeded(),
  }),
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: mockSupabase,
}));
const mountWithComposable = async () => {
  const Component = defineComponent({
    setup() {
      useAppInitialization();
      return () => h('div');
    },
  });
  return mount(Component);
};
describe('useAppInitialization locale setup', () => {
  beforeEach(async () => {
    localeRef.value = 'en';
    setLocale.mockClear();
    setLocale.mockImplementation(async (value: string) => {
      localeRef.value = value;
    });
    mockPreferencesStore.localeOverride = 'de';
    mockInitializeTarkovSync.mockClear();
    mockInitializeTarkovSync.mockResolvedValue(undefined);
    mockResetTarkovSync.mockClear();
    mockMigrateDataIfNeeded.mockClear();
    mockMigrateDataIfNeeded.mockResolvedValue(undefined);
    mockShowLoadFailed.mockClear();
    const { logger } = await import('@/utils/logger');
    (logger.error as Mock).mockClear();
    mockSupabase.user.loggedIn = false;
    mockSupabase.user.id = null;
  });
  it('applies locale override through setLocale on mount', async () => {
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(setLocale).toHaveBeenCalledWith('de');
    wrapper.unmount();
  });
  it('skips locale setup when override matches current locale', async () => {
    localeRef.value = 'de';
    mockPreferencesStore.localeOverride = 'de';
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(setLocale).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('logs error and continues when setLocale rejects', async () => {
    const { logger } = await import('@/utils/logger');
    const loggerErrorSpy = vi.spyOn(logger, 'error');
    setLocale.mockRejectedValueOnce(new Error('locale failed'));
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(setLocale).toHaveBeenCalledWith('de');
    expect(loggerErrorSpy).toHaveBeenCalled();
    wrapper.unmount();
    loggerErrorSpy.mockRestore();
  });
  it('skips locale setup when localeOverride is null', async () => {
    mockPreferencesStore.localeOverride = null;
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(setLocale).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('skips locale setup when localeOverride is not a supported locale', async () => {
    mockPreferencesStore.localeOverride = 'xx';
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(setLocale).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('reapplies locale when localeOverride changes after mount', async () => {
    const wrapper = await mountWithComposable();
    await flushPromises();
    setLocale.mockClear();
    mockPreferencesStore.localeOverride = 'fr';
    await flushPromises();
    expect(setLocale).toHaveBeenCalledWith('fr');
    wrapper.unmount();
  });
});
