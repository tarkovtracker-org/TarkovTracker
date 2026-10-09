// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, reactive } from 'vue';
import { resolveSupportBanner } from '@/features/dashboard/supportBanner';
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
  it('keeps past-due billing management separate from projected prepaid access', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
    const scope = effectScope();
    try {
      const { useSupporter } = await import('@/composables/useSupporter');
      const status = scope.run(() => useSupporter())!;
      mockMaybeSingle.mockResolvedValue({
        data: {
          type: 'subscription',
          status: 'past_due',
          tier: 'chad',
          stripe_subscription_id: 'sub_past_due',
          has_ever_supported: true,
          started_at: '2026-01-01T00:00:00Z',
          expires_at: '2026-10-08T00:00:00Z',
          one_time_tier: 'scav',
          one_time_remaining_seconds: 30 * 86400,
        },
        error: null,
      });
      await status.fetchStatus('user-1');
      expect(mockSupabase.client.from).toHaveBeenLastCalledWith('supporters');
      expect(status.supporter.value).toMatchObject({ type: 'one_time', tier: 'scav' });
      expect(status.isActiveSubscriber.value).toBe(false);
      expect(status.isSubscribed.value).toBe(true);
      expect(status.billingSubscription.value).toMatchObject({
        type: 'subscription',
        status: 'past_due',
        tier: 'chad',
        stripeSubscriptionId: 'sub_past_due',
      });
      vi.setSystemTime(new Date('2026-11-08T00:00:00Z'));
      await vi.advanceTimersByTimeAsync(1000);
      expect(status.activeTier.value).toBe('supporter');
      expect(status.isSubscribed.value).toBe(true);
      status.reset();
      expect(status.billingSubscription.value).toBeNull();
      expect(status.isSubscribed.value).toBe(false);
    } finally {
      scope.stop();
      vi.useRealTimers();
    }
  });
  it.each(['expired', 'cancelled'] as const)(
    'allows a new subscription after the recorded subscription is %s',
    async (subscriptionStatus) => {
      const { useSupporter } = await import('@/composables/useSupporter');
      const status = useSupporter();
      mockMaybeSingle.mockResolvedValue({
        data: {
          type: 'subscription',
          status: subscriptionStatus,
          tier: 'chad',
          stripe_subscription_id: 'sub_ended',
          has_ever_supported: true,
          started_at: '2026-01-01T00:00:00Z',
          expires_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      });
      await status.fetchStatus('user-1');
      expect(status.isSubscribed.value).toBe(false);
      expect(status.billingSubscription.value?.stripeSubscriptionId).toBe('sub_ended');
    }
  );
  it('updates the badge tier and active subscription when loaded access expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
    const scope = effectScope();
    try {
      const { useSupporter } = await import('@/composables/useSupporter');
      const status = scope.run(() => useSupporter())!;
      mockMaybeSingle.mockResolvedValue({
        data: {
          status: 'active',
          type: 'subscription',
          tier: 'scav',
          has_ever_supported: true,
          started_at: '2026-01-01T00:00:00Z',
          expires_at: '2026-10-07T00:00:01Z',
        },
        error: null,
      });
      await status.fetchStatus('user-1');
      expect(status.activeTier.value).toBe('scav');
      expect(status.isActiveSubscriber.value).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(status.activeTier.value).toBe('supporter');
      expect(status.isActiveSubscriber.value).toBe(false);
    } finally {
      scope.stop();
      vi.useRealTimers();
    }
  });
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
  it('hides the support banner after a rejected refresh clears a successful status read', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { useSupporter } = await import('@/composables/useSupporter');
    const supporter = useSupporter();
    const banner = () =>
      resolveSupportBanner({
        userId: userState.id,
        loadedUserId: supporter.loadedUserId.value,
        supporter: supporter.supporter.value,
        createdAt: null,
        completedTasks: 20,
        dismissedAt: null,
      });
    await expect(supporter.fetchStatus('user-1')).resolves.toBe(true);
    expect(banner()).toBe('new');
    mockMaybeSingle.mockRejectedValueOnce(new Error('offline'));
    await expect(supporter.fetchStatus('user-1')).resolves.toBe(false);
    expect(supporter.supporter.value).toBeNull();
    expect(supporter.loadedUserId.value).toBeNull();
    expect(banner()).toBeNull();
  });
  it('does not let a stale rejected refresh clear a newer successful status read', async () => {
    const stale = createDeferred<{ data: null; error: null }>();
    mockMaybeSingle.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({
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
    const { useSupporter } = await import('@/composables/useSupporter');
    const supporter = useSupporter();
    const staleRequest = supporter.fetchStatus('user-1');
    await expect(supporter.fetchStatus('user-1')).resolves.toBe(true);
    stale.reject(new Error('offline'));
    await expect(staleRequest).resolves.toBe(false);
    expect(supporter.loadedUserId.value).toBe('user-1');
    expect(supporter.supporter.value?.tier).toBe('chad');
    expect(supporter.error.value).toBeNull();
    expect(supporter.loading.value).toBe(false);
  });
  it('clears the loaded marker when a refresh throws after a successful read', async () => {
    const { supporter, subscribing, status, nextChannel } = await startInitialSubscription();
    status('SUBSCRIBED');
    await expect(subscribing).resolves.toBe(true);
    expect(supporter.loadedUserId.value).toBe('user-1');
    mockMaybeSingle.mockRejectedValueOnce(new Error('offline'));
    nextChannel.on.mock.calls[0]?.[2]();
    await vi.waitFor(() => expect(supporter.loadedUserId.value).toBeNull());
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
