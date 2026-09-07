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
  const startInitialSubscription = async () => {
    const nextChannel = { on: vi.fn(), subscribe: vi.fn() };
    nextChannel.on.mockReturnValue(nextChannel);
    nextChannel.subscribe.mockReturnValue(nextChannel);
    mockChannel.mockReturnValue(nextChannel);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { useSupporter } = await import('@/composables/useSupporter');
    const supporter = useSupporter();
    const subscribing = supporter.subscribe('user-1');
    await vi.waitFor(() => expect(nextChannel.subscribe).toHaveBeenCalled());
    return {
      supporter,
      subscribing,
      nextChannel,
      status: nextChannel.subscribe.mock.calls[0]?.[0],
    };
  };
  it('refreshes status after the first join and each rejoin to close the read/join gap', async () => {
    const { supporter, subscribing, status } = await startInitialSubscription();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    const concurrent = supporter.subscribe('user-1');
    status('SUBSCRIBED');
    await expect(concurrent).resolves.toBe(true);
    await expect(subscribing).resolves.toBe(true);
    expect(mockMaybeSingle).toHaveBeenCalledOnce();
    status('SUBSCRIBED');
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
    supporter.unsubscribe();
  });
  it.each([true, false])(
    'settles initialization from a superseding refresh (success: %s)',
    async (success) => {
      const { supporter, subscribing, status, nextChannel } = await startInitialSubscription();
      const initial = createDeferred<{ data: null; error: null }>();
      const replacement = createDeferred<{ data: null; error: { message: string } | null }>();
      mockMaybeSingle.mockReturnValueOnce(initial.promise).mockReturnValueOnce(replacement.promise);
      const settled = vi.fn();
      void subscribing.then(settled);
      status('SUBSCRIBED');
      nextChannel.on.mock.calls[0]?.[2]();
      initial.resolve({ data: null, error: null });
      await initial.promise;
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      replacement.resolve({ data: null, error: success ? null : { message: 'offline' } });
      await expect(subscribing).resolves.toBe(success);
      expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
      supporter.unsubscribe();
    }
  );
  it('reports a successful initial status read despite an unrelated checkout failure', async () => {
    const { supporter, subscribing, status } = await startInitialSubscription();
    const initial = createDeferred<{ data: null; error: null }>();
    mockMaybeSingle.mockReturnValueOnce(initial.promise);
    mockSupabase.client.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    });
    mockFetch.mockRejectedValueOnce(new Error('checkout failed'));
    status('SUBSCRIBED');
    await expect(supporter.createCheckout({ mode: 'payment' })).resolves.toBeNull();
    expect(supporter.error.value).toBe('checkout failed');
    initial.resolve({ data: null, error: null });
    await expect(subscribing).resolves.toBe(true);
    supporter.unsubscribe();
  });
  it('loads once when the initial join fails and ignores disposed channel callbacks', async () => {
    const { supporter, subscribing, nextChannel, status } = await startInitialSubscription();
    status('CHANNEL_ERROR');
    await expect(subscribing).resolves.toBe(true);
    status('TIMED_OUT');
    expect(mockMaybeSingle).toHaveBeenCalledOnce();
    status('SUBSCRIBED');
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
    supporter.unsubscribe();
    status('SUBSCRIBED');
    nextChannel.on.mock.calls[0]?.[2]();
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });
  it('settles an initial read waiter when its session is reset before joining', async () => {
    const { supporter, subscribing } = await startInitialSubscription();
    supporter.reset();
    await expect(subscribing).resolves.toBe(false);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });
  it('reports a failed initial read and retries on the same channel', async () => {
    const nextChannel = { on: vi.fn(), subscribe: vi.fn() };
    nextChannel.on.mockReturnValue(nextChannel);
    nextChannel.subscribe.mockImplementation((callback) => {
      callback('SUBSCRIBED');
      return nextChannel;
    });
    mockChannel.mockReturnValue(nextChannel);
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
      .mockResolvedValue({ data: null, error: null });
    const { useSupporter } = await import('@/composables/useSupporter');
    const supporter = useSupporter();
    await expect(supporter.subscribe('user-1')).resolves.toBe(false);
    await expect(supporter.subscribe('user-1')).resolves.toBe(true);
    await expect(supporter.subscribe('user-1')).resolves.toBe(true);
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
    expect(mockChannel).toHaveBeenCalledOnce();
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
      nextChannel.subscribe.mockImplementation((callback) => {
        callback?.('SUBSCRIBED');
        return nextChannel;
      });
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
