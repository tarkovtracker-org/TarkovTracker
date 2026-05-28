// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { createDeferred } from '@/utils/test-helpers';
const userState = reactive({
  id: 'user-1',
  loggedIn: true,
});
const mockMaybeSingle = vi.fn();
const mockSupabase = {
  client: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
  },
  user: userState,
};
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: mockSupabase,
}));
describe('useSupporter', () => {
  beforeEach(async () => {
    vi.resetModules();
    userState.id = 'user-1';
    userState.loggedIn = true;
    mockMaybeSingle.mockReset();
    mockSupabase.client.from.mockClear();
    const { useSupporter } = await import('@/composables/useSupporter');
    useSupporter().reset();
  });
  it('does not apply a stale status response after reset', async () => {
    const deferred = createDeferred<{
      data: {
        expires_at: string;
        has_ever_supported: boolean;
        started_at: string;
        status: 'active';
        tier: 'chad';
        type: 'subscription';
      };
      error: null;
    }>();
    mockMaybeSingle.mockReturnValue(deferred.promise);
    const { useSupporter } = await import('@/composables/useSupporter');
    const supporter = useSupporter();
    const fetchPromise = supporter.fetchStatus('user-1');
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
    userState.loggedIn = false;
    userState.id = '';
    supporter.reset();
    deferred.resolve({
      data: {
        expires_at: '2030-01-01T00:00:00.000Z',
        has_ever_supported: true,
        started_at: '2026-01-01T00:00:00.000Z',
        status: 'active',
        tier: 'chad',
        type: 'subscription',
      },
      error: null,
    });
    await fetchPromise;
    expect(supporter.supporter.value).toBeNull();
    expect(supporter.loading.value).toBe(false);
  });
});
