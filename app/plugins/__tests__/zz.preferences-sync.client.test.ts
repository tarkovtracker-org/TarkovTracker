import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSupabaseSync } from '@/composables/supabase/useSupabaseSync';
import { usePreferencesStore } from '@/stores/usePreferences';
import { logger } from '@/utils/logger';
vi.mock('@/composables/supabase/useSupabaseSync', () => ({
  useSupabaseSync: vi.fn(),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: vi.fn(),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
// Two awaits intentionally flush microtasks so Vue watch callbacks and queued tasks can run.
const waitForWatchCallback = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
describe('preferences sync plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MODE', 'development');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('does not start sync after non-PGRST116 bootstrap errors', async () => {
    vi.mocked(useSupabaseSync).mockReturnValue({
      isSyncing: ref(false),
      isPaused: ref(false),
      cleanup: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    });
    const preferencesStore = {
      $state: {},
      localeOverride: 'en',
      setLocaleOverride: vi.fn(),
      setProfileSharePvePublic: vi.fn(),
      setProfileSharePvpPublic: vi.fn(),
    };
    vi.mocked(usePreferencesStore).mockReturnValue(preferencesStore as never);
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
    expect(preferencesStore.setProfileSharePvePublic).not.toHaveBeenCalled();
    expect(preferencesStore.setProfileSharePvpPublic).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[PreferencesSyncPlugin] Error loading preferences from Supabase:',
      { code: 'PGRST999' }
    );
  });
});
