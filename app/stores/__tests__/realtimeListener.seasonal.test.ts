// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, type UserState } from '@/stores/progressState';
import { recordLocalSyncTime, resetSyncTimeline } from '@/stores/tarkov/syncTimeline';
const showProgressMerged = vi.fn();
type FakeChannel = {
  topic: string;
  subscribed: boolean;
  subscribeCallback?: (status: string, error?: Error) => void;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};
const {
  createdChannels,
  handlers,
  openTopics,
  removalGate,
  resolveRemovals,
  subscribeGate,
  supabaseContext,
} = vi.hoisted(() => {
  const handlers = new Map<string, (payload: { new: unknown }) => void>();
  const createdChannels: FakeChannel[] = [];
  const openTopics = new Map<string, FakeChannel>();
  const subscribeGate = { defer: false };
  const removalGate = { defer: false, resolvers: [] as Array<() => void> };
  const resolveRemovals = () => {
    const resolvers = removalGate.resolvers.splice(0);
    resolvers.forEach((resolve) => resolve());
  };
  const makeChannel = (topic: string): FakeChannel => {
    const fake: FakeChannel = {
      on: vi.fn(),
      subscribe: vi.fn(),
      subscribed: false,
      topic,
    };
    fake.on = vi.fn(
      (_event: string, config: { table: string }, handler: (payload: { new: unknown }) => void) => {
        handlers.set(config.table, handler);
        return fake;
      }
    );
    fake.subscribe = vi.fn((callback?: (status: string, error?: Error) => void) => {
      fake.subscribeCallback = callback;
      if (subscribeGate.defer) return fake;
      fake.subscribed = true;
      callback?.('SUBSCRIBED');
      return fake;
    });
    return fake;
  };
  const removeChannel = vi.fn(async (target: unknown) => {
    if (removalGate.defer) {
      await new Promise<void>((resolve) => removalGate.resolvers.push(resolve));
    }
    for (const [topic, fake] of openTopics) {
      if (fake === target) {
        fake.subscribed = false;
        openTopics.delete(topic);
      }
    }
    return undefined;
  });
  const supabaseContext = {
    client: {
      from: vi.fn(),
      // Mirrors `RealtimeClient.channel()`: an open topic returns the live channel.
      channel: vi.fn((topic: string) => {
        const existing = openTopics.get(topic);
        if (existing) return existing;
        const fake = makeChannel(topic);
        createdChannels.push(fake);
        openTopics.set(topic, fake);
        return fake;
      }),
      removeChannel,
    },
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      loggedIn: true,
    },
  };
  return {
    createdChannels,
    handlers,
    openTopics,
    removalGate,
    resolveRemovals,
    subscribeGate,
    supabaseContext,
  };
});
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: supabaseContext,
}));
const releaseDeferredRemovals = (): void => {
  removalGate.defer = false;
  resolveRemovals();
};
vi.mock('@/composables/useToastI18n', () => ({
  useToastI18n: () => ({ showProgressMerged }),
}));
vi.mock('@/stores/tarkov/apiUpdateNotifier', () => ({
  maybeNotifyApiUpdate: vi.fn(() => false),
  runApiUpdateHandlers: vi.fn(() => false),
}));
vi.mock('@/stores/tarkov/conflictDetection', () => ({
  detectDataConflicts: vi.fn(() => ({ conflictCount: 0, hasConflict: false })),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({}),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
describe('seasonal progress realtime synchronization', () => {
  const state = structuredClone(defaultState);
  const store = {
    $state: state,
    $patch: (mutator: (target: UserState) => void) => mutator(state),
  };
  beforeEach(() => {
    handlers.clear();
    createdChannels.length = 0;
    openTopics.clear();
    releaseDeferredRemovals();
    removalGate.resolvers.length = 0;
    subscribeGate.defer = false;
    Object.assign(state, structuredClone(defaultState));
    supabaseContext.user.loggedIn = true;
  });
  afterEach(async () => {
    releaseDeferredRemovals();
    const { cleanupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    await cleanupRealtimeListener();
    resetSyncTimeline();
    vi.clearAllMocks();
  });
  it('rebuilds the channel when setup runs again with one already active', async () => {
    const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    await setupRealtimeListener(store);
    expect(supabaseContext.client.channel).toHaveBeenCalledTimes(1);
    // The internal cleanup bumps the listener generation, so a naive generation
    // check would abort here and leave the user without a progress listener.
    await setupRealtimeListener(store);
    expect(supabaseContext.client.channel).toHaveBeenCalledTimes(2);
    expect(handlers.size).toBeGreaterThan(0);
  });
  it('waits for the channel to report SUBSCRIBED before resolving setup', async () => {
    subscribeGate.defer = true;
    const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    const setup = setupRealtimeListener(store);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const channel = createdChannels[0];
    if (!channel) throw new Error('Expected a realtime channel to be created');
    expect(channel.subscribe).toHaveBeenCalledOnce();
    let settled = false;
    void setup.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    channel.subscribed = true;
    channel.subscribeCallback?.('SUBSCRIBED');
    await setup;
    expect(settled).toBe(true);
  });
  it('does not block a new user on a different topic leave', async () => {
    try {
      const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
      await setupRealtimeListener(store);
      removalGate.defer = true;
      supabaseContext.user.id = '22222222-2222-4222-8222-222222222222';
      const setup = setupRealtimeListener(store);
      await setup;
      expect(createdChannels).toHaveLength(2);
      expect(createdChannels[1]?.subscribed).toBe(true);
      expect(openTopics.has('user_progress_22222222-2222-4222-8222-222222222222')).toBe(true);
    } finally {
      releaseDeferredRemovals();
    }
  });
  it('lets the newest overlapping setup replace the older request', async () => {
    const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    await setupRealtimeListener(store);
    // Two concurrent setups must not leave duplicate live channels.
    await Promise.all([setupRealtimeListener(store), setupRealtimeListener(store)]);
    expect(createdChannels).toHaveLength(2);
    // Only the newest request is allowed to join after the shared leave.
    expect(createdChannels.filter(({ subscribed }) => subscribed)).toEqual([createdChannels[1]]);
    expect(openTopics.size).toBe(1);
    expect(handlers.size).toBeGreaterThan(0);
  });
  it('cancels in-flight setup when cleanup runs first', async () => {
    const { cleanupRealtimeListener, setupRealtimeListener } =
      await import('@/stores/tarkov/realtimeListener');
    // Establish a live channel first so teardown has something to remove.
    await setupRealtimeListener(store);
    expect(openTopics.size).toBe(1);
    const queued = setupRealtimeListener(store);
    // Teardown while the second setup is waiting for the old leave must win.
    const teardown = cleanupRealtimeListener();
    await Promise.all([queued, teardown]);
    expect(createdChannels.filter(({ subscribed }) => subscribed)).toEqual([]);
    expect(openTopics.size).toBe(0);
  });
  it('ignores progress and metadata from a listener after teardown starts', async () => {
    const { cleanupRealtimeListener, setupRealtimeListener } =
      await import('@/stores/tarkov/realtimeListener');
    await setupRealtimeListener(store);
    const progressHandler = handlers.get('user_game_mode_progress');
    const metadataHandler = handlers.get('user_progress');
    removalGate.defer = true;
    const teardown = cleanupRealtimeListener();
    try {
      progressHandler?.({
        new: {
          game_mode: 'seasonal',
          progress_data: { level: 44 },
          season_number: 1,
          updated_at: new Date().toISOString(),
        },
      });
      metadataHandler?.({
        new: { current_game_mode: 'pve', game_edition: 2 },
      });
      expect(state).toEqual(defaultState);
    } finally {
      releaseDeferredRemovals();
      await teardown;
    }
  });
  it('merges a reconnect snapshot without overwriting a newer live mode event', async () => {
    const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    let resolveModes!: (value: unknown) => void;
    const modeResult = new Promise((resolve) => {
      resolveModes = resolve;
    });
    supabaseContext.client.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () =>
          table === 'user_progress'
            ? {
                single: async () => ({
                  data: { current_game_mode: 'pvp', updated_at: '2026-09-06T12:00:00Z' },
                  error: null,
                }),
              }
            : modeResult,
      }),
    }));
    await setupRealtimeListener(store);
    const channel = createdChannels[0]!;
    channel.subscribeCallback?.('SUBSCRIBED');
    const handler = handlers.get('user_game_mode_progress');
    handler?.({
      new: {
        game_mode: 'pvp',
        season_number: 0,
        progress_data: { level: 35 },
        updated_at: '2026-09-06T12:01:00Z',
      },
    });
    resolveModes({
      data: [
        {
          game_mode: 'pvp',
          season_number: 0,
          progress_data: { level: 12 },
          updated_at: '2026-09-06T12:00:00Z',
        },
      ],
      error: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.pvp.level).toBe(35);
    expect(createdChannels).toHaveLength(1);
  });
  it.each([
    'pending',
    'edited-during-read',
    'saved-during-read',
    'remote-reset',
    'missing-metadata',
  ])('preserves reconnect edits while respecting reset epochs: %s', async (scenario) => {
    const { setupRealtimeListener, registerSyncControllerGetter } =
      await import('@/stores/tarkov/realtimeListener');
    let pending = scenario !== 'edited-during-read';
    const controller = { pause: vi.fn(), resume: vi.fn(), hasPendingChanges: () => pending };
    registerSyncControllerGetter(() => controller);
    let resolveModes!: (result: unknown) => void;
    const modeResult = new Promise((resolve) => {
      resolveModes = resolve;
    });
    supabaseContext.client.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () =>
          table === 'user_progress'
            ? {
                single: async () => ({
                  data: null,
                  error: scenario === 'missing-metadata' ? { code: 'PGRST116' } : null,
                }),
              }
            : modeResult,
      }),
    }));
    try {
      state.pvp.displayName = 'before';
      await setupRealtimeListener(store);
      createdChannels[0]!.subscribeCallback?.('SUBSCRIBED');
      Object.assign(state.pvp, {
        displayName: null,
        pmcFaction: 'BEAR',
        xpOffset: 123,
        skillOffsets: { Endurance: 4 },
      });
      pending = scenario !== 'saved-during-read';
      if (!pending) recordLocalSyncTime();
      resolveModes({
        data: [
          {
            game_mode: 'pvp',
            season_number: 0,
            updated_at: '2026-09-06T12:00:00Z',
            progress_data: {
              ...structuredClone(defaultState.pvp),
              displayName: 'remote',
              progressEpoch: scenario === 'remote-reset' ? 1 : 0,
              taskCompletions: { remoteTask: { complete: true, timestamp: 10 } },
            },
          },
        ],
        error: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(state.pvp.taskCompletions.remoteTask?.complete).toBe(true);
      if (scenario === 'remote-reset') {
        expect(state.pvp.displayName).toBe('remote');
        expect(state.pvp.progressEpoch).toBe(1);
      } else {
        expect(state.pvp).toMatchObject({
          displayName: null,
          pmcFaction: 'BEAR',
          xpOffset: 123,
          skillOffsets: { Endurance: 4 },
        });
      }
    } finally {
      registerSyncControllerGetter(() => null);
    }
  });
  it('applies only the active Seasonal row without changing persistent modes', async () => {
    const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    await setupRealtimeListener(store);
    const handler = handlers.get('user_game_mode_progress');
    expect(handler).toBeDefined();
    handler?.({
      new: {
        game_mode: 'seasonal',
        progress_data: { level: 22, taskCompletions: { task: { complete: true } } },
        season_number: 1,
        updated_at: new Date().toISOString(),
      },
    });
    expect(state.seasonal.level).toBe(22);
    expect(state.seasonal.taskCompletions.task?.complete).toBe(true);
    expect(state.pvp).toEqual(defaultState.pvp);
    expect(state.pve).toEqual(defaultState.pve);
  });
  it('ignores historical Seasonal rows', async () => {
    const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    await setupRealtimeListener(store);
    const handler = handlers.get('user_game_mode_progress');
    expect(handler).toBeDefined();
    handler?.({
      new: {
        game_mode: 'seasonal',
        progress_data: { level: 44 },
        season_number: 2,
        updated_at: new Date().toISOString(),
      },
    });
    expect(state.seasonal).toEqual(defaultState.seasonal);
  });
  it('ignores an older normalized snapshot after a newer one', async () => {
    const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    await setupRealtimeListener(store);
    const handler = handlers.get('user_game_mode_progress');
    handler?.({
      new: {
        game_mode: 'seasonal',
        progress_data: { displayName: 'newer', level: 30, xpOffset: 300 },
        season_number: 1,
        updated_at: '2026-08-04T12:00:00.000Z',
      },
    });
    handler?.({
      new: {
        game_mode: 'seasonal',
        progress_data: { displayName: 'older', level: 20, xpOffset: 200 },
        season_number: 1,
        updated_at: '2026-08-04T11:00:00.000Z',
      },
    });
    expect(state.seasonal.displayName).toBe('newer');
    expect(state.seasonal.level).toBe(30);
    expect(state.seasonal.xpOffset).toBe(300);
  });
  it('applies a divergent normalized update during the self-origin window', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
      const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
      await setupRealtimeListener(store);
      const handler = handlers.get('user_game_mode_progress');
      recordLocalSyncTime();
      handler?.({
        new: {
          game_mode: 'seasonal',
          progress_data: { level: 22 },
          season_number: 1,
          updated_at: '2026-08-04T12:00:01.000Z',
        },
      });
      expect(state.seasonal.level).toBe(22);
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not let a newer legacy row overwrite authoritative normalized progress', async () => {
    const { setupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    await setupRealtimeListener(store);
    handlers.get('user_game_mode_progress')?.({
      new: {
        game_mode: 'pvp',
        progress_data: { displayName: 'newer', level: 30, xpOffset: 300 },
        season_number: 0,
        updated_at: '2026-08-04T12:00:00.000Z',
      },
    });
    handlers.get('user_progress')?.({
      new: {
        current_game_mode: 'pvp',
        pve_data: defaultState.pve,
        pvp_data: { displayName: 'older', level: 20, xpOffset: 200 },
        updated_at: '2026-08-04T13:00:00.000Z',
      },
    });
    expect(state.pvp.displayName).toBe('newer');
    expect(state.pvp.level).toBe(30);
    expect(state.pvp.xpOffset).toBe(300);
  });
});
