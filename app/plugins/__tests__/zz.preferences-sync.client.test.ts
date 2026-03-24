import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSupabaseSync } from '@/composables/supabase/useSupabaseSync';
import {
  clearPendingResetPreferencesSnapshot,
  getPersistedPreferencesState,
  readPersistedPreferencesSnapshot,
  readPendingResetPreferencesSnapshot,
  resetPreferencesStoreForSessionTransition,
  usePreferencesStore,
} from '@/stores/usePreferences';
import { logger } from '@/utils/logger';
vi.mock('@/composables/supabase/useSupabaseSync', () => ({
  useSupabaseSync: vi.fn(),
}));
vi.mock('@/stores/usePreferences', () => ({
  clearPendingResetPreferencesSnapshot: vi.fn(),
  getPersistedPreferencesState: vi.fn((state) => state),
  readPersistedPreferencesSnapshot: vi.fn(),
  readPendingResetPreferencesSnapshot: vi.fn(),
  resetPreferencesStoreForSessionTransition: vi.fn(),
  usePreferencesStore: vi.fn(),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
// Two awaits intentionally flush microtasks so Vue watch callbacks and queued tasks can run.
const waitForWatchCallback = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const createSyncController = () => ({
  isSyncing: ref(false),
  isPaused: ref(false),
  cleanup: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  syncToSupabase: vi.fn().mockResolvedValue(null),
});
const createPreferencesStore = (state: Record<string, unknown> = {}) => {
  const preferencesStore = {
    $state: { ...state },
    localeOverride: typeof state.localeOverride === 'string' ? state.localeOverride : null,
    replacePersistedState: vi.fn((nextState: Record<string, unknown>) => {
      Object.assign(preferencesStore.$state, nextState);
      if ('localeOverride' in nextState) {
        preferencesStore.localeOverride =
          typeof nextState.localeOverride === 'string' ? nextState.localeOverride : null;
      }
    }),
    resetToDefaults: vi.fn(() => {
      preferencesStore.$state = {};
      preferencesStore.localeOverride = null;
    }),
    setLocaleOverride: vi.fn((locale: string | null) => {
      preferencesStore.localeOverride = locale;
      preferencesStore.$state.localeOverride = locale;
    }),
    setProfileSharePvePublic: vi.fn((value: boolean) => {
      preferencesStore.$state.profileSharePvePublic = value;
    }),
    setProfileSharePvpPublic: vi.fn((value: boolean) => {
      preferencesStore.$state.profileSharePvpPublic = value;
    }),
  };
  return preferencesStore;
};
describe('preferences sync plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('MODE', 'development');
    vi.mocked(readPendingResetPreferencesSnapshot).mockReturnValue(null);
    vi.mocked(readPersistedPreferencesSnapshot).mockReturnValue(null);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('does not start sync after non-PGRST116 bootstrap errors', async () => {
    vi.mocked(useSupabaseSync).mockReturnValue({
      isSyncing: ref(false),
      isPaused: ref(false),
      cleanup: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      syncToSupabase: vi.fn().mockResolvedValue(null),
    });
    const preferencesStore = {
      $state: {},
      localeOverride: 'en',
      replacePersistedState: vi.fn(),
      resetToDefaults: vi.fn(),
      setLocaleOverride: vi.fn(),
      setProfileSharePvePublic: vi.fn(),
      setProfileSharePvpPublic: vi.fn(),
    };
    vi.mocked(usePreferencesStore).mockReturnValue(preferencesStore as never);
    vi.mocked(readPersistedPreferencesSnapshot).mockReturnValue(null);
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST999' },
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const plugin = (await import('@/plugins/zz.preferences-sync.client')).default as (
      nuxtApp: unknown
    ) => unknown;
    plugin({
      $pinia: {},
      $supabase: {
        client: { from },
        user: { id: 'new-user-id', loggedIn: true },
      },
    });
    await waitForWatchCallback();
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(useSupabaseSync).not.toHaveBeenCalled();
    expect(resetPreferencesStoreForSessionTransition).not.toHaveBeenCalled();
    expect(preferencesStore.setProfileSharePvePublic).not.toHaveBeenCalled();
    expect(preferencesStore.setProfileSharePvpPublic).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[PreferencesSyncPlugin] Error loading preferences from Supabase:',
      { code: 'PGRST999' }
    );
  });
  it('does not clear preferences while a stored Supabase session is still hydrating', async () => {
    vi.mocked(useSupabaseSync).mockReturnValue({
      isSyncing: ref(false),
      isPaused: ref(false),
      cleanup: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      syncToSupabase: vi.fn().mockResolvedValue(null),
    });
    vi.stubGlobal('localStorage', { 'sb-test-auth-token': 'token' });
    const preferencesStore = {
      $state: {},
      localeOverride: 'en',
      replacePersistedState: vi.fn(),
      resetToDefaults: vi.fn(),
      setLocaleOverride: vi.fn(),
      setProfileSharePvePublic: vi.fn(),
      setProfileSharePvpPublic: vi.fn(),
    };
    const from = vi.fn();
    vi.mocked(usePreferencesStore).mockReturnValue(preferencesStore as never);
    vi.mocked(readPersistedPreferencesSnapshot).mockReturnValue(null);
    const plugin = (await import('@/plugins/zz.preferences-sync.client')).default as (
      nuxtApp: unknown
    ) => unknown;
    plugin({
      $pinia: {},
      $supabase: {
        client: { from },
        user: { id: null, loggedIn: false },
      },
    });
    await waitForWatchCallback();
    expect(resetPreferencesStoreForSessionTransition).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(useSupabaseSync).not.toHaveBeenCalled();
  });
  it('preserves guest preferences on the initial logged-out bootstrap', async () => {
    const preferencesStore = {
      $state: {
        localeOverride: 'de',
      },
      localeOverride: 'de',
      replacePersistedState: vi.fn(),
      resetToDefaults: vi.fn(),
      setLocaleOverride: vi.fn(),
      setProfileSharePvePublic: vi.fn(),
      setProfileSharePvpPublic: vi.fn(),
    };
    const from = vi.fn();
    vi.mocked(usePreferencesStore).mockReturnValue(preferencesStore as never);
    vi.mocked(readPersistedPreferencesSnapshot).mockReturnValue({
      ownerUserId: null,
      state: {
        localeOverride: 'de',
      },
    });
    const plugin = (await import('@/plugins/zz.preferences-sync.client')).default as (
      nuxtApp: unknown
    ) => unknown;
    plugin({
      $pinia: {},
      $supabase: {
        client: { from },
        user: { id: null, loggedIn: false },
      },
    });
    await waitForWatchCallback();
    expect(resetPreferencesStoreForSessionTransition).not.toHaveBeenCalled();
    expect(preferencesStore.resetToDefaults).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(useSupabaseSync).not.toHaveBeenCalled();
  });
  it('preserves legacy in-memory preferences when auth hydration scopes the session', async () => {
    const cleanup = vi.fn();
    vi.mocked(useSupabaseSync).mockReturnValue({
      isSyncing: ref(false),
      isPaused: ref(false),
      cleanup,
      pause: vi.fn(),
      resume: vi.fn(),
      syncToSupabase: vi.fn().mockResolvedValue(null),
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });
    const preferencesStore = {
      $state: {
        localeOverride: 'de',
        profileSharePvePublic: true,
        profileSharePvpPublic: true,
      },
      localeOverride: 'de',
      replacePersistedState: vi.fn(),
      resetToDefaults: vi.fn(),
      setLocaleOverride: vi.fn(),
      setProfileSharePvePublic: vi.fn(),
      setProfileSharePvpPublic: vi.fn(),
    };
    vi.mocked(usePreferencesStore).mockReturnValue(preferencesStore as never);
    vi.mocked(readPersistedPreferencesSnapshot).mockReturnValue(null);
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
    }));
    const plugin = (await import('@/plugins/zz.preferences-sync.client')).default as (
      nuxtApp: unknown
    ) => unknown;
    plugin({
      $pinia: {},
      $supabase: {
        client: { from },
        user: { id: 'user-1', loggedIn: true },
      },
    });
    await waitForWatchCallback();
    expect(getPersistedPreferencesState).toHaveBeenCalledWith(preferencesStore.$state);
    expect(preferencesStore.replacePersistedState).toHaveBeenCalledWith(preferencesStore.$state);
    expect(preferencesStore.resetToDefaults).not.toHaveBeenCalled();
    expect(preferencesStore.setProfileSharePvePublic).not.toHaveBeenCalled();
    expect(preferencesStore.setProfileSharePvpPublic).not.toHaveBeenCalled();
    expect(useSupabaseSync).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it('prefers the preserved scoped snapshot over guest preferences after logout', async () => {
    const cleanup = vi.fn();
    vi.mocked(useSupabaseSync).mockReturnValue({
      isSyncing: ref(false),
      isPaused: ref(false),
      cleanup,
      pause: vi.fn(),
      resume: vi.fn(),
      syncToSupabase: vi.fn().mockResolvedValue(null),
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });
    const preferencesStore = {
      $state: {
        localeOverride: 'fr',
      },
      localeOverride: 'de',
      replacePersistedState: vi.fn(),
      resetToDefaults: vi.fn(),
      setLocaleOverride: vi.fn(),
      setProfileSharePvePublic: vi.fn(),
      setProfileSharePvpPublic: vi.fn(),
    };
    vi.mocked(usePreferencesStore).mockReturnValue(preferencesStore as never);
    vi.mocked(readPendingResetPreferencesSnapshot).mockReturnValue({
      ownerUserId: 'user-1',
      state: {
        localeOverride: 'de',
      },
    });
    vi.mocked(readPersistedPreferencesSnapshot).mockReturnValue(null);
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
    }));
    const plugin = (await import('@/plugins/zz.preferences-sync.client')).default as (
      nuxtApp: unknown
    ) => unknown;
    plugin({
      $pinia: {},
      $supabase: {
        client: { from },
        user: { id: 'user-1', loggedIn: true },
      },
    });
    await waitForWatchCallback();
    expect(preferencesStore.replacePersistedState).toHaveBeenCalledWith({
      localeOverride: 'de',
    });
    expect(getPersistedPreferencesState).not.toHaveBeenCalled();
    expect(clearPendingResetPreferencesSnapshot).toHaveBeenCalledWith('user-1');
    expect(useSupabaseSync).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it('keeps newer local preferences when the remote row is older and syncs them back', async () => {
    const syncController = createSyncController();
    vi.mocked(useSupabaseSync).mockReturnValue(syncController);
    const preferencesStore = createPreferencesStore({
      localeOverride: 'fr',
      neededItemsHideOwned: false,
    });
    vi.mocked(usePreferencesStore).mockReturnValue(preferencesStore as never);
    vi.mocked(readPersistedPreferencesSnapshot).mockReturnValue({
      ownerUserId: 'user-1',
      persistedAt: Date.parse('2026-03-19T15:52:10.000Z'),
      state: {
        localeOverride: 'de',
        neededItemsHideOwned: true,
      },
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        locale_override: 'fr',
        needed_items_hide_owned: false,
        updated_at: '2026-03-19T15:52:00.000Z',
      },
      error: null,
    });
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
    }));
    const plugin = (await import('@/plugins/zz.preferences-sync.client')).default as (
      nuxtApp: unknown
    ) => unknown;
    plugin({
      $pinia: {},
      $supabase: {
        client: { from },
        user: { id: 'user-1', loggedIn: true },
      },
    });
    await waitForWatchCallback();
    expect(preferencesStore.$state.neededItemsHideOwned).toBe(true);
    expect(preferencesStore.$state.localeOverride).toBe('de');
    expect(syncController.syncToSupabase).toHaveBeenCalledWith(preferencesStore.$state);
  });
  it('keeps newer guest preferences when the remote row is older on first login', async () => {
    const syncController = createSyncController();
    vi.mocked(useSupabaseSync).mockReturnValue(syncController);
    const preferencesStore = createPreferencesStore({
      localeOverride: 'fr',
      neededItemsHideOwned: false,
    });
    vi.mocked(usePreferencesStore).mockReturnValue(preferencesStore as never);
    vi.mocked(readPersistedPreferencesSnapshot).mockImplementation((userId?: string | null) => {
      if (userId === null) {
        return {
          ownerUserId: null,
          persistedAt: Date.parse('2026-03-19T15:52:10.000Z'),
          state: {
            localeOverride: 'de',
            neededItemsHideOwned: true,
          },
        };
      }
      return null;
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        locale_override: 'fr',
        needed_items_hide_owned: false,
        updated_at: '2026-03-19T15:52:00.000Z',
      },
      error: null,
    });
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
    }));
    const plugin = (await import('@/plugins/zz.preferences-sync.client')).default as (
      nuxtApp: unknown
    ) => unknown;
    plugin({
      $pinia: {},
      $supabase: {
        client: { from },
        user: { id: 'user-1', loggedIn: true },
      },
    });
    await waitForWatchCallback();
    expect(preferencesStore.$state.neededItemsHideOwned).toBe(true);
    expect(preferencesStore.$state.localeOverride).toBe('de');
    expect(syncController.syncToSupabase).toHaveBeenCalledWith(preferencesStore.$state);
  });
  it('applies newer remote preferences when the local snapshot is older', async () => {
    const syncController = createSyncController();
    vi.mocked(useSupabaseSync).mockReturnValue(syncController);
    const preferencesStore = createPreferencesStore({
      localeOverride: 'de',
      neededItemsHideOwned: true,
    });
    vi.mocked(usePreferencesStore).mockReturnValue(preferencesStore as never);
    vi.mocked(readPersistedPreferencesSnapshot).mockReturnValue({
      ownerUserId: 'user-1',
      persistedAt: Date.parse('2026-03-19T15:52:00.000Z'),
      state: {
        localeOverride: 'de',
        neededItemsHideOwned: true,
      },
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        locale_override: 'fr',
        needed_items_hide_owned: false,
        updated_at: '2026-03-19T15:52:10.000Z',
      },
      error: null,
    });
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
    }));
    const plugin = (await import('@/plugins/zz.preferences-sync.client')).default as (
      nuxtApp: unknown
    ) => unknown;
    plugin({
      $pinia: {},
      $supabase: {
        client: { from },
        user: { id: 'user-1', loggedIn: true },
      },
    });
    await waitForWatchCallback();
    expect(preferencesStore.$state.neededItemsHideOwned).toBe(false);
    expect(preferencesStore.$state.localeOverride).toBe('fr');
    expect(syncController.syncToSupabase).not.toHaveBeenCalled();
  });
});
