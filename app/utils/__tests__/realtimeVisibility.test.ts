// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installRealtimeVisibility, isRealtimeSuspended } from '@/utils/realtimeVisibility';
const setup = () => {
  const page = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  page.visibilityState = 'visible';
  const transport = {
    connect: vi.fn(),
    disconnect: vi.fn(async () => 'ok' as const),
    getChannels: vi.fn(() => [{}]),
  };
  const connect = transport.connect;
  const dispose = installRealtimeVisibility(
    transport as unknown as Parameters<typeof installRealtimeVisibility>[0],
    page
  );
  const visibility = (state: DocumentVisibilityState) => {
    page.visibilityState = state;
    page.dispatchEvent(new Event('visibilitychange'));
  };
  return { page, transport, connect, dispose, visibility };
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
});
it('retains and rejoins actual SDK channels after the background socket closes', async () => {
  vi.useFakeTimers();
  const { createClient } = await import('@supabase/supabase-js');
  const sockets: FakeSocket[] = [];
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
        ? { join_ref: parsed[0], ref: parsed[1], topic: parsed[2], event: parsed[3] }
        : parsed;
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
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: FakeSocket as unknown as typeof WebSocket },
  });
  const page = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  page.visibilityState = 'visible';
  const dispose = installRealtimeVisibility(client.realtime, page);
  const statuses = vi.fn();
  client.channel('test').subscribe(statuses);
  await vi.advanceTimersByTimeAsync(20);
  expect(statuses.mock.calls.some(([status]) => status === 'SUBSCRIBED')).toBe(true);
  page.visibilityState = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60_020);
  expect(sockets.every((socket) => socket.readyState === 3)).toBe(true);
  expect(client.getChannels()).toHaveLength(1);
  client.channel('created-while-hidden').subscribe();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(sockets).toHaveLength(1);
  page.visibilityState = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(20);
  expect(sockets).toHaveLength(2);
  expect(statuses.mock.calls.filter(([status]) => status === 'SUBSCRIBED')).toHaveLength(2);
  dispose();
  await client.realtime.disconnect();
});
