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
const createdChannels: Array<{
  name: string;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}> = [];
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();
const mockSupabase = {
  client: {
    channel: mockChannel,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
    removeChannel: mockRemoveChannel,
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
    mockChannel.mockReset();
    mockRemoveChannel.mockReset();
    mockSupabase.client.from.mockClear();
    createdChannels.length = 0;
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
  it('keeps concurrent subscriptions single-channel and removes every created channel', async () => {
    const removalDeferred = createDeferred<string>();
    mockChannel.mockImplementation((name: string) => {
      const nextChannel = {
        name,
        on: vi.fn(),
        subscribe: vi.fn(),
      };
      nextChannel.on.mockReturnValue(nextChannel);
      nextChannel.subscribe.mockReturnValue(nextChannel);
      createdChannels.push(nextChannel);
      return nextChannel;
    });
    mockRemoveChannel.mockImplementationOnce(() => removalDeferred.promise);
    const { useSupporter } = await import('@/composables/useSupporter');
    const supporter = useSupporter();
    userState.id = 'user-0';
    await supporter.subscribe('user-0');
    userState.id = 'user-1';
    const firstSubscription = supporter.subscribe('user-1');
    const secondSubscription = supporter.subscribe('user-1');
    await Promise.resolve();
    await Promise.resolve();
    expect(createdChannels).toHaveLength(2);
    expect(createdChannels.map(({ name }) => name)).toEqual([
      'supporters:user-0',
      'supporters:user-1',
    ]);
    removalDeferred.resolve('ok');
    await Promise.all([firstSubscription, secondSubscription]);
    supporter.unsubscribe();
    await Promise.resolve();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
    expect(new Set(mockRemoveChannel.mock.calls.map(([removedChannel]) => removedChannel))).toEqual(
      new Set(createdChannels)
    );
  });
});
