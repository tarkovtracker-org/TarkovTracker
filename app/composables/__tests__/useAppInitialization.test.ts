// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive, ref } from 'vue';
import {
  SYNC_RETRY_DELAY_MS,
  SYNC_RETRY_MAX_ATTEMPTS,
  useAppInitialization,
} from '@/composables/useAppInitialization';
const mockInitializeProgressAuthority = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));
vi.mock('@/stores/tarkov/progressAuthority', async () => {
  const { createProgressPolicyAuthority } = await import('#tests/test-helpers/progressAuthority');
  return {
    ...createProgressPolicyAuthority(),
    initializeProgressAuthority: mockInitializeProgressAuthority,
  };
});
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
  client: { auth: { getSession: vi.fn() } },
};
const mockSupporter = { fetchStatus: vi.fn(), subscribe: vi.fn(), reset: vi.fn() };
vi.mock('@/composables/useSupporter', () => ({ useSupporter: () => mockSupporter }));
const mockInitializeTarkovSync = vi.fn(async () => {});
const mockSettlePendingProgressHandoffs = vi.fn(async () => {});
const mockHasPendingProgressHandoff = vi.fn(() => false);
const mockResetTarkovStoreForSessionTransition = vi.fn();
const mockResetTarkovSync = vi.fn();
const mockPreserveUnsavedSessionProgress = vi.fn();
const mockMayHoldUnsyncedProgress = vi.fn((_userId: string) => true);
const mockMigrateDataIfNeeded = vi.fn(async () => {});
const mockActivityLogResetForSession = vi.fn();
const mockActivityLogMigrateLegacyManualEntries = vi.fn();
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
    migrateLegacyManualEntries: mockActivityLogMigrateLegacyManualEntries,
  }),
}));
vi.mock('@/composables/useToastI18n', () => ({
  useToastI18n: () => ({
    showLoadFailed: mockShowLoadFailed,
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  initializeTarkovSync: () => mockInitializeTarkovSync(),
  hasPendingProgressHandoff: () => mockHasPendingProgressHandoff(),
  settlePendingProgressHandoffs: () => mockSettlePendingProgressHandoffs(),
  mayHoldUnsyncedProgress: (userId: string) => mockMayHoldUnsyncedProgress(userId),
  preserveUnsavedSessionProgress: (...args: unknown[]) =>
    mockPreserveUnsavedSessionProgress(...args),
  resetTarkovStoreForSessionTransition: (...args: unknown[]) =>
    mockResetTarkovStoreForSessionTransition(...args),
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
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(async () => {
    mockSupabase.client.auth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
    mockSupporter.fetchStatus.mockReset().mockResolvedValue(undefined);
    mockSupporter.subscribe.mockReset().mockResolvedValue(true);
    mockSupporter.reset.mockReset();
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
    mockInitializeProgressAuthority.mockReset().mockResolvedValue(undefined);
    mockInitializeTarkovSync.mockClear();
    mockInitializeTarkovSync.mockResolvedValue(undefined);
    mockHasPendingProgressHandoff.mockReset().mockReturnValue(false);
    mockSettlePendingProgressHandoffs.mockReset().mockResolvedValue(undefined);
    mockResetTarkovStoreForSessionTransition.mockClear();
    mockResetTarkovSync.mockClear();
    mockMigrateDataIfNeeded.mockClear();
    mockMigrateDataIfNeeded.mockResolvedValue(undefined);
    mockActivityLogResetForSession.mockClear();
    mockActivityLogMigrateLegacyManualEntries.mockClear();
    mockShowLoadFailed.mockClear();
    const { logger } = await import('@/utils/logger');
    (logger.error as Mock).mockClear();
    mockSupabaseUser.loggedIn = false;
    mockSupabaseUser.id = null;
  });
  it('activates the signed-in owner before starting cloud sync after guest login', async () => {
    const wrapper = await mountWithComposable();
    await flushPromises();
    let finish!: () => void;
    mockInitializeProgressAuthority.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'owner';
    await flushPromises();
    expect(mockInitializeProgressAuthority).toHaveBeenCalledWith(
      'owner',
      false,
      expect.any(Function)
    );
    expect(mockInitializeTarkovSync).not.toHaveBeenCalled();
    finish();
    await flushPromises();
    expect(mockInitializeTarkovSync).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('fences a delayed owner activation when the identity changes', async () => {
    const wrapper = await mountWithComposable();
    await flushPromises();
    let finish!: () => void;
    mockInitializeProgressAuthority.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'a';
    await flushPromises();
    const canContinue = mockInitializeProgressAuthority.mock.calls[0]![2] as () => boolean;
    mockSupabaseUser.id = 'b';
    await flushPromises();
    expect(canContinue()).toBe(false);
    expect(mockInitializeTarkovSync).toHaveBeenCalledOnce();
    finish();
    await flushPromises();
    expect(mockInitializeTarkovSync).toHaveBeenCalledOnce();
    wrapper.unmount();
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
  it('adopts legacy activity for a guest', async () => {
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(mockActivityLogMigrateLegacyManualEntries).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('defers authenticated adoption until sync restores the selected mode', async () => {
    const pending = Promise.withResolvers<undefined>();
    mockInitializeTarkovSync.mockReturnValueOnce(pending.promise);
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-1';
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(mockActivityLogMigrateLegacyManualEntries).not.toHaveBeenCalled();
    pending.resolve(undefined);
    await flushPromises();
    expect(mockActivityLogMigrateLegacyManualEntries).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('waits for a hydrated user id before starting sync and migration', async () => {
    mockSupabaseUser.loggedIn = true;
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(mockActivityLogMigrateLegacyManualEntries).not.toHaveBeenCalled();
    expect(mockInitializeTarkovSync).not.toHaveBeenCalled();
    expect(mockMigrateDataIfNeeded).not.toHaveBeenCalled();
    mockSupabaseUser.id = 'user-1';
    await flushPromises();
    expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(1);
    expect(mockActivityLogMigrateLegacyManualEntries).toHaveBeenCalledTimes(1);
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
    mockInitializeProgressAuthority.mockReset().mockResolvedValue(undefined);
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
  it('settles a pending logout handoff before starting the next login', async () => {
    let release!: () => void;
    const handoff = new Promise<void>((resolve) => {
      release = resolve;
    });
    const wrapper = await mountWithComposable();
    await flushPromises();
    mockHasPendingProgressHandoff.mockReturnValue(true);
    mockSettlePendingProgressHandoffs.mockImplementationOnce(() => handoff);
    mockSupabaseUser.id = 'user-2';
    mockSupabaseUser.loggedIn = true;
    try {
      await flushPromises();
      expect(mockSettlePendingProgressHandoffs).toHaveBeenCalledOnce();
      expect(mockResetTarkovStoreForSessionTransition).not.toHaveBeenCalled();
      expect(mockInitializeTarkovSync).not.toHaveBeenCalled();
    } finally {
      release();
      await flushPromises();
      wrapper.unmount();
    }
    expect(mockInitializeTarkovSync).toHaveBeenCalledOnce();
  });
  it('does not refetch metadata before initialization', async () => {
    mockMetadataStore.hasInitialized = false;
    await mountWithComposable();
    await flushPromises();
    expect(mockMetadataStore.languageCode).toBe('de');
    expect(mockMetadataStore.fetchAllData).not.toHaveBeenCalled();
  });
  it('reports metadata refresh failures after a locale change', async () => {
    mockMetadataStore.fetchAllData.mockRejectedValueOnce(new Error('offline'));
    await mountWithComposable();
    await flushPromises();
    expect(mockShowLoadFailed).toHaveBeenCalledTimes(1);
    expect(localeRef.value).toBe('de');
  });
  it.each(['sync', 'migration'])(
    'reports %s failure and retries on the next login',
    async (step) => {
      const operation = step === 'sync' ? mockInitializeTarkovSync : mockMigrateDataIfNeeded;
      operation.mockRejectedValueOnce(new Error('offline'));
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      await mountWithComposable();
      await flushPromises();
      expect(mockShowLoadFailed).toHaveBeenCalledTimes(1);
      mockSupabaseUser.loggedIn = false;
      await flushPromises();
      mockSupabaseUser.loggedIn = true;
      await flushPromises();
      expect(operation).toHaveBeenCalledTimes(2);
    }
  );
  it('does not continue an old account initialization after a newer account is active', async () => {
    const pending = Promise.withResolvers<undefined>();
    mockInitializeTarkovSync.mockReturnValueOnce(pending.promise);
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-1';
    await mountWithComposable();
    await flushPromises();
    mockSupabaseUser.id = 'user-2';
    await flushPromises();
    pending.resolve(undefined);
    await flushPromises();
    expect(mockActivityLogMigrateLegacyManualEntries).toHaveBeenCalledTimes(1);
    expect(mockMigrateDataIfNeeded).toHaveBeenCalledTimes(1);
    expect(mockSupporter.subscribe).toHaveBeenCalledExactlyOnceWith('user-2');
    expect(mockSupporter.fetchStatus).not.toHaveBeenCalled();
  });
  it('does not resubscribe to a former account when its subscription finishes late', async () => {
    const pending = Promise.withResolvers<boolean>();
    mockSupporter.subscribe.mockReturnValueOnce(pending.promise);
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-1';
    await mountWithComposable();
    await flushPromises();
    mockSupabaseUser.id = 'user-2';
    await flushPromises();
    pending.resolve(false);
    await flushPromises();
    expect(mockSupporter.subscribe.mock.calls.map(([userId]) => userId)).toEqual([
      'user-1',
      'user-2',
    ]);
    expect(mockSupporter.fetchStatus).not.toHaveBeenCalled();
  });
  it('loads supporter status when a same-user relogin cannot recreate its channel', async () => {
    mockSupporter.subscribe.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mockSupporter.fetchStatus.mockResolvedValue(true);
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-1';
    const wrapper = await mountWithComposable();
    await flushPromises();
    expect(mockSupporter.fetchStatus).not.toHaveBeenCalled();
    mockSupabaseUser.loggedIn = false;
    await flushPromises();
    mockSupabaseUser.loggedIn = true;
    await flushPromises();
    expect(mockSupporter.subscribe.mock.calls.map(([userId]) => userId)).toEqual([
      'user-1',
      'user-1',
    ]);
    expect(mockSupporter.fetchStatus).toHaveBeenCalledExactlyOnceWith('user-1');
    expect(mockShowLoadFailed).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('records account activity with the session token after initialization', async () => {
    const fetch = vi.fn().mockResolvedValue({ recorded: true });
    vi.stubGlobal('$fetch', fetch);
    mockSupabase.client.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'fixture-token' } },
    });
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-1';
    await mountWithComposable();
    await flushPromises();
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/account/activity', {
      method: 'POST',
      headers: { Authorization: 'Bearer fixture-token' },
    });
  });
  describe('foreground account activity', () => {
    const foreground = async (visibility = 'visible') => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(
        visibility as DocumentVisibilityState
      );
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
    };
    beforeEach(() => {
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      mockSupabase.client.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'fixture-token' } },
      });
    });
    afterEach(() => vi.restoreAllMocks());
    it('throttles each user for a day and records a returning foreground without timers', async () => {
      const fetch = vi.fn().mockResolvedValue({ recorded: true });
      vi.stubGlobal('$fetch', fetch);
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const wrapper = await mountWithComposable();
      await flushPromises();
      await foreground();
      expect(fetch).toHaveBeenCalledTimes(1);
      now.mockReturnValue(86_401_000);
      await foreground('hidden');
      expect(fetch).toHaveBeenCalledTimes(1);
      await foreground();
      expect(fetch).toHaveBeenCalledTimes(2);
      mockSupabaseUser.id = 'user-2';
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(3);
      mockSupabaseUser.id = 'user-1';
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(3);
      wrapper.unmount();
      now.mockReturnValue(172_801_000);
      await foreground();
      expect(fetch).toHaveBeenCalledTimes(3);
    });
    it('retries failed and unrecorded requests on foreground', async () => {
      const fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ recorded: false })
        .mockResolvedValue({ recorded: true });
      vi.stubGlobal('$fetch', fetch);
      const wrapper = await mountWithComposable();
      await flushPromises();
      await foreground();
      await foreground();
      await foreground();
      expect(fetch).toHaveBeenCalledTimes(3);
      wrapper.unmount();
    });
    it('does not send a stale session token after an account switch', async () => {
      const pending = Promise.withResolvers<{ data: { session: { access_token: string } } }>();
      mockSupabase.client.auth.getSession.mockReturnValueOnce(pending.promise);
      const fetch = vi.fn().mockResolvedValue({ recorded: true });
      vi.stubGlobal('$fetch', fetch);
      const wrapper = await mountWithComposable();
      await flushPromises();
      mockSupabaseUser.id = 'user-2';
      await flushPromises();
      pending.resolve({ data: { session: { access_token: 'stale-token' } } });
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer fixture-token');
      wrapper.unmount();
    });
    it('deduplicates pending requests and cancels session reads after disposal', async () => {
      const pending = Promise.withResolvers<{ data: { session: { access_token: string } } }>();
      mockSupabase.client.auth.getSession.mockReturnValueOnce(pending.promise);
      const fetch = vi.fn();
      vi.stubGlobal('$fetch', fetch);
      const wrapper = await mountWithComposable();
      await flushPromises();
      await foreground();
      expect(mockSupabase.client.auth.getSession).toHaveBeenCalledTimes(1);
      wrapper.unmount();
      pending.resolve({ data: { session: { access_token: 'stale-token' } } });
      await flushPromises();
      expect(fetch).not.toHaveBeenCalled();
    });
  });
  it.each(['throw', 'failed read'])(
    'keeps sync usable when optional supporter status fails: %s',
    async (outcome) => {
      if (outcome === 'throw')
        mockSupporter.subscribe.mockRejectedValue(new Error('supporter offline'));
      else mockSupporter.subscribe.mockResolvedValue(false);
      mockSupabase.client.auth.getSession.mockRejectedValue(new Error('session unavailable'));
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      await mountWithComposable();
      await flushPromises();
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(1);
      expect(mockMigrateDataIfNeeded).toHaveBeenCalledTimes(1);
      expect(mockShowLoadFailed).not.toHaveBeenCalled();
    }
  );
  describe('initial sync retry', () => {
    afterEach(() => {
      vi.useRealTimers();
    });
    it('tears down partial sync state and retries within the same session', async () => {
      vi.useFakeTimers();
      mockInitializeTarkovSync.mockRejectedValueOnce(new Error('offline'));
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      const wrapper = await mountWithComposable();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(1);
      expect(mockResetTarkovSync).toHaveBeenCalledWith('initial sync failed', {
        preserveStorageBaselineForUserId: 'user-1',
      });
      expect(mockActivityLogMigrateLegacyManualEntries).not.toHaveBeenCalled();
      expect(mockShowLoadFailed).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAY_MS);
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(2);
      expect(mockPreserveUnsavedSessionProgress).toHaveBeenCalledWith('user-1');
      expect(mockActivityLogMigrateLegacyManualEntries).toHaveBeenCalledTimes(1);
      expect(mockShowLoadFailed).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAY_MS * 2);
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(2);
      expect(mockResetTarkovSync).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    });
    it('keeps cloud saving visibly unavailable and retryable after initial sync fails', async () => {
      vi.useFakeTimers();
      const { progressSaveStatus, resetCloudSaveStatus, retryCloudSave } =
        await import('@/stores/tarkov/progressSaveStatus');
      resetCloudSaveStatus();
      mockInitializeTarkovSync.mockRejectedValueOnce(new Error('offline'));
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      const wrapper = await mountWithComposable();
      await vi.advanceTimersByTimeAsync(0);
      expect(progressSaveStatus.cloud.state).toBe('failed');
      mockInitializeTarkovSync.mockImplementationOnce(async () => {
        // A successful startup load clears the unavailable status (see initializeTarkovSync).
        resetCloudSaveStatus();
      });
      expect(mockPreserveUnsavedSessionProgress).not.toHaveBeenCalled();
      await expect(retryCloudSave()).resolves.toBe(true);
      expect(mockPreserveUnsavedSessionProgress).toHaveBeenCalledWith('user-1');
      expect(mockPreserveUnsavedSessionProgress.mock.invocationCallOrder[0]).toBeLessThan(
        mockInitializeTarkovSync.mock.invocationCallOrder[1]!
      );
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAY_MS * 2);
      // The manual retry replaced the scheduled one.
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(2);
      wrapper.unmount();
    });
    it('reports a read-only initial sync failure as a load failure, not a failed save', async () => {
      vi.useFakeTimers();
      const { progressSaveStatus, resetCloudSaveStatus } =
        await import('@/stores/tarkov/progressSaveStatus');
      resetCloudSaveStatus();
      mockMayHoldUnsyncedProgress.mockReturnValueOnce(false);
      mockInitializeTarkovSync.mockRejectedValueOnce(new Error('offline'));
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      const wrapper = await mountWithComposable();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockMayHoldUnsyncedProgress).toHaveBeenCalledWith('user-1');
      expect(mockShowLoadFailed).toHaveBeenCalledTimes(1);
      expect(progressSaveStatus.cloud.state).toBe('idle');
      wrapper.unmount();
    });
    it('stops retrying after the bounded number of attempts', async () => {
      vi.useFakeTimers();
      mockInitializeTarkovSync.mockRejectedValue(new Error('offline'));
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      const wrapper = await mountWithComposable();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockShowLoadFailed).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAY_MS * (SYNC_RETRY_MAX_ATTEMPTS + 5));
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(1 + SYNC_RETRY_MAX_ATTEMPTS);
      expect(mockShowLoadFailed).toHaveBeenCalledTimes(2);
      wrapper.unmount();
    });
    it('does not retry after logout cancels the pending retry', async () => {
      vi.useFakeTimers();
      mockInitializeTarkovSync.mockRejectedValue(new Error('offline'));
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      const wrapper = await mountWithComposable();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(1);
      mockSupabaseUser.loggedIn = false;
      mockSupabaseUser.id = null;
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAY_MS * 5);
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    });
    it('does not tear down or retry a former account after switching users', async () => {
      vi.useFakeTimers();
      mockInitializeTarkovSync.mockRejectedValueOnce(new Error('offline'));
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      const wrapper = await mountWithComposable();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(1);
      mockResetTarkovSync.mockClear();
      mockSupabaseUser.id = 'user-2';
      await vi.advanceTimersByTimeAsync(0);
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAY_MS * 5);
      expect(mockInitializeTarkovSync).toHaveBeenCalledTimes(2);
      expect(mockActivityLogMigrateLegacyManualEntries).toHaveBeenCalledTimes(1);
      expect(mockResetTarkovSync).not.toHaveBeenCalled();
      wrapper.unmount();
    });
    it('treats a late superseded initialization failure as cancellation', async () => {
      // Covers the lifecycle-state half of the startup ownership invariant: a
      // former session's pending initialization rejects after the newer session
      // already owns `syncStarted`, and the stale completion must not report
      // active failure or clear the newer run's lifecycle marker.
      const staleInit = Promise.withResolvers<undefined>();
      mockInitializeTarkovSync.mockReturnValueOnce(staleInit.promise);
      mockSupabaseUser.loggedIn = true;
      mockSupabaseUser.id = 'user-1';
      await mountWithComposable();
      await flushPromises();
      mockSupabaseUser.id = 'user-2';
      await flushPromises();
      expect(mockActivityLogMigrateLegacyManualEntries).toHaveBeenCalledTimes(1);
      staleInit.reject(new Error('superseded startup read failed'));
      await flushPromises();
      const { logger } = await import('@/utils/logger');
      expect(logger.error).not.toHaveBeenCalledWith(
        '[useAppInitialization] Error initializing Supabase sync:',
        expect.anything()
      );
      expect(mockResetTarkovSync).not.toHaveBeenCalled();
      expect(mockShowLoadFailed).not.toHaveBeenCalled();
    });
  });
});
