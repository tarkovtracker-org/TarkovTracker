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
const mockMetadataStore = reactive({
  fetchAllData: vi.fn(async () => {}),
  hasInitialized: true,
  languageCode: 'en',
  updateLanguageAndGameMode: vi.fn((localeOverride?: string) => {
    if (localeOverride) {
      mockMetadataStore.languageCode = localeOverride === 'uk' ? 'en' : localeOverride;
    }
  }),
});
const mockShowLoadFailed = vi.fn();
const mockSupabaseUser = reactive({
  loggedIn: false,
  id: null as string | null,
});
const mockSupabase = {
  user: mockSupabaseUser,
};
const mockInitializeTarkovSync = vi.fn(async () => {});
const mockResetTarkovStoreForSessionTransition = vi.fn();
const mockMigrateDataIfNeeded = vi.fn(async () => {});
const mockActivityLogResetForSession = vi.fn();
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
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => mockMetadataStore,
}));
vi.mock('@/stores/useActivityLogStore', () => ({
  useActivityLogStore: () => ({
    resetForSession: mockActivityLogResetForSession,
  }),
}));
vi.mock('@/composables/useToastI18n', () => ({
  useToastI18n: () => ({
    showLoadFailed: mockShowLoadFailed,
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  initializeTarkovSync: () => mockInitializeTarkovSync(),
  resetTarkovStoreForSessionTransition: (...args: unknown[]) =>
    mockResetTarkovStoreForSessionTransition(...args),
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
    mockMetadataStore.fetchAllData.mockClear();
    mockMetadataStore.hasInitialized = true;
    mockMetadataStore.languageCode = 'en';
    mockMetadataStore.updateLanguageAndGameMode.mockClear();
    mockMetadataStore.updateLanguageAndGameMode.mockImplementation((localeOverride?: string) => {
      if (localeOverride) {
        mockMetadataStore.languageCode = localeOverride === 'uk' ? 'en' : localeOverride;
      }
    });
    mockInitializeTarkovSync.mockClear();
    mockInitializeTarkovSync.mockResolvedValue(undefined);
    mockResetTarkovStoreForSessionTransition.mockClear();
    mockMigrateDataIfNeeded.mockClear();
    mockMigrateDataIfNeeded.mockResolvedValue(undefined);
    mockActivityLogResetForSession.mockClear();
    mockShowLoadFailed.mockClear();
    const { logger } = await import('@/utils/logger');
    (logger.error as Mock).mockClear();
    mockSupabaseUser.loggedIn = false;
    mockSupabaseUser.id = null;
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
    localeRef.value = 'de';
    mockPreferencesStore.localeOverride = 'de';
    mockMetadataStore.languageCode = 'de';
    const wrapper = await mountWithComposable();
    await flushPromises();
    setLocale.mockClear();
    mockMetadataStore.updateLanguageAndGameMode.mockClear();
    mockMetadataStore.fetchAllData.mockClear();
    mockPreferencesStore.localeOverride = 'fr';
    await flushPromises();
    expect(setLocale).toHaveBeenCalledWith('fr');
    expect(mockMetadataStore.updateLanguageAndGameMode).toHaveBeenCalledWith('fr');
    expect(mockMetadataStore.fetchAllData).toHaveBeenCalledWith(false);
    wrapper.unmount();
  });
  it('waits for a hydrated user id before starting sync and migration', async () => {
    mockSupabaseUser.loggedIn = true;
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(mockInitializeTarkovSync).not.toHaveBeenCalled();
    expect(mockMigrateDataIfNeeded).not.toHaveBeenCalled();
    mockSupabaseUser.id = 'user-1';
    await flushPromises();
    expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(1);
    expect(mockMigrateDataIfNeeded).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('resets in-memory progress after logout', async () => {
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-1';
    const wrapper = await mountWithComposable();
    await flushPromises();
    mockResetTarkovStoreForSessionTransition.mockClear();
    mockSupabaseUser.loggedIn = false;
    mockSupabaseUser.id = null;
    await flushPromises();
    expect(mockResetTarkovStoreForSessionTransition).toHaveBeenCalledWith('user-1', 'logout');
    expect(mockActivityLogResetForSession).toHaveBeenCalled();
    wrapper.unmount();
  });
  it('preserves the previous user snapshot before resetting on account switch', async () => {
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-1';
    const wrapper = await mountWithComposable();
    await flushPromises();
    mockResetTarkovStoreForSessionTransition.mockClear();
    mockInitializeTarkovSync.mockClear();
    mockMigrateDataIfNeeded.mockClear();
    mockSupabaseUser.id = 'user-2';
    await flushPromises();
    expect(mockResetTarkovStoreForSessionTransition).toHaveBeenCalledWith(
      'user-1',
      'user switched'
    );
    expect(mockActivityLogResetForSession).toHaveBeenCalled();
    expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(1);
    expect(mockMigrateDataIfNeeded).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
