// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { defaultState } from '@/stores/progressState';
import {
  initializeTarkovSync,
  resetTarkovStoreForSessionTransition,
  resetTarkovSync,
  useTarkovStore,
} from '@/stores/useTarkov';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { UserProgressData, UserState } from '@/stores/progressState';
import type { Task } from '@/types/tarkov';
const {
  channel,
  cleanupSync,
  syncInitialState,
  createRemoteRow,
  clearUserIdFilters,
  getModeProgressCallback,
  getRealtimeCallback,
  getUserIdFilters,
  i18nTranslate,
  loggerMock,
  metadataStoreMock,
  modeProgressResult,
  modeProgressQuery,
  pauseSync,
  resumeSync,
  setModeProgressCallback,
  setRealtimeCallback,
  showApiUpdated,
  showLoadFailed,
  showLocalIgnored,
  showProgressMerged,
  single,
  supabaseContext,
  update,
  rpc,
  useSupabaseSyncMock,
} = vi.hoisted(() => {
  const createProgressData = (overrides: Partial<UserProgressData> = {}): UserProgressData => ({
    level: 1,
    pmcFaction: 'USEC',
    displayName: null,
    xpOffset: 0,
    taskObjectives: {},
    taskCompletions: {},
    hideoutParts: {},
    hideoutModules: {},
    traders: {},
    skills: {},
    prestigeLevel: 0,
    progressEpoch: 0,
    skillOffsets: {},
    storyChapters: {},
    ...overrides,
  });
  const createRemoteRow = (
    overrides: Partial<{
      user_id: string;
      current_game_mode: string | null;
      game_edition: number | null;
      tarkov_uid: number | null;
      pvp_data: UserProgressData | null;
      pve_data: UserProgressData | null;
      created_at: string | null;
      updated_at: string | null;
    }> = {}
  ) => ({
    user_id: 'user-1',
    current_game_mode: 'pvp',
    game_edition: 1,
    tarkov_uid: null,
    pvp_data: createProgressData(),
    pve_data: createProgressData(),
    created_at: '2026-02-20T00:00:00.000Z',
    updated_at: '2026-02-22T12:00:00.000Z',
    ...overrides,
  });
  const realtimeState = {
    callback: null as ((payload: { new: unknown; old: unknown }) => void) | null,
    modeProgressCallback: null as ((payload: { new: unknown; old: unknown }) => void) | null,
  };
  const showApiUpdated = vi.fn();
  const showLoadFailed = vi.fn();
  const showLocalIgnored = vi.fn();
  const showProgressMerged = vi.fn();
  const cleanupSync = vi.fn();
  const syncInitialState = vi.fn(async (): Promise<Record<string, unknown> | null> => ({}));
  const pauseSync = vi.fn();
  const resumeSync = vi.fn();
  const useSupabaseSyncMock = vi.fn((_options?: unknown) => ({
    cleanup: cleanupSync,
    syncToSupabase: syncInitialState,
    pause: pauseSync,
    resume: resumeSync,
  }));
  const metadataStoreMock = {
    currentGameMode: 'pvp',
    getTaskById: (taskId: string) => ({
      id: taskId,
      name: `Task ${taskId}`,
    }),
    initialize: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    tasks: [] as Task[],
  };
  type RemoteRow = ReturnType<typeof createRemoteRow>;
  type SupabaseErrorLike = { code?: string; message: string } | null;
  type SingleResult = { data: RemoteRow | null; error: SupabaseErrorLike };
  type RpcResult = { error: SupabaseErrorLike };
  type SyncRpcArgs = {
    p_current_game_mode: string;
    p_game_edition: number;
    p_tarkov_uid: number | null;
    p_modes: Record<string, UserProgressData>;
  };
  const single = vi.fn(async (): Promise<SingleResult> => ({
    data: createRemoteRow(),
    error: null,
  }));
  const modeProgressResult: {
    data: Array<{
      game_mode: string;
      progress_data: unknown;
      season_number: number;
      updated_at?: string;
      progress_updated_at?: string | null;
    }>;
    error: SupabaseErrorLike;
    errorSequence?: SupabaseErrorLike[];
  } = { data: [], error: null };
  const modeProgressQuery = {
    in: vi.fn(),
    then: <TResult1 = typeof modeProgressResult, TResult2 = never>(
      onfulfilled?: ((value: typeof modeProgressResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => {
      const queued = modeProgressResult.errorSequence;
      const value =
        queued && queued.length > 0
          ? { ...modeProgressResult, data: [], error: queued.shift() ?? null }
          : modeProgressResult;
      return Promise.resolve(value).then(onfulfilled, onrejected);
    },
  };
  modeProgressQuery.in.mockImplementation(() => modeProgressQuery);
  // Records each `.eq('user_id', <id>)` filter so tests can attribute queries to
  // the session that issued them across auth transitions.
  const userIdFilters: string[] = [];
  const eq = vi.fn((_column: unknown, value: unknown) => {
    userIdFilters.push(String(value));
    return { single };
  });
  const select = vi.fn(() => ({ eq }));
  const rpc = vi.fn(async (_name?: string, _args?: SyncRpcArgs): Promise<RpcResult> => ({
    error: null,
  }));
  const update = vi.fn(async (): Promise<RpcResult> => ({ error: null }));
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    is: vi.fn(() => updateQuery),
    select: vi.fn(async () => {
      const result = await update();
      return {
        data: result.error ? null : [{ user_id: 'user-1' }],
        error: result.error,
      };
    }),
    then: <TResult1 = RpcResult, TResult2 = never>(
      onfulfilled?: ((value: RpcResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => update().then(onfulfilled, onrejected),
  };
  const from = vi.fn((table: string) => {
    if (table === 'user_game_mode_progress') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_column: unknown, value: unknown) => {
            userIdFilters.push(String(value));
            return modeProgressQuery;
          }),
        })),
      };
    }
    return {
      eq,
      select,
      single,
      update: vi.fn(() => updateQuery),
      upsert: rpc,
    };
  });
  const channel = {
    on: vi.fn((_: string, __: Record<string, unknown>, callback: typeof realtimeState.callback) => {
      realtimeState.callback = callback;
      return channel;
    }),
    subscribe: vi.fn((callback?: (status: string, error?: Error) => void) => {
      callback?.('SUBSCRIBED');
      return channel;
    }),
  };
  const i18nTranslate = vi.fn((key: string, params?: Record<string, unknown>) => {
    if (key === 'toast.api_updated.label.single') return 'Task updated';
    if (key === 'toast.api_updated.label.plural') return 'Tasks updated';
    if (key === 'toast.api_updated.state.completed') return 'completed';
    if (key === 'toast.api_updated.state.failed') return 'failed';
    if (key === 'toast.api_updated.state.uncompleted') return 'uncompleted';
    if (key === 'toast.api_updated.description_fallback')
      return 'Your progress was updated via API.';
    if (key === 'toast.api_updated.more' && typeof params?.count === 'number') {
      return `, +${params.count} more`;
    }
    return key;
  });
  const supabaseContext = {
    user: {
      createdAt: '2026-02-20T00:00:00.000Z',
      id: 'user-1' as string | null,
      loggedIn: true,
      providers: [] as string[],
    },
    client: {
      channel: vi.fn(() => channel),
      from,
      removeChannel: vi.fn(),
      rpc,
    },
  };
  const loggerMock = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  return {
    channel,
    cleanupSync,
    syncInitialState,
    createRemoteRow,
    clearUserIdFilters: () => {
      userIdFilters.length = 0;
    },
    getModeProgressCallback: () => realtimeState.modeProgressCallback,
    getRealtimeCallback: () => realtimeState.callback,
    getUserIdFilters: () => [...userIdFilters],
    i18nTranslate,
    loggerMock,
    metadataStoreMock,
    modeProgressResult,
    modeProgressQuery,
    pauseSync,
    resumeSync,
    setRealtimeCallback: (callback: ((payload: { new: unknown; old: unknown }) => void) | null) => {
      realtimeState.callback = callback;
    },
    setModeProgressCallback: (
      callback: ((payload: { new: unknown; old: unknown }) => void) | null
    ) => {
      realtimeState.modeProgressCallback = callback;
    },
    showApiUpdated,
    showLoadFailed,
    showLocalIgnored,
    showProgressMerged,
    single,
    supabaseContext,
    update,
    rpc,
    useSupabaseSyncMock,
    get realtimeCallback() {
      return realtimeState.callback;
    },
  };
});
mockNuxtImport('useNuxtApp', () => () => ({
  $i18n: {
    t: i18nTranslate,
  },
  $supabase: supabaseContext,
}));
vi.mock('@/composables/supabase/useSupabaseSync', () => ({
  useSupabaseSync: (options: unknown) => useSupabaseSyncMock(options),
}));
vi.mock('@/composables/useToastI18n', () => ({
  useToastI18n: () => ({
    showApiUpdated,
    showHideoutUpdated: vi.fn(),
    showLoadFailed,
    showLocalIgnored,
    showProgressMerged,
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataStoreMock,
}));
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
const progressWithTaskState = (taskId: string, complete: boolean): UserProgressData => ({
  level: 1,
  pmcFaction: 'USEC',
  displayName: null,
  xpOffset: 0,
  taskObjectives: {},
  taskCompletions: {
    [taskId]: {
      complete,
      failed: false,
      timestamp: complete ? 2000 : 1000,
    },
  },
  hideoutParts: {},
  hideoutModules: {},
  traders: {},
  skills: {},
  prestigeLevel: 0,
  progressEpoch: 0,
  skillOffsets: {},
  storyChapters: {},
});
const progressWithLevel = (level: number): UserProgressData => ({
  level,
  pmcFaction: 'USEC',
  displayName: null,
  xpOffset: 0,
  taskObjectives: {},
  taskCompletions: {},
  hideoutParts: {},
  hideoutModules: {},
  traders: {},
  skills: {},
  prestigeLevel: 0,
  progressEpoch: 0,
  skillOffsets: {},
  storyChapters: {},
});
const progressWithStoryObjective = (complete: boolean, timestamp: number): UserProgressData => ({
  ...progressWithLevel(1),
  storyChapters: {
    'chapter-1': {
      objectives: {
        'objective-1': {
          complete,
          timestamp,
        },
      },
    },
  },
});
const progressWithItemCounts = (
  overrides: Partial<Pick<UserProgressData, 'taskObjectives' | 'hideoutParts'>> = {}
): UserProgressData => ({
  ...progressWithLevel(1),
  taskObjectives: overrides.taskObjectives ?? {
    'objective-1': {
      complete: false,
      count: 2,
    },
  },
  hideoutParts: overrides.hideoutParts ?? {
    'part-1': {
      complete: false,
      count: 1,
    },
  },
});
const cloneProgress = (value: UserProgressData): UserProgressData => {
  return JSON.parse(JSON.stringify(value)) as UserProgressData;
};
const withLegacyTarkovDevProfile = (value: UserProgressData, aid: number): UserProgressData => {
  return Object.assign(cloneProgress(value), {
    tarkovDevProfile: {
      aid,
      importedAt: 123,
    },
  }) as UserProgressData;
};
const waitForBackgroundTasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const getLastSyncPayload = () => {
  const call = rpc.mock.calls.at(-1);
  expect(call?.[0]).toBe('sync_user_game_mode_progress');
  if (!call?.[1]) throw new Error('Expected a sync RPC payload');
  return call[1];
};
const setLocalProgress = (level = 5) => {
  const store = useTarkovStore();
  store.$patch((state) => {
    state.pvp.level = level;
  });
};
// ---------------------------------------------------------------------------
// Stale session continuation helpers (startup account-switch reproduction)
// ---------------------------------------------------------------------------
type SupabaseRowResult = {
  data: ReturnType<typeof createRemoteRow> | null;
  error: { code?: string; message: string } | null;
};
type PersistedProgressEnvelope = {
  _timestamp?: number;
  _metadataTimestamp?: number;
  _userId?: string | null;
  data?: UserState;
};
const SESSION_BASE_MS = Date.parse('2026-02-22T00:00:00.000Z');
const sessionClock = (offsetMs: number): string =>
  new Date(SESSION_BASE_MS + offsetMs).toISOString();
/** Defers one Supabase row read so it can be released after auth transitions. */
const createDeferredRead = (): {
  promise: Promise<SupabaseRowResult>;
  reject: (error: unknown) => void;
  resolve: (result: SupabaseRowResult) => void;
} => {
  let reject!: (error: unknown) => void;
  let resolve!: (result: SupabaseRowResult) => void;
  return {
    promise: new Promise<SupabaseRowResult>((res, rej) => {
      reject = rej;
      resolve = res;
    }),
    reject: (error: unknown) => reject(error),
    resolve: (result: SupabaseRowResult) => resolve(result),
  };
};
/**
 * Defers one normalized mode-progress read (both chained `.in` filters resolve
 * to the same pending thenable) so it can be released after auth transitions.
 */
const createDeferredModeRead = (): {
  begin: () => void;
  release: (
    rows: Array<{ game_mode: string; progress_data: UserProgressData; season_number: number }>,
    error?: { code?: string; message: string } | null
  ) => void;
} => {
  type DeferredModeReadResult = {
    data: Array<{
      game_mode: string;
      progress_data: UserProgressData;
      season_number: number;
    }> | null;
    error: { code?: string; message: string } | null;
  };
  let resolveRows!: (result: DeferredModeReadResult) => void;
  const pending = new Promise<DeferredModeReadResult>((resolve) => {
    resolveRows = resolve;
  });
  const deferredQuery = {
    in: () => deferredQuery,
    then: <TResult1 = DeferredModeReadResult, TResult2 = never>(
      onfulfilled?: ((value: DeferredModeReadResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => pending.then(onfulfilled, onrejected),
  };
  return {
    // The first `.in` call returns the pending thenable; the second `.in` runs
    // on the deferred itself (chained to it), so only one once-entry is queued
    // and no stale queue entry can leak to a later session's read.
    begin: () => {
      modeProgressQuery.in.mockImplementationOnce(() => deferredQuery);
    },
    release: (rows, error = null) => resolveRows({ data: rows, error }),
  };
};
const seedOwnedEnvelope = (
  userId: string,
  progressOverrides: Partial<UserState>,
  timestamp = SESSION_BASE_MS
) => {
  localStorage.setItem(
    STORAGE_KEYS.progress,
    JSON.stringify({
      _timestamp: timestamp,
      _userId: userId,
      data: { ...structuredClone(defaultState), ...progressOverrides },
    })
  );
};
const readPersistedEnvelope = (): PersistedProgressEnvelope => {
  const raw = localStorage.getItem(STORAGE_KEYS.progress);
  expect(raw).not.toBeNull();
  return JSON.parse(raw ?? '{}') as PersistedProgressEnvelope;
};
const compoundProgress = (level: number, taskId: string): UserProgressData => ({
  ...progressWithTaskState(taskId, true),
  level,
});
const modeRow = (mode: string, progress: UserProgressData) => ({
  game_mode: mode,
  progress_data: progress,
  season_number: 0,
});
/** Models the real auth transition: the context user changes, then the app resets. */
const switchSession = (
  previousUserId: string | null,
  nextUserId: string | null,
  reason = 'user switched'
) => {
  supabaseContext.user.id = nextUserId;
  supabaseContext.user.loggedIn = nextUserId !== null;
  resetTarkovStoreForSessionTransition(previousUserId, reason);
};
/** Lets fire-and-forget realtime snapshot reads and upserts finish before observing. */
const settleBackgroundWork = async (): Promise<void> => {
  for (let round = 0; round < 6; round += 1) await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  for (let round = 0; round < 2; round += 1) await Promise.resolve();
};
/** Freezes every install/write boundary a stale continuation could touch. */
const watchSessionActivity = () => ({
  channelRemovals: supabaseContext.client.removeChannel.mock.calls.length,
  listenerInstalls: supabaseContext.client.channel.mock.calls.length,
  realtimeEventHandlers: channel.on.mock.calls.length,
  realtimeJoins: channel.subscribe.mock.calls.length,
  syncControllers: useSupabaseSyncMock.mock.calls.length,
  upsertWrites: rpc.mock.calls.length,
  userFilters: getUserIdFilters(),
});
const expectNoFollowOnSessionActivity = (
  baseline: ReturnType<typeof watchSessionActivity>,
  after: ReturnType<typeof watchSessionActivity>
) => {
  expect(after.channelRemovals).toBe(baseline.channelRemovals);
  expect(after.listenerInstalls).toBe(baseline.listenerInstalls);
  expect(after.realtimeEventHandlers).toBe(baseline.realtimeEventHandlers);
  expect(after.realtimeJoins).toBe(baseline.realtimeJoins);
  expect(after.syncControllers).toBe(baseline.syncControllers);
  expect(after.upsertWrites).toBe(baseline.upsertWrites);
  expect(after.userFilters).toEqual(baseline.userFilters);
};
describe('useTarkov sync integration', () => {
  beforeEach(() => {
    resetTarkovSync('test setup');
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    clearUserIdFilters();
    setRealtimeCallback(null);
    setModeProgressCallback(null);
    supabaseContext.user.id = 'user-1';
    supabaseContext.user.loggedIn = true;
    supabaseContext.user.providers = [];
    supabaseContext.user.createdAt = '2026-02-20T00:00:00.000Z';
    metadataStoreMock.currentGameMode = 'pvp';
    metadataStoreMock.initialize.mockClear();
    metadataStoreMock.initialize.mockResolvedValue(undefined);
    metadataStoreMock.refresh.mockClear();
    metadataStoreMock.refresh.mockResolvedValue(undefined);
    metadataStoreMock.tasks = [];
    modeProgressResult.data = [];
    modeProgressResult.error = null;
    modeProgressResult.errorSequence = [];
    single.mockResolvedValue({ data: createRemoteRow(), error: null });
    syncInitialState.mockReset().mockResolvedValue({});
    rpc.mockResolvedValue({ error: null });
    update.mockResolvedValue({ error: null });
    channel.on.mockImplementation((_: string, config: Record<string, unknown>, callback) => {
      const typedCallback = callback as (payload: { new: unknown; old: unknown }) => void;
      if (config.table === 'user_game_mode_progress') {
        setModeProgressCallback(typedCallback);
      } else {
        setRealtimeCallback(typedCallback);
      }
      return channel;
    });
    channel.subscribe.mockImplementation((callback?: (status: string, error?: Error) => void) => {
      callback?.('SUBSCRIBED');
      return channel;
    });
    useSupabaseSyncMock.mockReturnValue({
      cleanup: cleanupSync,
      syncToSupabase: syncInitialState,
      pause: pauseSync,
      resume: resumeSync,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetTarkovSync('test teardown');
    localStorage.clear();
  });
  it('keeps offline Seasonal edits when historical mode freshness is unknown and metadata is newer', async () => {
    const base = Date.parse('2026-09-06T12:00:00Z');
    const local = structuredClone(defaultState);
    local.currentGameMode = 'seasonal';
    local.seasonal.displayName = 'offline edit';
    local.seasonal.level = 12;
    local.seasonal.taskObjectives['objective-1'] = {
      complete: false,
      count: 4,
      timestamp: base + 20_000,
    };
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _userId: 'user-1',
        _timestamp: base + 20_000,
        _metadataTimestamp: base + 10_000,
        _modeTimestamps: { pvp: base + 10_000, pve: base + 10_000, seasonal: base + 20_000 },
        data: local,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        current_game_mode: 'pve',
        game_edition: 3,
        updated_at: new Date(base + 30_000).toISOString(),
      }),
      error: null,
    });
    modeProgressResult.data = [
      {
        game_mode: 'seasonal',
        season_number: ACTIVE_SEASON_NUMBER,
        progress_data: {
          ...progressWithLevel(2),
          displayName: 'historical',
          taskObjectives: { 'objective-1': { complete: false, count: 1 } },
        },
        progress_updated_at: null,
      },
    ];
    await initializeTarkovSync();
    const store = useTarkovStore();
    expect(store.currentGameMode).toBe('pve');
    expect(store.gameEdition).toBe(3);
    expect(store.seasonal.displayName).toBe('offline edit');
    expect(store.seasonal.level).toBe(12);
    expect(store.seasonal.taskObjectives['objective-1']?.count).toBe(4);
    expect(getLastSyncPayload()?.p_modes).toEqual(
      expect.objectContaining({
        seasonal: expect.objectContaining({ displayName: 'offline edit', level: 12 }),
      })
    );
  });
  it('persists remote freshness through the real Pinia persistence plugin', async () => {
    const base = Date.parse('2026-09-06T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(base + 40_000);
    const local = { ...structuredClone(defaultState), pvp: progressWithLevel(1) };
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _userId: 'user-1',
        _timestamp: base + 10_000,
        data: local,
      })
    );
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    single.mockResolvedValue({
      data: createRemoteRow({ game_edition: 2, updated_at: new Date(base + 20_000).toISOString() }),
      error: null,
    });
    modeProgressResult.data = [
      {
        game_mode: 'pvp',
        season_number: 0,
        progress_data: progressWithLevel(2),
        progress_updated_at: new Date(base + 20_000).toISOString(),
      },
      {
        game_mode: 'pve',
        season_number: 0,
        progress_data: progressWithLevel(1),
        progress_updated_at: new Date(base + 10_000).toISOString(),
      },
    ];
    await initializeTarkovSync();
    await nextTick();
    const read = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!);
    expect(read()._metadataTimestamp).toBe(base + 20_000);
    expect(read()._modeTimestamps.pvp).toBe(base + 20_000);
    getModeProgressCallback()?.({
      old: null,
      new: {
        game_mode: 'pvp',
        season_number: 0,
        progress_data: progressWithLevel(3),
        updated_at: new Date(base + 35_000).toISOString(),
        progress_updated_at: new Date(base + 30_000).toISOString(),
      },
    });
    await nextTick();
    expect(read().data.pvp.level).toBe(3);
    expect(read()._modeTimestamps.pvp).toBe(base + 30_000);
    useTarkovStore().$patch((state) => {
      state.pve.level = 4;
    });
    await nextTick();
    expect(read()._modeTimestamps.pve).toBe(base + 40_000);
    expect(read()._modeTimestamps.pvp).toBe(base + 30_000);
    expect(read()._metadataTimestamp).toBe(base + 20_000);
    // A matching echo needs no Pinia patch, but must persist its server clock.
    getModeProgressCallback()?.({
      old: null,
      new: {
        game_mode: 'pve',
        season_number: 0,
        progress_data: progressWithLevel(4),
        updated_at: new Date(base + 35_000).toISOString(),
        progress_updated_at: new Date(base + 35_000).toISOString(),
      },
    });
    await nextTick();
    expect(read()._modeTimestamps.pve).toBe(base + 35_000);
    useTarkovStore().$patch({ gameEdition: 3 });
    await nextTick();
    expect(read()._metadataTimestamp).toBe(base + 40_000);
    getRealtimeCallback()?.({
      old: null,
      new: createRemoteRow({ game_edition: 3, updated_at: new Date(base + 36_000).toISOString() }),
    });
    await nextTick();
    expect(read()._metadataTimestamp).toBe(base + 36_000);
  });
  it.each(['', 'invalid-date'])(
    'restores owned progress when server timestamps are unusable: %s',
    async (updatedAt) => {
      localStorage.setItem(
        STORAGE_KEYS.progress,
        JSON.stringify({
          _timestamp: Date.now(),
          _userId: 'user-1',
          data: { ...structuredClone(defaultState), pvp: progressWithLevel(7) },
        })
      );
      single.mockResolvedValue({ data: createRemoteRow({ updated_at: updatedAt }), error: null });
      modeProgressResult.data = [
        { game_mode: 'pvp', season_number: 0, progress_data: progressWithLevel(5) },
        { game_mode: 'pve', season_number: 0, progress_data: progressWithLevel(1) },
      ];
      await initializeTarkovSync();
      expect(useTarkovStore().pvp.level).toBe(7);
    }
  );
  it('keeps mode freshness independent of other modes and visibility-only timestamps', async () => {
    const now = Date.now();
    const local = structuredClone(defaultState);
    local.pvp.level = 7;
    local.pvp.taskObjectives.objective = { count: 0 };
    local.pvp.hideoutParts.part = { count: 0 };
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: now - 1000,
        _modeTimestamps: { pvp: now - 1000, pve: now - 5000, seasonal: now - 5000 },
        _userId: 'user-1',
        data: local,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({ updated_at: new Date(now - 5000).toISOString() }),
      error: null,
    });
    modeProgressResult.data = [
      {
        game_mode: 'pvp',
        season_number: 0,
        progress_updated_at: new Date(now - 2000).toISOString(),
        progress_data: {
          ...local.pvp,
          taskObjectives: { objective: { count: 5 } },
          hideoutParts: { part: { count: 5 } },
        },
      },
      {
        game_mode: 'pve',
        season_number: 0,
        updated_at: new Date(now + 2000).toISOString(),
        progress_updated_at: new Date(now - 2000).toISOString(),
        progress_data: { ...local.pve, level: 25 },
      },
      {
        game_mode: 'seasonal',
        season_number: ACTIVE_SEASON_NUMBER,
        progress_updated_at: new Date(now).toISOString(),
        progress_data: { ...local.seasonal, level: 55 },
      },
    ];
    await initializeTarkovSync();
    expect(useTarkovStore().pvp.taskObjectives.objective?.count).toBe(0);
    expect(useTarkovStore().pvp.hideoutParts.part?.count).toBe(0);
    expect(useTarkovStore().pve.level).toBe(25);
    expect(useTarkovStore().seasonal.level).toBe(55);
  });
  it('stops initialization after deferred legacy reads exhaust their retries', async () => {
    single
      .mockResolvedValueOnce({ data: createRemoteRow(), error: null })
      .mockResolvedValue({ data: null, error: { message: 'legacy unavailable' } });
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    expect(useSupabaseSyncMock).not.toHaveBeenCalled();
  });
  it('records the local sync timestamp only when the save callback succeeds', async () => {
    await initializeTarkovSync();
    const { getLastLocalSyncTime } = await import('@/stores/tarkov/syncTimeline');
    const options = useSupabaseSyncMock.mock.calls.at(-1)?.[0] as { onSynced: () => void };
    vi.spyOn(Date, 'now').mockReturnValue(123456789);
    options.onSynced();
    expect(getLastLocalSyncTime()).toBe(123456789);
  });
  it.each(['success', 'error', 'throw', 'session-reset'])(
    'tracks an in-flight RPC and removes failed or stale markers: %s',
    async (outcome) => {
      await initializeTarkovSync();
      const timeline = await import('@/stores/tarkov/syncTimeline');
      const options = useSupabaseSyncMock.mock.calls.at(-1)?.[0] as {
        sync: (payload: Record<string, unknown>) => Promise<unknown>;
      };
      let resolve!: (value: { error: null | { message: string } }) => void;
      let reject!: (error: Error) => void;
      rpc.mockReturnValueOnce(
        new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        })
      );
      const startedAt = Date.now();
      const saving = options.sync({});
      expect(timeline.isLikelySelfOriginUpdate(startedAt)).toBe(true);
      expect(timeline.getLastLocalSyncTime()).toBe(0);
      if (outcome === 'session-reset') timeline.resetSyncTimeline();
      if (outcome === 'throw') {
        reject(new Error('offline'));
        await expect(saving).rejects.toThrow('offline');
      } else {
        resolve({ error: outcome === 'error' ? { message: 'denied' } : null });
        await saving;
      }
      expect(timeline.isLikelySelfOriginUpdate(startedAt)).toBe(outcome === 'success');
    }
  );
  it('skips reinitialization when sync already exists for same user', async () => {
    await initializeTarkovSync();
    expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
    single.mockClear();
    useSupabaseSyncMock.mockClear();
    await initializeTarkovSync();
    expect(single).not.toHaveBeenCalled();
    expect(useSupabaseSyncMock).not.toHaveBeenCalled();
  });
  it('resets and reinitializes sync when authenticated user changes', async () => {
    await initializeTarkovSync();
    cleanupSync.mockClear();
    useSupabaseSyncMock.mockClear();
    supabaseContext.user.id = 'user-2';
    await initializeTarkovSync();
    expect(cleanupSync).toHaveBeenCalledTimes(1);
    expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
  });
  it('shows other_account toast and replaces mismatched data with current-user progress', async () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'other-user',
        data: { ...structuredClone(defaultState), pvp: progressWithLevel(47) },
      })
    );
    await initializeTarkovSync();
    expect(showLocalIgnored).toHaveBeenCalledWith('other_account');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!)).toMatchObject({
      _userId: 'user-1',
      data: { pvp: { level: 1 } },
    });
  });
  it('keeps scoped local progress hidden until the matching user session is hydrated', async () => {
    supabaseContext.user.loggedIn = false;
    supabaseContext.user.id = null;
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: {
          ...defaultState,
          pvp: progressWithLevel(7),
        },
      })
    );
    const store = useTarkovStore();
    expect(store.pvp.level).toBe(1);
    supabaseContext.user.loggedIn = true;
    supabaseContext.user.id = 'user-1';
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    });
    await initializeTarkovSync();
    expect(store.pvp.level).toBe(7);
    expect(getLastSyncPayload().p_modes.pvp).toEqual(expect.objectContaining({ level: 7 }));
  });
  it('refreshes metadata after restoring scoped progress with a different game mode', async () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: {
          ...defaultState,
          currentGameMode: 'pve',
          pve: progressWithLevel(7),
        },
      })
    );
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    });
    const store = useTarkovStore();
    await initializeTarkovSync();
    await waitForBackgroundTasks();
    expect(store.currentGameMode).toBe('pve');
    expect(metadataStoreMock.initialize).toHaveBeenCalledTimes(1);
    expect(metadataStoreMock.refresh).toHaveBeenCalledTimes(1);
  });
  it('logs and emits a telemetry event when metadata refresh after startup sync fails', async () => {
    const refreshError = new Error('metadata refresh failed');
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: {
          ...defaultState,
          currentGameMode: 'pve',
          pve: progressWithLevel(7),
        },
      })
    );
    metadataStoreMock.refresh.mockRejectedValueOnce(refreshError);
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    });
    await initializeTarkovSync();
    await waitForBackgroundTasks();
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[TarkovStore] Failed to refresh metadata after startup sync',
      {
        event: 'metadata.refresh.failure',
        metadataGameMode: 'pvp',
        tarkovGameMode: 'pve',
      },
      refreshError
    );
    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    const metadataRefreshFailureEvent = dispatchEventSpy.mock.calls[0]?.[0] as CustomEvent<{
      error: Error;
      metadataGameMode: string;
      tarkovGameMode: string;
    }>;
    expect(metadataRefreshFailureEvent.type).toBe('metadata.refresh.failure');
    expect(metadataRefreshFailureEvent.detail).toEqual({
      error: refreshError,
      metadataGameMode: 'pvp',
      tarkovGameMode: 'pve',
    });
    dispatchEventSpy.mockRestore();
  });
  it('restores legacy local progress for authenticated users so it can be migrated later', async () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        ...defaultState,
        pvp: progressWithLevel(9),
      })
    );
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    });
    const store = useTarkovStore();
    expect(store.pvp.level).toBe(1);
    await initializeTarkovSync();
    expect(store.pvp.level).toBe(9);
    expect(getLastSyncPayload().p_modes.pvp).toEqual(expect.objectContaining({ level: 9 }));
  });
  it('restores guest-scoped wrapped local progress for authenticated users before migration', async () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: null,
        data: {
          ...defaultState,
          pvp: progressWithLevel(9),
        },
      })
    );
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    });
    const store = useTarkovStore();
    expect(store.pvp.level).toBe(1);
    await initializeTarkovSync();
    expect(store.pvp.level).toBe(9);
    expect(getLastSyncPayload().p_modes.pvp).toEqual(expect.objectContaining({ level: 9 }));
  });
  it('uses the preserved scoped snapshot after auth reset overwrites localStorage', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.pvp.level = 14;
    });
    const preservedTimestamp = Date.parse('2026-02-25T00:00:00.000Z');
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: preservedTimestamp,
        _userId: 'user-2',
        data: {
          ...defaultState,
          pvp: progressWithLevel(9),
        },
      })
    );
    supabaseContext.user.id = 'user-2';
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithLevel(1),
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
      error: null,
    });
    resetTarkovSync('user switched', {
      preservePersistedStateForUserId: 'user-2',
    });
    store.$reset();
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: preservedTimestamp + 5000,
        _userId: 'user-2',
        data: structuredClone(defaultState),
      })
    );
    const overwrittenSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || '{}');
    expect(overwrittenSnapshot._userId).toBe('user-2');
    expect(overwrittenSnapshot.data?.pvp?.level).toBe(1);
    await initializeTarkovSync();
    expect(store.pvp.level).toBe(9);
    expect(getLastSyncPayload().p_modes.pvp).toEqual(expect.objectContaining({ level: 9 }));
  });
  it('restores the previous user snapshot after logout resets the store', async () => {
    const store = useTarkovStore();
    const preservedTimestamp = Date.parse('2026-02-25T00:00:00.000Z');
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: preservedTimestamp,
        _userId: 'user-1',
        data: {
          ...defaultState,
          pvp: progressWithLevel(11),
        },
      })
    );
    supabaseContext.user.id = null;
    supabaseContext.user.loggedIn = false;
    store.$patch((state) => {
      state.pvp.level = 42;
    });
    resetTarkovStoreForSessionTransition('user-1', 'logout');
    const restoredSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || '{}');
    expect(store.pvp.level).toBe(1);
    expect(restoredSnapshot._userId).toBe('user-1');
    expect(restoredSnapshot.data?.pvp?.level).toBe(11);
  });
  it('clears progress when preserved logout storage cannot be rewritten', () => {
    const store = useTarkovStore();
    const preservedTimestamp = Date.parse('2026-02-25T00:00:00.000Z');
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: preservedTimestamp,
        _userId: 'user-1',
        data: {
          ...defaultState,
          pvp: progressWithLevel(11),
        },
      })
    );
    supabaseContext.user.id = null;
    supabaseContext.user.loggedIn = false;
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === STORAGE_KEYS.progress) {
        throw new Error('storage disabled');
      }
      return originalSetItem(key, value);
    });
    expect(() => resetTarkovStoreForSessionTransition('user-1', 'logout')).not.toThrow();
    expect(store.pvp.level).toBe(1);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      `[TarkovStore] Failed to write localStorage key "${STORAGE_KEYS.progress}":`,
      expect.any(Error)
    );
    setItemSpy.mockRestore();
  });
  it('prefers the preserved scoped snapshot over guest progress after logout', async () => {
    const store = useTarkovStore();
    const preservedTimestamp = Date.parse('2026-02-25T00:00:00.000Z');
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: preservedTimestamp,
        _userId: 'user-1',
        data: {
          ...defaultState,
          pvp: progressWithLevel(11),
        },
      })
    );
    supabaseContext.user.id = null;
    supabaseContext.user.loggedIn = false;
    resetTarkovStoreForSessionTransition('user-1', 'logout');
    store.$patch((state) => {
      state.pvp.level = 4;
    });
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: preservedTimestamp + 5000,
        _userId: null,
        data: store.$state,
      })
    );
    supabaseContext.user.id = 'user-1';
    supabaseContext.user.loggedIn = true;
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithLevel(1),
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
      error: null,
    });
    await initializeTarkovSync();
    expect(store.pvp.level).toBe(11);
    expect(getLastSyncPayload().p_modes.pvp).toEqual(expect.objectContaining({ level: 11 }));
  });
  it('restores a legacy unscoped snapshot after logout resets the store', async () => {
    const store = useTarkovStore();
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        ...defaultState,
        pvp: progressWithLevel(11),
      })
    );
    supabaseContext.user.id = null;
    supabaseContext.user.loggedIn = false;
    store.$patch((state) => {
      state.pvp.level = 42;
    });
    resetTarkovStoreForSessionTransition('user-1', 'logout');
    const restoredSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || '{}');
    expect(store.pvp.level).toBe(1);
    expect(restoredSnapshot._userId).toBeUndefined();
    expect(restoredSnapshot.pvp?.level).toBe(11);
  });
  it('shows unsaved toast when in-memory progress has no persistent local snapshot', async () => {
    setLocalProgress();
    await initializeTarkovSync();
    expect(showLocalIgnored).toHaveBeenCalledWith('unsaved');
  });
  it('shows guest toast when guest local progress exists but cloud data is present', async () => {
    setLocalProgress(6);
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        data: useTarkovStore().$state,
      })
    );
    await initializeTarkovSync();
    expect(showLocalIgnored).toHaveBeenCalledWith('guest');
  });
  it('handles malformed local progress payload without showing local-ignored toast', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, '{malformed');
    await initializeTarkovSync();
    expect(showLocalIgnored).not.toHaveBeenCalled();
  });
  it('falls back to remote sync when localStorage reads throw', async () => {
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      if (key === STORAGE_KEYS.progress) {
        throw new Error('storage disabled');
      }
      return null;
    });
    await expect(initializeTarkovSync()).resolves.toBeUndefined();
    expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
    expect(showLocalIgnored).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      `[TarkovStore] Failed to read localStorage key "${STORAGE_KEYS.progress}":`,
      expect.any(Error)
    );
    getItemSpy.mockRestore();
  });
  it('logs warning when showing local-ignored toast fails', async () => {
    showLocalIgnored.mockImplementationOnce(() => {
      throw new Error('toast failed');
    });
    setLocalProgress();
    await initializeTarkovSync();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[TarkovStore] Could not show toast notification:',
      expect.any(Error)
    );
  });
  it('logs warning when local ownership metadata cannot be persisted', async () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        data: useTarkovStore().$state,
      })
    );
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === STORAGE_KEYS.progress) {
        throw new Error('quota exceeded');
      }
      return originalSetItem(key, value);
    });
    await initializeTarkovSync();
    expect(loggerMock.error).toHaveBeenCalledWith(
      `[TarkovStore] Failed to write localStorage key "${STORAGE_KEYS.progress}":`,
      expect.any(Error)
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[TarkovStore] Could not persist local ownership metadata'
    );
    setItemSpy.mockRestore();
  });
  it('prefers newer owned local progress and upserts it to Supabase', async () => {
    setLocalProgress(10);
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: useTarkovStore().$state,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithLevel(1),
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
      error: null,
    });
    await initializeTarkovSync();
    expect(getLastSyncPayload().p_modes.pvp).toEqual(expect.objectContaining({ level: 10 }));
  });
  it('preserves item-only local progress over older remote data on refresh', async () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: {
          ...defaultState,
          pvp: progressWithItemCounts(),
        },
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithLevel(1),
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
      error: null,
    });
    const store = useTarkovStore();
    await initializeTarkovSync();
    expect(store.pvp.taskObjectives['objective-1']).toEqual({
      complete: false,
      count: 2,
    });
    expect(store.pvp.hideoutParts['part-1']).toEqual({
      complete: false,
      count: 1,
    });
    expect(getLastSyncPayload().p_modes.pvp).toEqual(
      expect.objectContaining({
        taskObjectives: {
          'objective-1': {
            complete: false,
            count: 2,
          },
        },
        hideoutParts: {
          'part-1': {
            complete: false,
            count: 1,
          },
        },
      })
    );
  });
  it('merges local startup progress with remote higher-epoch resets before syncing', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.currentGameMode = 'pve';
      state.pvp = {
        ...state.pvp,
        level: 42,
        progressEpoch: 2,
        taskCompletions: {
          'task-old': {
            complete: true,
            failed: false,
            timestamp: 1000,
          },
        },
      };
      state.pve = {
        ...state.pve,
        level: 8,
        progressEpoch: 0,
        taskCompletions: {
          'task-new': {
            complete: true,
            failed: false,
            timestamp: 2000,
          },
        },
      };
    });
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: store.$state,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        current_game_mode: 'pvp',
        pvp_data: {
          ...progressWithLevel(1),
          level: 1,
          progressEpoch: 3,
        },
        pve_data: {
          ...progressWithLevel(1),
          level: 1,
          progressEpoch: 0,
        },
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
      error: null,
    });
    await initializeTarkovSync();
    expect(getLastSyncPayload()).toEqual(
      expect.objectContaining({
        p_current_game_mode: 'pve',
        p_modes: expect.objectContaining({
          pvp: expect.objectContaining({
            level: 1,
            progressEpoch: 3,
          }),
          pve: expect.objectContaining({
            level: 8,
            progressEpoch: 0,
          }),
          seasonal: expect.objectContaining({
            level: 1,
          }),
        }),
      })
    );
    expect(store.pvp.level).toBe(1);
    expect(store.pvp.progressEpoch).toBe(3);
    expect(store.pve.level).toBe(8);
    expect(store.currentGameMode).toBe('pve');
  });
  it('keeps newer remote clears when the local cache is older and the epoch is unchanged', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.currentGameMode = 'pvp';
      state.pvp = {
        ...state.pvp,
        taskObjectives: {
          'objective-1': {
            complete: true,
            count: 3,
            timestamp: 1000,
          },
        },
      };
    });
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.parse('2026-02-01T00:00:00.000Z'),
        _userId: 'user-1',
        data: store.$state,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: {
          ...progressWithLevel(1),
          taskObjectives: {
            'objective-1': {
              complete: false,
            },
          },
        },
        updated_at: '2026-02-22T12:00:00.000Z',
      }),
      error: null,
    });
    await initializeTarkovSync();
    expect(rpc).not.toHaveBeenCalled();
    expect(store.pvp.taskObjectives['objective-1']).toEqual({
      complete: false,
    });
  });
  it('preserves remote storyline progress when a newer local snapshot has no storyline data', async () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.parse('2026-03-01T00:00:00.000Z'),
        _userId: 'user-1',
        data: structuredClone(defaultState),
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithStoryObjective(true, 2000),
        updated_at: '2026-02-22T12:00:00.000Z',
      }),
      error: null,
    });
    const store = useTarkovStore();
    await initializeTarkovSync();
    expect(rpc).not.toHaveBeenCalled();
    expect(store.pvp.storyChapters['chapter-1']?.objectives?.['objective-1']).toEqual({
      complete: true,
      timestamp: 2000,
    });
  });
  it('skips upsert when local and remote progress scores are equal', async () => {
    setLocalProgress(10);
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: useTarkovStore().$state,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithLevel(10),
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
      error: null,
    });
    await initializeTarkovSync();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rewrites sanitized progress locally and remotely when deprecated tarkov.dev payloads remain', async () => {
    const legacyPersistedState = {
      ...structuredClone(defaultState),
      pvp: withLegacyTarkovDevProfile(progressWithLevel(1), 12345),
      pve: withLegacyTarkovDevProfile(progressWithLevel(1), 67890),
    };
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.parse('2026-02-01T00:00:00.000Z'),
        _userId: 'user-1',
        data: legacyPersistedState,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: withLegacyTarkovDevProfile(progressWithLevel(7), 12345),
        pve_data: withLegacyTarkovDevProfile(progressWithLevel(3), 67890),
      }),
      error: null,
    });
    const store = useTarkovStore();
    await initializeTarkovSync();
    const persistedSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || '{}') as {
      data?: typeof defaultState;
    };
    expect(rpc).toHaveBeenCalled();
    const lastSyncPayload = getLastSyncPayload();
    expect(lastSyncPayload.p_modes.pvp).not.toHaveProperty('tarkovDevProfile');
    expect(lastSyncPayload.p_modes.pve).not.toHaveProperty('tarkovDevProfile');
    expect(persistedSnapshot.data?.pvp).not.toHaveProperty('tarkovDevProfile');
    expect(persistedSnapshot.data?.pve).not.toHaveProperty('tarkovDevProfile');
    expect(store.pvp).not.toHaveProperty('tarkovDevProfile');
    expect(store.pve).not.toHaveProperty('tarkovDevProfile');
    expect(store.pvp.level).toBe(7);
    expect(store.pve.level).toBe(3);
  });
  it('aborts initialization when owned-local upsert fails', async () => {
    setLocalProgress(10);
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: useTarkovStore().$state,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithLevel(1),
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
      error: null,
    });
    rpc.mockResolvedValueOnce({
      error: { message: 'upsert failed' },
    });
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
  });
  it('migrates persisted local progress when remote row is missing', async () => {
    setLocalProgress(7);
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: useTarkovStore().$state,
      })
    );
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    });
    await initializeTarkovSync();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
    expect(showLoadFailed).not.toHaveBeenCalled();
  });
  it('migrates persisted item-only progress when remote row is missing', async () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: {
          ...defaultState,
          pvp: progressWithItemCounts(),
        },
      })
    );
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    });
    const store = useTarkovStore();
    await initializeTarkovSync();
    expect(store.pvp.taskObjectives['objective-1']).toEqual({
      complete: false,
      count: 2,
    });
    expect(store.pvp.hideoutParts['part-1']).toEqual({
      complete: false,
      count: 1,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(getLastSyncPayload().p_modes.pvp).toEqual(
      expect.objectContaining({
        taskObjectives: {
          'objective-1': {
            complete: false,
            count: 2,
          },
        },
        hideoutParts: {
          'part-1': {
            complete: false,
            count: 1,
          },
        },
      })
    );
    expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
  });
  it('delays sync startup for empty new users until progress exists', async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    });
    await initializeTarkovSync();
    expect(useSupabaseSyncMock).not.toHaveBeenCalled();
    const store = useTarkovStore();
    store.$patch((state) => {
      state.pvp.level = 2;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
  });
  it('persists manual-only progress that starts a deferred subscription', async () => {
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows found' } });
    await initializeTarkovSync();
    const store = useTarkovStore();
    store.addManualActivityEntries([
      { id: 'legacy-only', timestamp: 1000, type: 'task', action: 'complete', title: 'Legacy' },
    ]);
    await nextTick();
    expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
    expect(syncInitialState).toHaveBeenCalledTimes(1);
    const options = useSupabaseSyncMock.mock.calls.at(-1)?.[0] as {
      transform: (state: typeof store.$state) => { pvp_data: UserProgressData } | null;
    };
    expect(options.transform(store.$state)?.pvp_data.manualActivityHistory?.[0]?.id).toBe(
      'legacy-only'
    );
    store.clearManualActivityHistory();
    expect(options.transform(store.$state)?.pvp_data.manualActivityEpoch).toBe(1);
  });
  it.each(['failure', 'rejection', 'session-reset', 'persistent-failure'])(
    'bounds the initial progress retry and respects session changes: %s',
    async (outcome) => {
      single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      await initializeTarkovSync();
      vi.useFakeTimers();
      try {
        if (outcome === 'rejection') syncInitialState.mockRejectedValueOnce(new Error('offline'));
        else syncInitialState.mockResolvedValueOnce(null);
        if (outcome === 'persistent-failure') syncInitialState.mockResolvedValue(null);
        useTarkovStore().addManualActivityEntries([
          { id: 'initial', timestamp: 1000, type: 'task', action: 'complete', title: 'Initial' },
        ]);
        await nextTick();
        expect(syncInitialState).toHaveBeenCalledTimes(1);
        if (outcome === 'session-reset') resetTarkovSync('session changed');
        await vi.advanceTimersByTimeAsync(5000);
        expect(syncInitialState).toHaveBeenCalledTimes(outcome === 'session-reset' ? 1 : 2);
      } finally {
        vi.useRealTimers();
      }
    }
  );
  it('shows merge toast for realtime conflicts when no API update metadata is present', async () => {
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithTaskState('task-1', false),
      }),
      error: null,
    });
    await initializeTarkovSync();
    const callback = getModeProgressCallback();
    expect(callback).toBeTypeOf('function');
    showApiUpdated.mockClear();
    showProgressMerged.mockClear();
    callback?.({
      new: {
        game_mode: 'pvp',
        progress_data: progressWithTaskState('task-1', true),
        season_number: 0,
        updated_at: '2026-02-22T12:00:00.000Z',
      },
      old: {},
    });
    expect(showApiUpdated).not.toHaveBeenCalled();
    expect(showProgressMerged).toHaveBeenCalledWith(1);
  });
  it('ignores realtime updates that are likely self-origin and unchanged', async () => {
    setLocalProgress(10);
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: useTarkovStore().$state,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithLevel(1),
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
      error: null,
    });
    await initializeTarkovSync();
    const callback = getRealtimeCallback();
    pauseSync.mockClear();
    showApiUpdated.mockClear();
    showProgressMerged.mockClear();
    callback?.({
      new: {
        updated_at: new Date().toISOString(),
      },
      old: {},
    });
    expect(pauseSync).not.toHaveBeenCalled();
    expect(showApiUpdated).not.toHaveBeenCalled();
    expect(showProgressMerged).not.toHaveBeenCalled();
  });
  it('ignores unchanged realtime updates even when they are not self-origin', async () => {
    await initializeTarkovSync();
    const callback = getRealtimeCallback();
    pauseSync.mockClear();
    showApiUpdated.mockClear();
    showProgressMerged.mockClear();
    callback?.({
      new: {
        updated_at: '2000-01-01T00:00:00.000Z',
      },
      old: {},
    });
    expect(pauseSync).not.toHaveBeenCalled();
    expect(showApiUpdated).not.toHaveBeenCalled();
    expect(showProgressMerged).not.toHaveBeenCalled();
  });
  it('counts objective/module/part conflicts in merge toast', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.pvp.taskObjectives = { 'obj-1': { complete: false, count: 1 } };
      state.pvp.hideoutModules = { 'mod-1': { complete: false } };
      state.pvp.hideoutParts = { 'part-1': { complete: false, count: 1 } };
    });
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: store.$state,
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: cloneProgress(store.pvp),
      }),
      error: null,
    });
    await initializeTarkovSync();
    const callback = getModeProgressCallback();
    showProgressMerged.mockClear();
    callback?.({
      new: {
        game_mode: 'pvp',
        progress_data: {
          ...cloneProgress(store.pvp),
          taskObjectives: { 'obj-1': { complete: false, count: 2 } },
          hideoutModules: { 'mod-1': { complete: true } },
          hideoutParts: { 'part-1': { complete: false, count: 2 } },
        },
        season_number: 0,
        updated_at: '2000-01-01T00:00:00.000Z',
      },
      old: {},
    });
    expect(showProgressMerged).toHaveBeenCalledWith(3);
  });
  it('processes API updates for both modes in one payload and suppresses merge toast', async () => {
    single.mockResolvedValue({
      data: createRemoteRow({
        pve_data: progressWithTaskState('task-2', false),
        pvp_data: progressWithTaskState('task-1', false),
      }),
      error: null,
    });
    await initializeTarkovSync();
    const callback = getModeProgressCallback();
    expect(callback).toBeTypeOf('function');
    showApiUpdated.mockClear();
    showProgressMerged.mockClear();
    const now = Date.now();
    callback?.({
      new: {
        game_mode: 'pvp',
        progress_data: {
          ...progressWithTaskState('task-1', true),
          lastApiUpdate: {
            id: `api-pvp-${now}`,
            at: now,
            source: 'api',
            tasks: [{ id: 'task-1', state: 'completed' }],
          },
        },
        season_number: 0,
        updated_at: new Date(now).toISOString(),
      },
      old: {},
    });
    callback?.({
      new: {
        game_mode: 'pve',
        progress_data: {
          ...progressWithTaskState('task-2', true),
          lastApiUpdate: {
            id: `api-pve-${now}`,
            at: now,
            source: 'api',
            tasks: [{ id: 'task-2', state: 'completed' }],
          },
        },
        season_number: 0,
        updated_at: new Date(now).toISOString(),
      },
      old: {},
    });
    expect(showApiUpdated).toHaveBeenCalledTimes(2);
    expect(showProgressMerged).not.toHaveBeenCalled();
  });
  it('does not re-show the same local-ignored reason across repeated failed initialization attempts', async () => {
    setLocalProgress(5);
    single.mockResolvedValue({
      data: null,
      error: { message: 'query failed' },
    });
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    expect(showLocalIgnored).toHaveBeenCalledTimes(1);
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    expect(showLocalIgnored).toHaveBeenCalledTimes(1);
  });
  it('retries a transient deferred legacy read for an empty normalized placeholder', async () => {
    modeProgressResult.data = [{ game_mode: 'pvp', season_number: 0, progress_data: {} }];
    const row = createRemoteRow({ pvp_data: progressWithTaskState('legacy-task', true) });
    single
      .mockResolvedValueOnce({ data: { ...row, pvp_data: null, pve_data: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'temporary' } })
      .mockResolvedValue({ data: row, error: null });
    await initializeTarkovSync();
    expect(single.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(useTarkovStore().pvp.taskCompletions['legacy-task']?.complete).toBe(true);
  });
  it('deduplicates repeated API update toast payloads by update id', async () => {
    const now = Date.now();
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithTaskState('task-1', false),
      }),
      error: null,
    });
    await initializeTarkovSync();
    const callback = getModeProgressCallback();
    expect(callback).toBeTypeOf('function');
    const payload = {
      game_mode: 'pvp',
      progress_data: {
        ...progressWithTaskState('task-1', true),
        lastApiUpdate: {
          id: 'duplicate-api-id',
          at: now,
          source: 'api',
          tasks: [{ id: 'task-1', state: 'completed' }],
        },
      },
      season_number: 0,
      updated_at: new Date(now).toISOString(),
    };
    showApiUpdated.mockClear();
    showProgressMerged.mockClear();
    callback?.({
      new: payload,
      old: {},
    });
    callback?.({
      new: {
        ...payload,
        updated_at: new Date(now + 1000).toISOString(),
      },
      old: {},
    });
    expect(showApiUpdated).toHaveBeenCalledTimes(1);
    expect(showProgressMerged).not.toHaveBeenCalled();
  });
  it('clears API update dedupe state on sync reset', async () => {
    const now = Date.now();
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithTaskState('task-1', false),
      }),
      error: null,
    });
    await initializeTarkovSync();
    let callback = getModeProgressCallback();
    expect(callback).toBeTypeOf('function');
    const payload = {
      game_mode: 'pvp',
      progress_data: {
        ...progressWithTaskState('task-1', true),
        lastApiUpdate: {
          id: 'reset-dedupe-id',
          at: now,
          source: 'api',
          tasks: [{ id: 'task-1', state: 'completed' }],
        },
      },
      season_number: 0,
      updated_at: new Date(now).toISOString(),
    };
    showApiUpdated.mockClear();
    callback?.({
      new: payload,
      old: {},
    });
    expect(showApiUpdated).toHaveBeenCalledTimes(1);
    resetTarkovSync('test api dedupe reset');
    await initializeTarkovSync();
    callback = getModeProgressCallback();
    callback?.({
      new: {
        ...payload,
        progress_data: { ...payload.progress_data, level: 2 },
        updated_at: new Date(now + 2000).toISOString(),
      },
      old: {},
    });
    expect(showApiUpdated).toHaveBeenCalledTimes(2);
  });
  it('does not rewrite authoritative mode rows from deprecated legacy payloads', async () => {
    const store = useTarkovStore();
    single.mockResolvedValue({
      data: createRemoteRow(),
      error: null,
    });
    await initializeTarkovSync();
    const callback = getRealtimeCallback();
    expect(callback).toBeTypeOf('function');
    const seasonalBefore = cloneProgress(store.seasonal);
    update.mockClear();
    callback?.({
      new: {
        current_game_mode: 'pvp',
        game_edition: 1,
        tarkov_uid: null,
        pvp_data: withLegacyTarkovDevProfile(progressWithLevel(2), 12345),
        pve_data: progressWithLevel(1),
        updated_at: '2000-01-01T00:00:00.000Z',
      },
      old: {},
    });
    await waitForBackgroundTasks();
    expect(update).not.toHaveBeenCalled();
    expect(store.seasonal).toEqual(seasonalBefore);
  });
  it('aborts initialization when post-load cleanup persistence fails', async () => {
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: withLegacyTarkovDevProfile(progressWithLevel(7), 12345),
      }),
      error: null,
    });
    rpc.mockResolvedValueOnce({
      error: { message: 'post-load cleanup failed' },
    });
    await expect(initializeTarkovSync()).rejects.toThrow('post-load cleanup failed');
    expect(useSupabaseSyncMock).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[TarkovStore] Failed to persist post-load data migration/repair:',
      expect.objectContaining({ message: 'post-load cleanup failed' })
    );
  });
  it('aborts initialization when normalized mode progress cannot be loaded', async () => {
    modeProgressResult.error = { message: 'mode progress unavailable' };
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    expect(useSupabaseSyncMock).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[TarkovStore] Could not load normalized mode progress',
      expect.objectContaining({ message: 'mode progress unavailable' })
    );
  });
  it('retries and recovers when normalized mode progress fails transiently', async () => {
    modeProgressResult.errorSequence = [{ message: 'transient mode progress error' }];
    await initializeTarkovSync();
    expect(modeProgressResult.errorSequence).toHaveLength(0);
    expect(loggerMock.debug).toHaveBeenCalledWith(
      expect.stringContaining('Retrying normalized mode progress load')
    );
    expect(loggerMock.error).not.toHaveBeenCalledWith(
      '[TarkovStore] Could not load normalized mode progress',
      expect.anything()
    );
    expect(useSupabaseSyncMock).toHaveBeenCalled();
  });
  it('persists Seasonal objective-only failed-task repairs during startup', async () => {
    metadataStoreMock.tasks = [
      {
        id: 'task-seasonal-failed',
        alternatives: [],
        failConditions: [],
        objectives: [{ id: 'objective-1', count: 3 }],
      },
    ];
    const seasonalProgress: UserProgressData = {
      ...progressWithLevel(1),
      taskCompletions: {
        'task-seasonal-failed': { complete: false, failed: true, manual: true },
      },
      taskObjectives: { 'objective-1': { complete: true, count: 3 } },
    };
    modeProgressResult.data = [
      {
        game_mode: 'seasonal',
        season_number: ACTIVE_SEASON_NUMBER,
        progress_data: seasonalProgress,
      },
    ];
    const store = useTarkovStore();
    await initializeTarkovSync();
    expect(store.seasonal.taskObjectives['objective-1']).toMatchObject({
      complete: false,
      count: 0,
    });
    expect(store.seasonal.taskCompletions['task-seasonal-failed']).toMatchObject({
      failed: true,
      manual: true,
    });
    const syncedSeasonal = getLastSyncPayload().p_modes.seasonal as UserProgressData;
    expect(syncedSeasonal.taskObjectives['objective-1']).toMatchObject({
      complete: false,
      count: 0,
    });
    expect(syncedSeasonal.taskCompletions['task-seasonal-failed']).toMatchObject({
      failed: true,
      manual: true,
    });
  });
  it('preserves local progress when online profile reset fails', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.pvp.level = 42;
    });
    rpc.mockResolvedValueOnce({ error: { message: 'reset failed' } });
    await store.resetOnlineProfile();
    expect(store.pvp.level).toBe(42);
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Error resetting online profile:',
      expect.objectContaining({ message: 'Failed to reset online profile: reset failed' })
    );
  });
  it('shows load_failed and aborts sync for multi-provider account with no progress row', async () => {
    supabaseContext.user.providers = ['discord', 'google'];
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    });
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    expect(showLoadFailed).toHaveBeenCalledTimes(1);
    expect(useSupabaseSyncMock).not.toHaveBeenCalled();
  });
  // ---------------------------------------------------------------------------
  // Approved race: a startup read that stays pending across an auth transition.
  // A's continuation must not patch the store/persisted envelope after the
  // transition, and must not install or replace sync/listener machinery.
  // ---------------------------------------------------------------------------
  describe('stale startup initialization continued across auth transitions', () => {
    const seedSessionA = () =>
      seedOwnedEnvelope('user-1', {
        pvp: compoundProgress(10, 'task-local-a'),
        pve: progressWithLevel(7),
      });
    const releaseStaleRead = (
      deferred: ReturnType<typeof createDeferredRead>,
      result: SupabaseRowResult
    ) => {
      modeProgressResult.data = [
        modeRow('pvp', compoundProgress(10, 'task-stale-a')),
        modeRow('pve', progressWithLevel(3)),
      ];
      deferred.resolve(result);
    };
    it('leaves the switched-to session untouched when the previous session read resolves late', async () => {
      seedSessionA();
      const staleRead = createDeferredRead();
      single.mockImplementationOnce(() => staleRead.promise);
      const staleInit = initializeTarkovSync();
      expect(getUserIdFilters()).toEqual(['user-1']);
      switchSession('user-1', 'user-2');
      single.mockResolvedValue({
        data: createRemoteRow({
          updated_at: sessionClock(2_000),
          user_id: 'user-2',
          pvp_data: compoundProgress(33, 'task-b'),
          pve_data: progressWithLevel(11),
        }),
        error: null,
      });
      await initializeTarkovSync();
      await settleBackgroundWork();
      const store = useTarkovStore();
      expect(store.pvp.taskCompletions['task-b']?.complete).toBe(true);
      expect(store.pvp.level).toBe(33);
      expect(readPersistedEnvelope()._userId).toBe('user-2');
      const baseline = watchSessionActivity();
      releaseStaleRead(staleRead, {
        data: createRemoteRow({ user_id: 'user-1', updated_at: sessionClock(9_000) }),
        error: null,
      });
      await staleInit.catch(() => undefined);
      await settleBackgroundWork();
      expectNoFollowOnSessionActivity(baseline, watchSessionActivity());
      expect(useTarkovStore().pvp.level).toBe(33);
      expect(useTarkovStore().pve.level).toBe(11);
      expect(useTarkovStore().pvp.taskCompletions['task-b']?.complete).toBe(true);
      expect(useTarkovStore().pvp.taskCompletions['task-stale-a']).toBeUndefined();
      const envelope = readPersistedEnvelope();
      expect(envelope._userId).toBe('user-2');
      expect(envelope.data?.pvp?.taskCompletions?.['task-b']?.complete).toBe(true);
      expect(showLocalIgnored).not.toHaveBeenCalled();
      expect(showLoadFailed).not.toHaveBeenCalled();
    });
    it('keeps the signed-out store and protected snapshot untouched when a pending read resolves late', async () => {
      seedSessionA();
      const staleRead = createDeferredRead();
      single.mockImplementationOnce(() => staleRead.promise);
      const staleInit = initializeTarkovSync();
      expect(getUserIdFilters()).toEqual(['user-1']);
      switchSession('user-1', null, 'logout');
      expect(useTarkovStore().pvp.taskCompletions['task-local-a']).toBeUndefined();
      expect(readPersistedEnvelope()._userId).toBe('user-1');
      const baseline = watchSessionActivity();
      releaseStaleRead(staleRead, {
        data: createRemoteRow({ user_id: 'user-1', updated_at: sessionClock(9_000) }),
        error: null,
      });
      await staleInit.catch(() => undefined);
      await settleBackgroundWork();
      expectNoFollowOnSessionActivity(baseline, watchSessionActivity());
      expect(useTarkovStore().pvp.level).toBe(1);
      expect(useTarkovStore().pvp.taskCompletions['task-stale-a']).toBeUndefined();
      const envelope = readPersistedEnvelope();
      expect(envelope._userId).toBe('user-1');
      expect(envelope._timestamp).toBe(SESSION_BASE_MS);
      expect(showLocalIgnored).not.toHaveBeenCalled();
      expect(showLoadFailed).not.toHaveBeenCalled();
    });
    it('does not continue a stale initial read after a newer session for the same identity ran', async () => {
      seedSessionA();
      const staleLegacyRead = createDeferredRead();
      single
        .mockResolvedValueOnce({
          data: createRemoteRow({
            user_id: 'user-1',
            updated_at: sessionClock(1_000),
            pvp_data: null,
            pve_data: null,
          }),
          error: null,
        })
        .mockImplementationOnce(() => staleLegacyRead.promise);
      const staleInit = initializeTarkovSync();
      await settleBackgroundWork();
      switchSession('user-1', 'user-2');
      single.mockResolvedValue({
        data: createRemoteRow({
          updated_at: sessionClock(2_000),
          user_id: 'user-2',
          pvp_data: compoundProgress(33, 'task-b'),
          pve_data: progressWithLevel(11),
        }),
        error: null,
      });
      await initializeTarkovSync();
      await settleBackgroundWork();
      switchSession('user-2', 'user-1');
      const freshRow = createRemoteRow({
        updated_at: sessionClock(30_000),
        user_id: 'user-1',
        pvp_data: compoundProgress(50, 'task-return-second'),
        pve_data: progressWithLevel(12),
      });
      single
        .mockResolvedValue({ data: freshRow, error: null })
        .mockResolvedValueOnce({ data: freshRow, error: null })
        .mockResolvedValueOnce({ data: freshRow, error: null });
      await initializeTarkovSync();
      await settleBackgroundWork();
      const store = useTarkovStore();
      expect(store.pvp.taskCompletions['task-return-second']?.complete).toBe(true);
      expect(store.pvp.level).toBe(50);
      const baseline = watchSessionActivity();
      staleLegacyRead.resolve({
        data: createRemoteRow({
          user_id: 'user-1',
          updated_at: sessionClock(1_000),
          pvp_data: compoundProgress(10, 'task-stale-a'),
          pve_data: progressWithLevel(3),
        }),
        error: null,
      });
      await staleInit.catch(() => undefined);
      await settleBackgroundWork();
      expectNoFollowOnSessionActivity(baseline, watchSessionActivity());
      expect(store.pvp.level).toBe(50);
      expect(store.pve.level).toBe(12);
      expect(store.pvp.taskCompletions['task-return-second']?.complete).toBe(true);
      expect(store.pvp.taskCompletions['task-stale-a']).toBeUndefined();
      const envelope = readPersistedEnvelope();
      expect(envelope._userId).toBe('user-1');
      expect(envelope.data?.pvp?.level).toBe(50);
      expect(showLocalIgnored).not.toHaveBeenCalled();
      expect(showLoadFailed).not.toHaveBeenCalled();
    });
    it('does not surface a stale failed read as the active session load failure', async () => {
      seedSessionA();
      const staleRead = createDeferredRead();
      single.mockImplementationOnce(() => staleRead.promise);
      const staleInit = initializeTarkovSync();
      switchSession('user-1', 'user-2');
      single.mockResolvedValue({
        data: createRemoteRow({
          updated_at: sessionClock(2_000),
          user_id: 'user-2',
          pvp_data: compoundProgress(33, 'task-b'),
          pve_data: progressWithLevel(11),
        }),
        error: null,
      });
      await initializeTarkovSync();
      await settleBackgroundWork();
      const baseline = watchSessionActivity();
      staleRead.resolve({
        data: null,
        error: { message: 'stale row read failed' },
      });
      await staleInit.catch(() => undefined);
      await settleBackgroundWork();
      expect(loggerMock.error).not.toHaveBeenCalledWith(
        '[TarkovStore] Error loading data from Supabase:',
        expect.objectContaining({ message: 'stale row read failed' })
      );
      expect(loggerMock.error).not.toHaveBeenCalledWith(
        '[TarkovStore] Initial load failed; sync not started'
      );
      expect(showLoadFailed).not.toHaveBeenCalled();
      expectNoFollowOnSessionActivity(baseline, watchSessionActivity());
      expect(useTarkovStore().pvp.taskCompletions['task-b']?.complete).toBe(true);
      expect(useTarkovStore().pvp.level).toBe(33);
      expect(readPersistedEnvelope()._userId).toBe('user-2');
    });
    it('leaves the switched-to session untouched when a deferred normalized read resolves late', async () => {
      seedSessionA();
      single.mockResolvedValue({
        data: createRemoteRow({ user_id: 'user-1', updated_at: sessionClock(9_000) }),
        error: null,
      });
      const staleModeRead = createDeferredModeRead();
      staleModeRead.begin();
      const staleInit = initializeTarkovSync();
      await settleBackgroundWork();
      // The row read and the deferred normalized read were both issued for user-1.
      expect(getUserIdFilters()).toEqual(['user-1', 'user-1']);
      switchSession('user-1', 'user-2');
      single.mockResolvedValue({
        data: createRemoteRow({
          updated_at: sessionClock(2_000),
          user_id: 'user-2',
          pvp_data: compoundProgress(33, 'task-b'),
          pve_data: progressWithLevel(11),
        }),
        error: null,
      });
      await initializeTarkovSync();
      await settleBackgroundWork();
      const baseline = watchSessionActivity();
      staleModeRead.release([
        modeRow('pvp', compoundProgress(10, 'task-stale-a')),
        modeRow('pve', progressWithLevel(3)),
      ]);
      await staleInit.catch(() => undefined);
      await settleBackgroundWork();
      expectNoFollowOnSessionActivity(baseline, watchSessionActivity());
      expect(useTarkovStore().pvp.level).toBe(33);
      expect(useTarkovStore().pve.level).toBe(11);
      expect(useTarkovStore().pvp.taskCompletions['task-stale-a']).toBeUndefined();
      const envelope = readPersistedEnvelope();
      expect(envelope._userId).toBe('user-2');
      expect(envelope.data?.pvp?.level).toBe(33);
      expect(showLocalIgnored).not.toHaveBeenCalled();
      expect(showLoadFailed).not.toHaveBeenCalled();
    });
    it.each([
      { boundary: 'successful retry', retry: true, error: null },
      {
        boundary: 'freshness compatibility fallback',
        retry: false,
        error: { code: '42703', message: 'column progress_updated_at does not exist' },
      },
    ])('fences normalized follow-on reads after a stale $boundary', async ({ retry, error }) => {
      seedSessionA();
      const deferred = createDeferredModeRead();
      if (retry) modeProgressResult.errorSequence = [{ message: 'temporary read failure' }];
      else deferred.begin();
      const pending = initializeTarkovSync();
      await settleBackgroundWork();
      if (retry) deferred.begin();
      await vi.waitFor(() => expect(getUserIdFilters()).toHaveLength(retry ? 3 : 2), {
        timeout: 2000,
      });
      switchSession('user-1', 'user-2');
      single.mockResolvedValue({
        data: createRemoteRow({ user_id: 'user-2', pvp_data: compoundProgress(33, 'task-b') }),
        error: null,
      });
      await initializeTarkovSync();
      await settleBackgroundWork();
      const baseline = watchSessionActivity();
      deferred.release([], error);
      await pending;
      await settleBackgroundWork();
      expectNoFollowOnSessionActivity(baseline, watchSessionActivity());
      expect(useTarkovStore().pvp.level).toBe(33);
    });
    it('leaves real persisted storage untouched when a superseded merge write settles late', async () => {
      // The race the non-plugin harness cannot observe: the persisted-state
      // plugin serializes every state patch, so a stale continuation's post-ack
      // patch would write another account's progress into actual storage.
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      seedSessionA();
      // A row without an account clock keeps the owned local progress as the
      // merge winner, so the initial merge write actually dispatches.
      const staleOwnerRow = createRemoteRow({ user_id: 'user-1', updated_at: null });
      const staleRead = createDeferredRead();
      single.mockImplementationOnce(() => staleRead.promise);
      single.mockResolvedValue({ data: staleOwnerRow, error: null });
      const staleMergeWrite = Promise.withResolvers<{
        error: { code?: string; message: string } | null;
      }>();
      rpc.mockImplementationOnce(() => staleMergeWrite.promise as ReturnType<typeof rpc>);
      const staleInit = initializeTarkovSync();
      // Resolve the owner's read while it still owns the session, so the merge
      // write itself dispatches and then suspends as the in-flight patch owner...
      staleRead.resolve({
        data: staleOwnerRow,
        error: null,
      });
      await settleBackgroundWork();
      expect(rpc).toHaveBeenCalledTimes(1);
      switchSession('user-1', 'user-2');
      single.mockResolvedValue({
        data: createRemoteRow({
          updated_at: sessionClock(2_000),
          user_id: 'user-2',
          pvp_data: compoundProgress(33, 'task-b'),
          pve_data: progressWithLevel(11),
        }),
        error: null,
      });
      await initializeTarkovSync();
      await settleBackgroundWork();
      await nextTick();
      const baseline = watchSessionActivity();
      staleMergeWrite.resolve({ error: null });
      await staleInit.catch(() => undefined);
      await settleBackgroundWork();
      await nextTick();
      expectNoFollowOnSessionActivity(baseline, watchSessionActivity());
      const store = useTarkovStore();
      expect(store.pvp.level).toBe(33);
      expect(store.pve.level).toBe(11);
      expect(store.pvp.taskCompletions['task-b']?.complete).toBe(true);
      expect(store.pvp.taskCompletions['task-stale-a']).toBeUndefined();
      const envelope = readPersistedEnvelope();
      expect(envelope._userId).toBe('user-2');
      expect(envelope.data?.pvp?.level).toBe(33);
      expect(envelope.data?.pvp?.taskCompletions?.['task-stale-a']).toBeUndefined();
      expect(showLocalIgnored).not.toHaveBeenCalled();
      expect(showLoadFailed).not.toHaveBeenCalled();
    });
  });
});
