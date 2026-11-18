// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import {
  installRealtimeVisibility,
  isRealtimeSuspended,
  subscribeRealtimeChannel,
} from '@/utils/realtimeVisibility';
import type { SupabaseRealtimeChannel } from '@/utils/realtimeChannel';
const session = (accessToken: string) => ({ accessToken, isCurrent: () => true });
const setup = () => {
  const page = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  page.visibilityState = 'visible';
  const transport = {
    connect: vi.fn(),
    disconnect: vi.fn(async () => 'ok' as const),
    getChannels: vi.fn(() => [{}]),
    setAuth: vi.fn(async (_token: string) => {}),
  };
  const readSession = vi
    .fn<Parameters<typeof installRealtimeVisibility>[1]>()
    .mockResolvedValue(session('user-token'));
  const connect = transport.connect;
  const dispose = installRealtimeVisibility(
    transport as unknown as Parameters<typeof installRealtimeVisibility>[0],
    readSession,
    page
  );
  const visibility = (state: DocumentVisibilityState) => {
    page.visibilityState = state;
    page.dispatchEvent(new Event('visibilitychange'));
  };
  return { page, transport, connect, dispose, visibility, readSession };
};
afterEach(() => vi.useRealTimers());
describe('Realtime background transport', () => {
  it('disconnects after 60 seconds, blocks joins while hidden and reconnects once', async () => {
    vi.useFakeTimers();
    const { transport, connect, dispose, visibility } = setup();
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(transport.disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
    transport.connect();
    expect(connect).not.toHaveBeenCalled();
    visibility('visible');
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledTimes(1);
    dispose();
  });
  it('recovers visibility after a failed disconnect without leaving an unhandled rejection', async () => {
    vi.useFakeTimers();
    const { transport, connect, dispose, visibility } = setup();
    let rejectLeave!: (reason: Error) => void;
    transport.disconnect.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectLeave = reject;
        })
    );
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    visibility('visible');
    rejectLeave(new Error('socket close failed'));
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledOnce();
    expect(
      isRealtimeSuspended(transport as unknown as Parameters<typeof isRealtimeSuspended>[0])
    ).toBe(false);
    dispose();
  });
  it('cancels brief hides and does not open a socket with no channels', async () => {
    vi.useFakeTimers();
    const { transport, connect, dispose, visibility } = setup();
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(30_000);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport.disconnect).not.toHaveBeenCalled();
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    transport.getChannels.mockReturnValue([]);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).not.toHaveBeenCalled();
    dispose();
  });
  it('waits for an outstanding disconnect and honors a second hide', async () => {
    vi.useFakeTimers();
    const { transport, connect, dispose, visibility } = setup();
    let finish!: () => void;
    transport.disconnect.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve('ok');
        })
    );
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    visibility('visible');
    transport.connect();
    expect(connect).not.toHaveBeenCalled();
    visibility('hidden');
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).not.toHaveBeenCalled();
    expect(
      isRealtimeSuspended(transport as unknown as Parameters<typeof isRealtimeSuspended>[0])
    ).toBe(true);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledTimes(1);
    dispose();
  });
  it('keeps the socket closed without a session and retries once auth is available', async () => {
    vi.useFakeTimers();
    const { transport, readSession, connect, dispose, visibility } = setup();
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    readSession.mockResolvedValueOnce(null);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connect).not.toHaveBeenCalled();
    expect(transport.setAuth).not.toHaveBeenCalled();
    expect(readSession).toHaveBeenCalledOnce();
    transport.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.setAuth).toHaveBeenCalledWith('user-token');
    expect(connect).toHaveBeenCalledOnce();
    dispose();
  });
  it('ignores an auth read that finishes after the tab is hidden again', async () => {
    vi.useFakeTimers();
    const { transport, readSession, connect, dispose, visibility } = setup();
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    const staleRead = Promise.withResolvers<ReturnType<typeof session>>();
    readSession.mockReturnValueOnce(staleRead.promise);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    visibility('hidden');
    staleRead.resolve(session('stale-token'));
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.setAuth).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.setAuth).toHaveBeenCalledExactlyOnceWith('user-token');
    expect(connect).toHaveBeenCalledOnce();
    dispose();
  });
  it('does not reopen the socket when the session ends during token installation', async () => {
    vi.useFakeTimers();
    const { transport, readSession, connect, dispose, visibility } = setup();
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    const installation = Promise.withResolvers<undefined>();
    const isCurrent = vi.fn().mockReturnValue(true);
    readSession.mockResolvedValue({ accessToken: 'user-token', isCurrent });
    transport.setAuth.mockReturnValueOnce(installation.promise);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.setAuth).toHaveBeenCalledOnce();
    isCurrent.mockReturnValue(false);
    installation.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).not.toHaveBeenCalled();
    dispose();
  });
  it('retries if credentials arrive while an earlier session read is pending', async () => {
    vi.useFakeTimers();
    const { transport, readSession, connect, dispose, visibility } = setup();
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    const pending = Promise.withResolvers<null>();
    readSession.mockReturnValueOnce(pending.promise);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    transport.connect();
    pending.resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.setAuth).toHaveBeenCalledExactlyOnceWith('user-token');
    expect(connect).toHaveBeenCalledOnce();
    dispose();
  });
  it('retries a failed session read once and resumes after connectivity returns', async () => {
    vi.useFakeTimers();
    const { readSession, connect, dispose, visibility } = setup();
    try {
      visibility('hidden');
      await vi.advanceTimersByTimeAsync(60_000);
      readSession
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(new Error('still offline'));
      visibility('visible');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(readSession).toHaveBeenCalledTimes(2);
      expect(connect).not.toHaveBeenCalled();
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      expect(connect).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });
  it('keeps queued joins after a failed socket open and isolates an individual join failure', async () => {
    vi.useFakeTimers();
    const { transport, connect, dispose, visibility } = setup();
    const asTransport = transport as unknown as Parameters<typeof installRealtimeVisibility>[0];
    const failed = {
      subscribe: vi.fn(() => {
        throw new Error('join failed');
      }),
    };
    const healthy = { subscribe: vi.fn() };
    const onFailure = vi.fn();
    transport.getChannels.mockReturnValue([failed, healthy]);
    try {
      visibility('hidden');
      await vi.advanceTimersByTimeAsync(60_000);
      subscribeRealtimeChannel(
        asTransport,
        failed as unknown as SupabaseRealtimeChannel,
        onFailure
      );
      subscribeRealtimeChannel(asTransport, healthy as unknown as SupabaseRealtimeChannel);
      connect.mockImplementationOnce(() => {
        throw new Error('socket failed');
      });
      visibility('visible');
      await vi.advanceTimersByTimeAsync(0);
      expect(isRealtimeSuspended(asTransport)).toBe(true);
      expect(failed.subscribe).not.toHaveBeenCalled();
      transport.connect();
      await vi.advanceTimersByTimeAsync(0);
      expect(onFailure).toHaveBeenCalledWith('CLOSED', new Error('join failed'));
      expect(healthy.subscribe).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });
});
const fakeRealtimeSockets = () => {
  const sockets: FakeSocket[] = [];
  const joinTokens: Array<string | undefined> = [];
  class FakeSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    bufferedAmount = 0;
    onopen = (_event: unknown) => {};
    onclose = (_event: unknown) => {};
    onerror = (_event: unknown) => {};
    onmessage = (_event: unknown) => {};
    constructor(_url: string) {
      sockets.push(this);
      setTimeout(() => {
        this.readyState = 1;
        this.onopen({});
      }, 0);
    }
    send(data: string) {
      const parsed = JSON.parse(data);
      const message = Array.isArray(parsed)
        ? {
            join_ref: parsed[0],
            ref: parsed[1],
            topic: parsed[2],
            event: parsed[3],
            payload: parsed[4],
          }
        : parsed;
      if (message.event === 'phx_join') joinTokens.push(message.payload.access_token);
      if (message.event === 'phx_join' || message.event === 'heartbeat') {
        const payload = { status: 'ok', response: { postgres_changes: [] } };
        const reply = Array.isArray(parsed)
          ? [message.join_ref, message.ref, message.topic, 'phx_reply', payload]
          : { ...message, event: 'phx_reply', payload };
        setTimeout(() => this.onmessage({ data: JSON.stringify(reply) }), 0);
      }
    }
    close() {
      this.readyState = 3;
      this.onclose({ code: 1000 });
    }
  }
  return { sockets, joinTokens, transport: FakeSocket as unknown as typeof WebSocket };
};
it('retains and rejoins actual SDK channels after the background socket closes', async () => {
  vi.useFakeTimers();
  const { createClient } = await import('@supabase/supabase-js');
  const { sockets, transport } = fakeRealtimeSockets();
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport },
  });
  const page = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  page.visibilityState = 'visible';
  const dispose = installRealtimeVisibility(client.realtime, async () => session('test-key'), page);
  const statuses = vi.fn();
  client.channel('test').subscribe(statuses);
  await vi.advanceTimersByTimeAsync(20);
  expect(statuses.mock.calls.some(([status]) => status === 'SUBSCRIBED')).toBe(true);
  page.visibilityState = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60_020);
  expect(sockets.every((socket) => socket.readyState === 3)).toBe(true);
  expect(client.getChannels()).toHaveLength(1);
  const newChannelStatus = vi.fn();
  subscribeRealtimeChannel(
    client.realtime,
    client.channel('created-while-hidden'),
    newChannelStatus
  );
  await vi.advanceTimersByTimeAsync(30_000);
  expect(sockets).toHaveLength(1);
  page.visibilityState = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(20);
  expect(sockets).toHaveLength(2);
  expect(statuses.mock.calls.filter(([status]) => status === 'SUBSCRIBED')).toHaveLength(2);
  expect(newChannelStatus).toHaveBeenCalledWith('SUBSCRIBED');
  dispose();
  await client.realtime.disconnect();
});
it('rejoins with the refreshed user token when the socket opens before auth would resolve', async () => {
  vi.useFakeTimers();
  const { createClient } = await import('@supabase/supabase-js');
  const { joinTokens, transport } = fakeRealtimeSockets();
  const client = createClient('https://reconnect-test.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport },
  });
  const getSession = vi.spyOn(client.auth, 'getSession');
  type SessionRead = Awaited<ReturnType<typeof client.auth.getSession>>;
  const sessionRead = (token: string): SessionRead => ({
    data: {
      session: {
        access_token: token,
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: 'owner',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: '',
        },
      },
    },
    error: null,
  });
  getSession.mockResolvedValue(sessionRead('initial-user-token'));
  const page = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  const visibility = (state: DocumentVisibilityState) => {
    page.visibilityState = state;
    page.dispatchEvent(new Event('visibilitychange'));
  };
  page.visibilityState = 'visible';
  const dispose = installRealtimeVisibility(
    client.realtime,
    async () => {
      const accessToken = (await client.auth.getSession()).data.session?.access_token;
      return accessToken ? session(accessToken) : null;
    },
    page
  );
  try {
    await client.realtime.setAuth('initial-user-token');
    client.channel('progress').subscribe();
    await vi.advanceTimersByTimeAsync(20);
    expect(joinTokens).toEqual(['initial-user-token']);
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    // Realtime falls back to the project key when a session read returns no session.
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await client.realtime.setAuth();
    const removed = client.channel('removed-while-hidden');
    subscribeRealtimeChannel(client.realtime, removed);
    await client.realtime.removeChannel(removed);
    // The Nuxt plugin exposes the SDK client through a reactive object.
    const provided = reactive({ client }) as { client: typeof client };
    subscribeRealtimeChannel(
      provided.client.realtime,
      provided.client.channel('queued-while-hidden')
    );
    const refreshedSession = Promise.withResolvers<SessionRead>();
    getSession.mockReturnValue(refreshedSession.promise);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(joinTokens).toEqual(['initial-user-token']);
    refreshedSession.resolve(sessionRead('refreshed-user-token'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(joinTokens).toEqual([
      'initial-user-token',
      'refreshed-user-token',
      'refreshed-user-token',
    ]);
  } finally {
    dispose();
    await client.realtime.disconnect();
  }
});
