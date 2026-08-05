// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, type UserState } from '@/stores/progressState';
import { recordLocalSyncTime, resetSyncTimeline } from '@/stores/tarkov/syncTimeline';
const showProgressMerged = vi.fn();
const { channel, handlers, supabaseContext } = vi.hoisted(() => {
  const handlers = new Map<string, (payload: { new: unknown }) => void>();
  const removeChannel = vi.fn(async () => undefined);
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  const supabaseContext = {
    client: {
      channel: vi.fn(() => channel),
      removeChannel,
    },
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      loggedIn: true,
    },
  };
  return { channel, handlers, removeChannel, supabaseContext };
});
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: supabaseContext,
}));
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
    Object.assign(state, structuredClone(defaultState));
    channel.on.mockImplementation(
      (_event: string, config: { table: string }, handler: (payload: { new: unknown }) => void) => {
        handlers.set(config.table, handler);
        return channel;
      }
    );
    channel.subscribe.mockImplementation(() => channel);
    supabaseContext.user.loggedIn = true;
  });
  afterEach(async () => {
    const { cleanupRealtimeListener } = await import('@/stores/tarkov/realtimeListener');
    await cleanupRealtimeListener();
    resetSyncTimeline();
    vi.clearAllMocks();
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
  it('does not let an older legacy row overwrite newer normalized progress', async () => {
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
        updated_at: '2026-08-04T11:00:00.000Z',
      },
    });
    expect(state.pvp.displayName).toBe('newer');
    expect(state.pvp.level).toBe(30);
    expect(state.pvp.xpOffset).toBe(300);
  });
});
