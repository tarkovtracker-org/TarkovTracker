// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTeamChannelController, type TeamChannelDeps } from '@/stores/useTeamStore';
import type { SupabaseClient } from '@supabase/supabase-js';
const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@/utils/logger', () => ({ logger: loggerMock }));
const MEMBER_A = '11111111-1111-4111-8111-111111111111';
const MEMBER_B = '22222222-2222-4222-8222-222222222222';
const MEMBER_C = '33333333-3333-4333-8333-333333333333';
type FakeChannel = {
  topic: string;
  bindings: Array<{ table?: string; filter?: string }>;
  status?: (state: string, error?: Error) => void;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};
const createHarness = (options: { removeStatus?: string | Promise<string> } = {}) => {
  const channels: FakeChannel[] = [];
  const open = new Map<string, FakeChannel>();
  const make = (topic: string): FakeChannel => {
    const fake: FakeChannel = {
      bindings: [],
      on: vi.fn(),
      subscribe: vi.fn(),
      topic,
    };
    fake.on = vi.fn((_event: string, config: { table?: string; filter?: string }) => {
      fake.bindings.push(config);
      return fake;
    });
    fake.subscribe = vi.fn((callback: (state: string, error?: Error) => void) => {
      fake.status = callback;
      return fake;
    });
    return fake;
  };
  const removeChannel = vi.fn(async (target: unknown) => {
    const status = await (options.removeStatus ?? 'ok');
    // Mirrors `RealtimeClient.removeChannel`: only an `ok` leave frees the topic.
    if (status !== 'ok') return status;
    for (const [topic, fake] of open) {
      if (fake === target) open.delete(topic);
    }
    return status;
  });
  const client = {
    // Mirrors `RealtimeClient.channel()`: an open topic returns the live channel.
    channel: vi.fn((topic: string) => {
      const existing = open.get(topic);
      if (existing) return existing;
      const fake = make(topic);
      channels.push(fake);
      open.set(topic, fake);
      return fake;
    }),
    removeChannel,
  } as unknown as SupabaseClient;
  const state = {
    members: [MEMBER_A, MEMBER_B] as string[] | undefined,
    teamId: 'team-1' as string | null,
  };
  const applyProgress = vi.fn();
  const refreshMembers = vi.fn(async () => undefined);
  const deps: TeamChannelDeps = {
    applyProgress,
    getClient: () => client,
    getMembers: () => state.members,
    getTeamId: () => state.teamId,
    refreshMembers,
  };
  return {
    applyProgress,
    channels,
    client,
    deps,
    isTopicOpen: (topic: string) => open.has(topic),
    refreshMembers,
    removeChannel,
    state,
  };
};
describe('createTeamChannelController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('creates one private channel bound to memberships and teammate progress', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    expect(harness.client.channel).toHaveBeenCalledWith('team:team-1', {
      config: { private: true },
    });
    const [created] = harness.channels;
    expect(created?.bindings.map(({ table }) => table)).toEqual([
      'team_memberships',
      'user_game_mode_progress',
    ]);
    expect(created?.bindings[1]?.filter).toBe(`user_id=in.(${MEMBER_A},${MEMBER_B})`);
    expect(harness.refreshMembers).toHaveBeenCalledWith(true);
  });
  it('omits the progress binding when no member ids are usable', async () => {
    const harness = createHarness();
    harness.state.members = [];
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    expect(harness.channels[0]?.bindings.map(({ table }) => table)).toEqual(['team_memberships']);
  });
  it('refreshes members once the join is acknowledged', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    harness.refreshMembers.mockClear();
    harness.channels[0]?.status?.('SUBSCRIBED');
    expect(harness.refreshMembers).toHaveBeenCalledTimes(1);
  });
  it('does not rebuild while the topic and member filter are unchanged', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    harness.channels[0]?.status?.('SUBSCRIBED');
    await controller.refresh();
    expect(harness.client.channel).toHaveBeenCalledTimes(1);
    expect(harness.removeChannel).not.toHaveBeenCalled();
  });
  it('rebuilds when the member filter changes', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    harness.channels[0]?.status?.('SUBSCRIBED');
    harness.state.members = [MEMBER_A, MEMBER_B, MEMBER_C];
    await controller.refresh();
    expect(harness.removeChannel).toHaveBeenCalledTimes(1);
    expect(harness.channels).toHaveLength(2);
    expect(harness.channels[1]?.bindings[1]?.filter).toBe(
      `user_id=in.(${MEMBER_A},${MEMBER_B},${MEMBER_C})`
    );
  });
  it('rebuilds when a join was never acknowledged', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    // No SUBSCRIBED: the binding must not count as live.
    await controller.refresh();
    expect(harness.removeChannel).toHaveBeenCalledTimes(1);
    expect(harness.channels).toHaveLength(2);
  });
  it('drops the binding and rebuilds after the channel closes', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    harness.channels[0]?.status?.('SUBSCRIBED');
    harness.channels[0]?.status?.('CLOSED');
    await controller.refresh();
    expect(harness.channels).toHaveLength(2);
  });
  it('tears the channel down when the team disappears', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    harness.state.teamId = null;
    await controller.refresh();
    expect(harness.removeChannel).toHaveBeenCalledTimes(1);
    expect(harness.client.channel).toHaveBeenCalledTimes(1);
  });
  it('logs each failed status and stops the rejoin loop after five', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    const created = harness.channels[0];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      created?.status?.('CHANNEL_ERROR', new Error('denied'));
    }
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[TeamStore] Realtime channel is not subscribed:',
      expect.objectContaining({ error: 'denied', status: 'CHANNEL_ERROR' })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.removeChannel).toHaveBeenCalledTimes(1);
    // One bounded retry a minute later, not an unbounded rejoin loop.
    expect(harness.client.channel).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.client.channel).toHaveBeenCalledTimes(2);
  });
  it('ignores statuses from a channel that was already replaced', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    const stale = harness.channels[0];
    harness.state.members = [MEMBER_A, MEMBER_B, MEMBER_C];
    await controller.refresh();
    harness.refreshMembers.mockClear();
    stale?.status?.('SUBSCRIBED');
    expect(harness.refreshMembers).not.toHaveBeenCalled();
  });
  it('declines the topic when the previous leave failed', async () => {
    const harness = createHarness({ removeStatus: 'error' });
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    harness.state.members = [MEMBER_A, MEMBER_B, MEMBER_C];
    await controller.refresh();
    // The topic is still occupied, so no replacement channel is created and the
    // failed leave keeps declining it on later attempts.
    expect(harness.channels).toHaveLength(1);
    expect(harness.isTopicOpen('team:team-1')).toBe(true);
    await controller.refresh();
    expect(harness.channels).toHaveLength(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[TeamStore] Realtime channel did not leave cleanly:',
      { status: 'error' }
    );
  });
  it('forwards non-delete progress payloads and ignores deletes', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    const progressBinding = harness.channels[0]?.on.mock.calls.find(
      ([, config]) => (config as { table?: string }).table === 'user_game_mode_progress'
    );
    const handler = progressBinding?.[2] as (payload: {
      eventType: string;
      new: Record<string, unknown>;
    }) => void;
    handler({ eventType: 'UPDATE', new: { user_id: MEMBER_B } });
    expect(harness.applyProgress).toHaveBeenCalledWith({ user_id: MEMBER_B });
    harness.applyProgress.mockClear();
    handler({ eventType: 'DELETE', new: {} });
    expect(harness.applyProgress).not.toHaveBeenCalled();
  });
  it('stops permanently once disposed', async () => {
    const harness = createHarness();
    const controller = createTeamChannelController(harness.deps);
    await controller.refresh();
    await controller.dispose();
    expect(harness.removeChannel).toHaveBeenCalledTimes(1);
    await controller.refresh();
    expect(harness.client.channel).toHaveBeenCalledTimes(1);
  });
});
