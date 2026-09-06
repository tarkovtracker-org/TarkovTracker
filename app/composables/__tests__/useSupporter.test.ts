// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const mockFetch = vi.fn();
const mockRemoveChannel = vi.fn();
const mockSupabase = {
  client: {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
    },
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
    vi.stubGlobal('$fetch', mockFetch);
    mockMaybeSingle.mockReset();
    mockChannel.mockReset();
    mockFetch.mockReset();
    mockRemoveChannel.mockReset();
    mockSupabase.client.auth.getSession.mockReset();
    mockSupabase.client.auth.refreshSession.mockReset();
    mockSupabase.client.from.mockClear();
    createdChannels.length = 0;
    const { useSupporter } = await import('@/composables/useSupporter');
    useSupporter().reset();
  });
  it('refreshes status on rejoin without duplicating the initial fetch', async () => {
    const nextChannel = { on: vi.fn(), subscribe: vi.fn() };
    nextChannel.on.mockReturnValue(nextChannel);
    nextChannel.subscribe.mockReturnValue(nextChannel);
    mockChannel.mockReturnValue(nextChannel);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { useSupporter } = await import('@/composables/useSupporter');
    const supporter = useSupporter();
    await supporter.fetchStatus('user-1');
    await supporter.subscribe('user-1');
    mockMaybeSingle.mockClear();
    const status = nextChannel.subscribe.mock.calls[0]?.[0];
    status('SUBSCRIBED');
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    status('SUBSCRIBED');
    expect(mockMaybeSingle).toHaveBeenCalledOnce();
    supporter.unsubscribe();
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
    mockRemoveChannel
      .mockImplementationOnce(() => removalDeferred.promise)
      .mockRejectedValueOnce(new Error('remove failed'));
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
    await Promise.resolve();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
    expect(new Set(mockRemoveChannel.mock.calls.map(([removedChannel]) => removedChannel))).toEqual(
      new Set(createdChannels)
    );
  });
  it('refreshes auth before creating a checkout session when no cached token exists', async () => {
    mockFetch.mockResolvedValue({ url: 'https://checkout.test' });
    mockSupabase.client.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSupabase.client.auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'refreshed-token' } },
      error: null,
    });
    const { useSupporter } = await import('@/composables/useSupporter');
    const supporter = useSupporter();
    await expect(supporter.createCheckout({ mode: 'payment' })).resolves.toBe(
      'https://checkout.test'
    );
    expect(mockFetch).toHaveBeenCalledWith('/api/stripe/checkout', {
      body: { mode: 'payment' },
      headers: { Authorization: 'Bearer refreshed-token' },
      method: 'POST',
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
