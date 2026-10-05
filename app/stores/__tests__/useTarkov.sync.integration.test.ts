// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { defaultState } from '@/stores/progressState';
import {
  isAccountRecoveryRetentionBlocked,
  readAccountRecoveryCopy,
  resetAccountRecoveryRetentionBlock,
} from '@/stores/tarkov/accountRecovery';
import {
  clearActiveProgressStorage,
  setActiveProgressWritesBlocked,
  progressPersistStorage,
  progressStorageSerializer,
  flushActiveProgressWrites,
  parsePersistedProgressState,
  persistActiveProgressValue,
} from '@/stores/tarkov/localStorage';
import { syncProgressState, type ProgressRpcClient } from '@/stores/tarkov/progressPersistence';
import { listSupersededProgressCopies } from '@/stores/tarkov/supersededProgress';
import {
  initializeTarkovSync,
  resetTarkovStoreForSessionTransition,
  resetTarkovSync,
  preserveUnsavedSessionProgress,
  useTarkovStore,
} from '@/stores/useTarkov';
import { ACTIVE_SEASON_NUMBER, GAME_MODE_VALUES, getGameModeSeasonNumber } from '@/utils/constants';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { mergeTaskAvailability } from '@/utils/taskAvailabilityConfirmation';
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
  resetModeFixtures,
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
  select,
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
  type RpcResult = { data?: unknown; error: SupabaseErrorLike };
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
  type ModeFixtureRow = {
    game_mode: string;
    progress_data: unknown;
    season_number: number;
    updated_at?: string;
    progress_updated_at?: string | null;
  };
  let fixtureModeRows: ModeFixtureRow[] = [];
  let explicitModeRows: ModeFixtureRow[] | undefined;
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
  } = {
    get data() {
      return explicitModeRows ?? fixtureModeRows;
    },
    set data(rows) {
      explicitModeRows = rows;
    },
    error: null,
  };
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
    return {
      single: async () => {
        const result = await single();
        // Account fixtures describe a cloud snapshot; transport their mode payloads
        // through normalized rows unless the test explicitly supplies rows (even []).
        fixtureModeRows = result.data
          ? (['pvp', 'pve'] as const).flatMap((mode) => {
              const progress = result.data?.[`${mode}_data`];
              return progress
                ? [
                    {
                      game_mode: mode,
                      season_number: 0,
                      progress_data: progress,
                      progress_updated_at: result.data?.updated_at ?? null,
                    },
                  ]
                : [];
            })
          : [];
        return result;
      },
    };
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
    resetModeFixtures: () => {
      explicitModeRows = undefined;
      fixtureModeRows = [];
    },
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
    select,
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
    showTarkovUidConflict: vi.fn(),
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
const switchSession = async (
  previousUserId: string | null,
  nextUserId: string | null,
  reason = 'user switched'
) => {
  supabaseContext.user.id = nextUserId;
  supabaseContext.user.loggedIn = nextUserId !== null;
  await resetTarkovStoreForSessionTransition(previousUserId, reason);
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
  it.each(
    GAME_MODE_VALUES.flatMap((mode) => [null, 3, 9].map((pendingLevel) => ({ mode, pendingLevel })))
  )(
    'keeps API level decreases durable with the real controller: $mode, pending=$pendingLevel',
    async ({ mode, pendingLevel }) => {
      const actual = await vi.importActual<typeof import('@/composables/supabase/useSupabaseSync')>(
        '@/composables/supabase/useSupabaseSync'
      );
      useSupabaseSyncMock.mockImplementation(
        (options) =>
          actual.useSupabaseSync(
            options as Parameters<typeof actual.useSupabaseSync>[0]
          ) as unknown as ReturnType<typeof useSupabaseSyncMock>
      );
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      await initializeTarkovSync();
      const store = useTarkovStore();
      const controller = useSupabaseSyncMock.mock.results.at(-1)?.value as ReturnType<
        typeof actual.useSupabaseSync
      >;
      const remoteTime = Date.now();
      const emit = (level: number, seconds: number) => {
        const callback = getModeProgressCallback();
        expect(callback).toBeTypeOf('function');
        callback!({
          new: {
            game_mode: mode,
            season_number: getGameModeSeasonNumber(mode),
            progress_data: { ...progressWithLevel(level), progressEpoch: 1 },
            updated_at: new Date(remoteTime + seconds * 1000).toISOString(),
            progress_updated_at: new Date(remoteTime + seconds * 1000).toISOString(),
          },
          old: null,
        });
      };
      emit(7, 1);
      await nextTick();
      expect(store[mode].level).toBe(7);
      emit(2, 2);
      await nextTick();
      expect(store[mode].level).toBe(2);
      emit(7, 3);
      await nextTick();
      expect(store[mode].level).toBe(7);
      // An unrelated pending field must not make the old, clean level authoritative.
      store[mode].displayName = 'pending name';
      if (pendingLevel !== null) store[mode].level = pendingLevel;
      await nextTick();
      emit(2, 4);
      await nextTick();
      expect(store[mode]).toMatchObject({
        level: pendingLevel ?? 2,
        displayName: 'pending name',
        progressEpoch: 1,
      });
      for (const other of GAME_MODE_VALUES.filter((candidate) => candidate !== mode)) {
        expect(store[other]).toEqual(defaultState[other]);
      }
      controller.resume();
      expect(await controller.syncToSupabase()).not.toBeNull();
      expect(getLastSyncPayload().p_modes[mode]).toMatchObject({ level: pendingLevel ?? 2 });
      expect(controller.hasPendingChanges?.()).toBe(false);
      // Once that local edit is acknowledged, a later decrease must apply too.
      emit(1, 5);
      await nextTick();
      expect(store[mode].level).toBe(1);
      store[mode].displayName = 'later edit';
      await nextTick();
      controller.resume();
      expect(await controller.syncToSupabase()).not.toBeNull();
      expect(getLastSyncPayload().p_modes[mode]).toMatchObject({ level: 1 });
      expect(controller.hasPendingChanges?.()).toBe(false);
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!);
      expect(persisted.data[mode]).toMatchObject({ level: 1, progressEpoch: 1 });
      emit(7, 1);
      expect(store[mode].level).toBe(1);
      resetTarkovSync('simulate reload after API decrease');
      const reloadedPinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(reloadedPinia);
      setActivePinia(reloadedPinia);
      modeProgressResult.data = [
        {
          game_mode: mode,
          season_number: getGameModeSeasonNumber(mode),
          progress_data: { ...progressWithLevel(1), progressEpoch: 1, displayName: 'later edit' },
          updated_at: new Date(remoteTime + 5000).toISOString(),
          progress_updated_at: new Date(remoteTime + 5000).toISOString(),
        },
      ];
      await initializeTarkovSync();
      expect(useTarkovStore()[mode]).toMatchObject({ level: 1, progressEpoch: 1 });
    }
  );
  it.each([
    { scenario: 'foreign-transaction', reset: false, owner: 'user-1', edition: 1, marker: '999' },
    { scenario: 'changed-value', reset: false, owner: 'user-1', edition: 2, marker: '100' },
    { scenario: 'session-reset', reset: true, owner: 'user-1', edition: 1, marker: '100' },
    { scenario: 'new-owner', reset: true, owner: 'user-2', edition: 1, marker: '100' },
  ])(
    'applies unrecognized metadata with the real controller: $scenario',
    async ({ reset, owner, edition, marker }) => {
      const actual = await vi.importActual<typeof import('@/composables/supabase/useSupabaseSync')>(
        '@/composables/supabase/useSupabaseSync'
      );
      useSupabaseSyncMock.mockImplementation(
        (options) =>
          actual.useSupabaseSync(
            options as Parameters<typeof actual.useSupabaseSync>[0]
          ) as unknown as ReturnType<typeof useSupabaseSyncMock>
      );
      single.mockResolvedValue({ data: createRemoteRow({ tarkov_uid: 7 }), error: null });
      await initializeTarkovSync();
      const store = useTarkovStore();
      rpc.mockResolvedValue({
        data: { tarkov_uid: 1001, metadata_write_id: '100', tarkov_uid_conflict: false },
        error: null,
      });
      store.setTarkovUid(1001);
      store.pvp.level = 2;
      await nextTick();
      await flushActiveProgressWrites();
      const controller = useSupabaseSyncMock.mock.results.at(-1)?.value as ReturnType<
        typeof actual.useSupabaseSync
      >;
      expect(await controller.syncToSupabase()).not.toBeNull();
      expect(controller.hasPendingChanges?.()).toBe(false);
      if (reset) {
        resetTarkovSync();
        supabaseContext.user.id = owner;
        single.mockResolvedValue({
          data: createRemoteRow({
            user_id: owner,
            tarkov_uid: 1001,
            pvp_data: { ...store.pvp, level: 2 },
          }),
          error: null,
        });
        rpc.mockResolvedValue({
          data: { tarkov_uid: 1001, metadata_write_id: '200', tarkov_uid_conflict: false },
          error: null,
        });
        await initializeTarkovSync();
      }
      getRealtimeCallback()?.({
        new: {
          ...createRemoteRow({
            user_id: owner,
            tarkov_uid: 7,
            game_edition: edition,
            updated_at: new Date(Date.now() + 1000).toISOString(),
          }),
          metadata_write_id: marker,
        },
        old: null,
      });
      expect(store.tarkovUid).toBe(7);
      controller.cleanup();
    }
  );
  it.each([false, true])(
    'keeps acknowledged metadata through delayed WAL with the real controller: queued=%s',
    async (queued) => {
      const actual = await vi.importActual<typeof import('@/composables/supabase/useSupabaseSync')>(
        '@/composables/supabase/useSupabaseSync'
      );
      useSupabaseSyncMock.mockImplementation(
        (options) =>
          actual.useSupabaseSync(
            options as Parameters<typeof actual.useSupabaseSync>[0]
          ) as unknown as ReturnType<typeof useSupabaseSyncMock>
      );
      single.mockResolvedValue({ data: createRemoteRow({ tarkov_uid: 7 }), error: null });
      await initializeTarkovSync();
      const store = useTarkovStore();
      const controller = useSupabaseSyncMock.mock.results.at(-1)?.value as ReturnType<
        typeof actual.useSupabaseSync
      >;
      const firstStarted = Promise.withResolvers<undefined>();
      const firstReply = Promise.withResolvers<{ data: unknown; error: null }>();
      rpc.mockImplementationOnce(async () => {
        firstStarted.resolve(undefined);
        return firstReply.promise;
      });
      store.setTarkovUid(1001);
      store.pvp.level = 2;
      await nextTick();
      await flushActiveProgressWrites();
      const firstSave = controller.syncToSupabase();
      await firstStarted.promise;
      let secondSave: ReturnType<typeof controller.syncToSupabase> | undefined;
      if (queued) {
        rpc.mockResolvedValue({
          data: { tarkov_uid: 2002, metadata_write_id: '200', tarkov_uid_conflict: false },
          error: null,
        });
        store.setTarkovUid(2002);
        await nextTick();
        await flushActiveProgressWrites();
        secondSave = controller.syncToSupabase();
      }
      firstReply.resolve({
        data: { tarkov_uid: 1001, metadata_write_id: '100', tarkov_uid_conflict: false },
        error: null,
      });
      expect(await Promise.all([firstSave, secondSave])).not.toContain(null);
      const expectedUid = queued ? 2002 : 1001;
      const capture = vi.spyOn(controller, 'captureRemoteMerge');
      const patches = vi.spyOn(store, '$patch');
      const serializer = vi.spyOn(progressStorageSerializer, 'acceptRemote');
      for (const uid of [7, 1001]) {
        getRealtimeCallback()?.({
          new: {
            ...createRemoteRow({ tarkov_uid: uid, updated_at: new Date().toISOString() }),
            metadata_write_id: '100',
          },
          old: null,
        });
        expect(store.tarkovUid).toBe(expectedUid);
      }
      // The acknowledged echo still fences an older transaction with different metadata.
      getRealtimeCallback()?.({
        new: {
          ...createRemoteRow({
            current_game_mode: 'pve',
            game_edition: 2,
            tarkov_uid: 66,
            updated_at: new Date(Date.now() - 1000).toISOString(),
          }),
          metadata_write_id: 'older-foreign',
        },
        old: null,
      });
      expect(store.tarkovUid).toBe(expectedUid);
      expect(store.currentGameMode).toBe('pvp');
      expect(store.gameEdition).toBe(1);
      expect(capture).not.toHaveBeenCalled();
      expect(patches).not.toHaveBeenCalled();
      expect(serializer).not.toHaveBeenCalled();
      expect(controller.hasPendingChanges?.()).toBe(false);
      controller.cleanup();
    }
  );
  it('keeps a queued UID visible through delayed metadata from the completed relink', async () => {
    single.mockResolvedValue({ data: createRemoteRow({ tarkov_uid: 7 }), error: null });
    await initializeTarkovSync();
    const store = useTarkovStore();
    store.setTarkovUid(1001);
    const firstClient = {
      rpc: async () => ({
        data: { tarkov_uid: 1001, metadata_write_id: '100', tarkov_uid_conflict: false },
        error: null,
      }),
    } as ProgressRpcClient;
    expect((await syncProgressState(firstClient, 'user-1', store.$state)).error).toBeNull();
    store.setTarkovUid(2002);
    const reply = Promise.withResolvers<{ data: unknown; error: null }>();
    const second = syncProgressState(
      { rpc: () => reply.promise } as ProgressRpcClient,
      'user-1',
      store.$state
    );
    getRealtimeCallback()?.({
      new: {
        ...createRemoteRow({
          tarkov_uid: 7,
          updated_at: new Date(Date.now() + 1000).toISOString(),
        }),
        metadata_write_id: '100',
      },
      old: null,
    });
    expect(store.tarkovUid).toBe(2002);
    reply.resolve({
      data: { tarkov_uid: 2002, metadata_write_id: '200', tarkov_uid_conflict: false },
      error: null,
    });
    expect((await second).error).toBeNull();
    expect(store.tarkovUid).toBe(2002);
  });
  it('keeps the requested UID visible when the interim metadata echo arrives before an accepted RPC reply', async () => {
    single.mockResolvedValue({ data: createRemoteRow({ tarkov_uid: 7 }), error: null });
    await initializeTarkovSync();
    const store = useTarkovStore();
    store.setTarkovUid(1001);
    const deferred = Promise.withResolvers<{ data: unknown; error: null }>();
    const pending = syncProgressState(
      { rpc: () => deferred.promise } as ProgressRpcClient,
      'user-1',
      store.$state
    );
    getRealtimeCallback()?.({
      new: createRemoteRow({
        tarkov_uid: 7,
        updated_at: new Date(Date.now() + 1000).toISOString(),
      }),
      old: null,
    });
    expect(store.tarkovUid).toBe(1001);
    deferred.resolve({ data: { tarkov_uid: 1001, tarkov_uid_conflict: false }, error: null });
    expect((await pending).error).toBeNull();
    expect(store.tarkovUid).toBe(1001);
  });
  it('keeps a newer UID edit when an older link is rejected', async () => {
    await initializeTarkovSync();
    const store = useTarkovStore();
    store.setTarkovUid(1001);
    const deferred = Promise.withResolvers<{ data: unknown; error: null }>();
    const pending = syncProgressState(
      { rpc: () => deferred.promise } as ProgressRpcClient,
      'user-1',
      store.$state
    );
    store.setTarkovUid(2002);
    deferred.resolve({ data: { tarkov_uid: null, tarkov_uid_conflict: true }, error: null });
    await pending;
    expect(store.tarkovUid).toBe(2002);
  });
  it('persists the corrected UID when migrating guest progress to a new account', async () => {
    const data = structuredClone(defaultState);
    data.tarkovUid = 1001;
    data.pvp.level = 12;
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({ _userId: null, _timestamp: Date.now(), data })
    );
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
    rpc.mockResolvedValue({ data: { tarkov_uid: null, tarkov_uid_conflict: true }, error: null });
    await initializeTarkovSync();
    await nextTick();
    await flushActiveProgressWrites();
    const envelope = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!);
    expect(envelope._userId).toBe('user-1');
    expect(envelope.data.tarkovUid).toBeNull();
    expect(useTarkovStore().tarkovUid).toBeNull();
    expect(useTarkovStore().pvp.level).toBe(12);
  });
  it.each(['logout', 'same-account-reset', 'A-B-A'])(
    'ignores delayed UID conflicts after %s',
    async (transition) => {
      await initializeTarkovSync();
      const store = useTarkovStore();
      store.setTarkovUid(1001);
      let resolve!: (value: { data: unknown; error: null }) => void;
      const client = {
        rpc: vi.fn(
          () =>
            new Promise<{ data: unknown; error: null }>((done) => {
              resolve = done;
            })
        ),
      };
      const pending = syncProgressState(client as ProgressRpcClient, 'user-1', store.$state);
      resetTarkovSync('abandoned owner');
      if (transition === 'logout') {
        supabaseContext.user.loggedIn = false;
        supabaseContext.user.id = '';
      } else {
        if (transition === 'A-B-A') {
          supabaseContext.user.id = 'user-2';
          resetTarkovSync('switch back');
          supabaseContext.user.id = 'user-1';
        }
        await initializeTarkovSync();
      }
      store.setTarkovUid(1001);
      resolve({ data: { tarkov_uid: null, tarkov_uid_conflict: true }, error: null });
      await pending;
      expect(store.tarkovUid).toBe(1001);
    }
  );
  it('keeps a startup UID correction in the merged store and persisted envelope', async () => {
    const data = structuredClone(defaultState);
    data.tarkovUid = 1001;
    data.pvp.level = 12;
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _userId: 'user-1',
        _timestamp: Date.now(),
        _modeTimestamps: { pvp: Date.now(), pve: 0, seasonal: 0 },
        data,
      })
    );
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    single.mockResolvedValue({ data: createRemoteRow({ updated_at: null }), error: null });
    modeProgressResult.data = [
      {
        game_mode: 'pve',
        season_number: 0,
        progress_data: progressWithLevel(8),
        progress_updated_at: new Date(Date.now() + 1000).toISOString(),
      },
    ];
    rpc.mockResolvedValue({ data: { tarkov_uid: null, tarkov_uid_conflict: true }, error: null });
    await initializeTarkovSync();
    const store = useTarkovStore();
    expect(store.tarkovUid).toBeNull();
    expect(store.pvp.level).toBe(12);
    expect(store.pve.level).toBe(8);
    await nextTick();
    await flushActiveProgressWrites();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!).data.tarkovUid).toBeNull();
    await syncProgressState(
      supabaseContext.client as unknown as ProgressRpcClient,
      'user-1',
      store.$state
    );
    expect(getLastSyncPayload().p_tarkov_uid).toBeNull();
  });
  beforeEach(async () => {
    await flushActiveProgressWrites();
    resetTarkovSync('test setup');
    resetAccountRecoveryRetentionBlock();
    setActiveProgressWritesBlocked(false);
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
    resetModeFixtures();
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
  it('retains mismatched-season owned progress for export before sanitizing active state', () => {
    const staleSeason = ACTIVE_SEASON_NUMBER + 1;
    const data = {
      ...structuredClone(defaultState),
      seasonal: progressWithLevel(17),
      seasonalSeasonNumber: staleSeason,
    };
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({ _userId: 'user-1', _timestamp: Date.now(), data })
    );
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    expect(store.seasonal.level).toBe(defaultState.seasonal.level);
    expect(listSupersededProgressCopies('user-1')).toEqual([
      expect.objectContaining({
        mode: 'seasonal',
        seasonNumber: staleSeason,
        progress: expect.objectContaining({ level: 17 }),
      }),
    ]);
  });
  it('blocks stale-season hydration when the export copy cannot be retained', () => {
    const staleSeason = ACTIVE_SEASON_NUMBER + 1;
    const data = {
      ...structuredClone(defaultState),
      seasonal: progressWithLevel(17),
      seasonalSeasonNumber: staleSeason,
    };
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({ _userId: 'user-1', _timestamp: Date.now(), data })
    );
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) throw new Error('storage full');
      return Storage.prototype.setItem.call(localStorage, key, value);
    });
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    expect(store.seasonal.level).toBe(defaultState.seasonal.level);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[TarkovStore] Error deserializing localStorage:',
      expect.objectContaining({
        message: 'Could not retain stale-season progress before sanitizing it',
      })
    );
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toContain('"seasonalSeasonNumber":');
    expect(listSupersededProgressCopies('user-1')).toEqual([]);
  });
  it('hydrates a default stale-season state without requiring an export copy', () => {
    const data = {
      ...structuredClone(defaultState),
      seasonalSeasonNumber: ACTIVE_SEASON_NUMBER + 1,
    };
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({ _userId: 'user-1', _timestamp: Date.now(), data })
    );
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) throw new Error('storage full');
      return Storage.prototype.setItem.call(localStorage, key, value);
    });
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    useTarkovStore();
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
    expect(listSupersededProgressCopies('user-1')).toEqual([]);
  });
  it('sanitizes stale guest-season data without creating an owner export copy', () => {
    const staleSeason = ACTIVE_SEASON_NUMBER + 1;
    const data = {
      ...structuredClone(defaultState),
      seasonal: progressWithLevel(17),
      seasonalSeasonNumber: staleSeason,
    };
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({ _userId: null, _timestamp: Date.now(), data })
    );
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    expect(store.seasonal.level).toBe(defaultState.seasonal.level);
    expect(listSupersededProgressCopies('user-1')).toEqual([]);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    resetTarkovSync('test teardown');
    await nextTick();
    await flushActiveProgressWrites();
    localStorage.clear();
  });
  it.each(['user-2', 'user-1'])(
    'fences an online reset awaiting the local lock after switching to %s',
    async (nextOwner) => {
      const store = useTarkovStore();
      let release!: () => void;
      let acquired!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const waiting = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const request = vi
        .spyOn(navigator.locks, 'request')
        .mockImplementation(async (_name, _options, callback) => {
          acquired();
          await gate;
          return callback({ name: `${STORAGE_KEYS.progress}:mutation`, mode: 'exclusive' } as Lock);
        });
      const reset = store.resetOnlineProfile();
      await waiting;
      supabaseContext.user.id = 'user-2';
      const firstTransition = resetTarkovStoreForSessionTransition('user-1');
      let secondTransition: Promise<void> | undefined;
      if (nextOwner === 'user-1') {
        supabaseContext.user.id = 'user-1';
        secondTransition = resetTarkovStoreForSessionTransition('user-2');
      }
      store.$patch((state) => {
        state.pvp.level = 37;
      });
      release();
      await Promise.all([reset, firstTransition, secondTransition]);
      expect(store.pvp.level).toBe(37);
      request.mockRestore();
    }
  );
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
  it('keeps historical normalized PvP freshness null despite a newer account clock', async () => {
    const base = Date.parse('2026-09-06T12:00:00Z');
    seedOwnedEnvelope('user-1', { pvp: progressWithLevel(42) }, base + 20_000);
    single.mockResolvedValue({
      data: createRemoteRow({
        game_edition: 3,
        updated_at: new Date(base + 30_000).toISOString(),
        pvp_data: progressWithLevel(70),
      }),
      error: null,
    });
    modeProgressResult.data = [
      {
        game_mode: 'pvp',
        season_number: 0,
        progress_data: progressWithLevel(2),
        progress_updated_at: null,
      },
    ];
    await initializeTarkovSync();
    expect(useTarkovStore().pvp.level).toBe(42);
    expect(useTarkovStore().gameEdition).toBe(3);
    expect(single).toHaveBeenCalledOnce();
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
    await flushActiveProgressWrites();
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
    await flushActiveProgressWrites();
    expect(read().data.pvp.level).toBe(3);
    expect(read()._modeTimestamps.pvp).toBe(base + 30_000);
    useTarkovStore().$patch((state) => {
      state.pve.level = 4;
    });
    await nextTick();
    await flushActiveProgressWrites();
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
    await flushActiveProgressWrites();
    expect(read()._modeTimestamps.pve).toBe(base + 35_000);
    useTarkovStore().$patch({ gameEdition: 3 });
    await nextTick();
    await flushActiveProgressWrites();
    expect(read()._metadataTimestamp).toBe(base + 40_000);
    getRealtimeCallback()?.({
      old: null,
      new: createRemoteRow({ game_edition: 3, updated_at: new Date(base + 36_000).toISOString() }),
    });
    await nextTick();
    await flushActiveProgressWrites();
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
  it('stops initialization after normalized reads exhaust their retries', async () => {
    modeProgressResult.error = { message: 'normalized unavailable' };
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    expect(useSupabaseSyncMock).not.toHaveBeenCalled();
  });
  it.each(['pvp', 'pve'] as const)(
    'reconciles owned historical %s confirmations alongside a memory-only handoff',
    async (mode) => {
      const { preserveUnsavedSessionProgress } = await import('@/stores/useTarkov');
      const { recordLocalSave, markCloudSyncUnavailable, resetCloudSaveStatus } =
        await import('@/stores/tarkov/progressSaveStatus');
      const confirmations = Object.fromEntries(
        Array.from({ length: 66 }, (_, i) => [
          `s${i + 1}`,
          { requirements: 'r'.repeat(4000), timestamp: i + 200 },
        ])
      );
      seedOwnedEnvelope('user-1', {
        pvp: progressWithLevel(5),
        pve: progressWithLevel(3),
        [mode]: { ...progressWithLevel(5), taskAvailability: confirmations },
      });
      modeProgressResult.error = { message: 'normalized unavailable' };
      await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
      resetTarkovSync('initial sync failed');
      markCloudSyncUnavailable(async () => false);
      recordLocalSave(false, 'quota');
      useTarkovStore().$patch((state) => {
        state[mode].level = 42;
      });
      const untouched = mode === 'pvp' ? 'pve' : 'pvp';
      modeProgressResult.data = [
        {
          game_mode: mode,
          season_number: 0,
          progress_data: {
            ...progressWithLevel(5),
            taskAvailability: { s1: { requirements: 'old', timestamp: 0 } },
          },
          progress_updated_at: sessionClock(-60_000),
        },
        {
          game_mode: untouched,
          season_number: 0,
          progress_data: progressWithLevel(9),
          progress_updated_at: sessionClock(60_000),
        },
      ];
      modeProgressResult.error = null;
      single.mockResolvedValue({ data: createRemoteRow(), error: null });
      preserveUnsavedSessionProgress('user-1');
      await initializeTarkovSync();
      expect(useTarkovStore()[mode].level).toBe(42);
      expect(useTarkovStore()[untouched].level).toBe(9);
      expect(useTarkovStore()[mode].taskAvailability).not.toHaveProperty('s1');
      expect(Object.keys(useTarkovStore()[mode].taskAvailability ?? {})).toHaveLength(65);
      recordLocalSave(true);
      resetCloudSaveStatus();
    }
  );
  it('keeps memory-only edits when a failed initialization is retried', async () => {
    const { preserveUnsavedSessionProgress } = await import('@/stores/useTarkov');
    const { recordLocalSave, markCloudSyncUnavailable, resetCloudSaveStatus } =
      await import('@/stores/tarkov/progressSaveStatus');
    seedOwnedEnvelope('user-1', { pvp: progressWithLevel(5) });
    modeProgressResult.error = { message: 'normalized unavailable' };
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    resetTarkovSync('initial sync failed');
    markCloudSyncUnavailable(async () => false);
    // The player keeps editing while local writes fail; the edit exists only in memory.
    recordLocalSave(false, 'quota');
    useTarkovStore().$patch((state) => {
      state.pvp.level = 42;
    });
    modeProgressResult.error = null;
    single.mockResolvedValue({ data: createRemoteRow(), error: null });
    preserveUnsavedSessionProgress('user-1');
    await initializeTarkovSync();
    expect(useTarkovStore().pvp.level).toBe(42);
    const { hasUnsavedProgressChanges } = await import('@/stores/tarkov/progressSaveStatus');
    expect(hasUnsavedProgressChanges()).toBe(false);
    recordLocalSave(true);
    resetCloudSaveStatus();
  });
  it('uploads a memory-only handoff that the startup load did not upload', async () => {
    const { preserveUnsavedSessionProgress } = await import('@/stores/useTarkov');
    const {
      hasUnsavedProgressChanges,
      markCloudSyncUnavailable,
      recordLocalSave,
      resetCloudSaveStatus,
    } = await import('@/stores/tarkov/progressSaveStatus');
    modeProgressResult.error = { message: 'normalized unavailable' };
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    resetTarkovSync('initial sync failed');
    markCloudSyncUnavailable(async () => false);
    recordLocalSave(false, 'quota');
    useTarkovStore().$patch((state) => {
      state.pvp.displayName = 'renamed';
    });
    modeProgressResult.error = null;
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
    preserveUnsavedSessionProgress('user-1');
    syncInitialState.mockClear().mockResolvedValue(null);
    await initializeTarkovSync();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(useTarkovStore().pvp.displayName).toBe('renamed');
    // Not acknowledged by the startup load itself; the started controller uploads it once and
    // owns any retry, so a failed upload is not repeated outside its reconciled schedule.
    expect(hasUnsavedProgressChanges()).toBe(true);
    expect(syncInitialState).toHaveBeenCalledOnce();
    recordLocalSave(true);
    resetCloudSaveStatus();
  });
  it('lets newer remote progress win for modes the memory-only edits did not touch', async () => {
    const { preserveUnsavedSessionProgress } = await import('@/stores/useTarkov');
    const { recordLocalSave, markCloudSyncUnavailable, resetCloudSaveStatus } =
      await import('@/stores/tarkov/progressSaveStatus');
    seedOwnedEnvelope('user-1', { pvp: progressWithLevel(5), pve: progressWithLevel(3) });
    modeProgressResult.error = { message: 'normalized unavailable' };
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    resetTarkovSync('initial sync failed');
    markCloudSyncUnavailable(async () => false);
    recordLocalSave(false, 'quota');
    useTarkovStore().$patch((state) => {
      state.pvp.level = 42;
    });
    modeProgressResult.data = [
      {
        game_mode: 'pvp',
        season_number: 0,
        progress_data: progressWithLevel(5),
        progress_updated_at: sessionClock(-60_000),
      },
      {
        game_mode: 'pve',
        season_number: 0,
        progress_data: progressWithLevel(9),
        progress_updated_at: sessionClock(60_000),
      },
    ];
    modeProgressResult.error = null;
    single.mockResolvedValue({ data: createRemoteRow(), error: null });
    preserveUnsavedSessionProgress('user-1');
    await initializeTarkovSync();
    expect(useTarkovStore().pvp.level).toBe(42);
    expect(useTarkovStore().pve.level).toBe(9);
    recordLocalSave(true);
    resetCloudSaveStatus();
  });
  it.each(['owned', 'empty', 'legacy'])(
    'keeps retry clocks with %s storage when another tab saves before a memory-only edit',
    async (initialStorage) => {
      const { preserveUnsavedSessionProgress } = await import('@/stores/useTarkov');
      const {
        recordLocalSave,
        markCloudSyncUnavailable,
        resetCloudSaveStatus,
        progressSaveStatus,
      } = await import('@/stores/tarkov/progressSaveStatus');
      const baseline = {
        pvp: progressWithLevel(5),
        pve: progressWithLevel(3),
        gameEdition: 1,
      };
      if (initialStorage === 'owned') seedOwnedEnvelope('user-1', baseline);
      if (initialStorage === 'legacy') {
        const legacy = structuredClone(defaultState);
        legacy.pvp.level = 5;
        legacy.pve.level = 3;
        localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(legacy));
      }
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      modeProgressResult.error = { message: 'normalized unavailable' };
      await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
      if (initialStorage === 'empty') {
        expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
        expect(readAccountRecoveryCopy('user-1')).toBeNull();
      }
      resetTarkovSync('initial sync failed', { preserveStorageBaselineForUserId: 'user-1' });
      markCloudSyncUnavailable(async () => false);
      const newer = {
        ...baseline,
        gameEdition: 2,
        pve: {
          ...baseline.pve,
          displayName: 'Other tab',
          pmcFaction: 'BEAR' as const,
          xpOffset: 1234,
          skillOffsets: { endurance: 3 },
        },
      };
      seedOwnedEnvelope('user-1', newer, Date.now() - 1000);
      const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      });
      useTarkovStore().$patch((state) => {
        state.pvp.level = 42;
      });
      await nextTick();
      await flushActiveProgressWrites();
      expect(progressSaveStatus.local).toBe('failed');
      expect(progressSaveStatus.localFailure).toBe('quota');
      setItem.mockRestore();
      modeProgressResult.error = null;
      single.mockResolvedValue({ data: createRemoteRow(), error: null });
      preserveUnsavedSessionProgress('user-1');
      preserveUnsavedSessionProgress('user-1');
      await initializeTarkovSync();
      expect(useTarkovStore().pvp.level).toBe(42);
      expect(useTarkovStore().gameEdition).toBe(2);
      expect(useTarkovStore().pve).toMatchObject(newer.pve);
      recordLocalSave(true);
      resetCloudSaveStatus();
    }
  );
  it('keeps newer other-tab values saved while the first cloud read is pending', async () => {
    const { preserveUnsavedSessionProgress } = await import('@/stores/useTarkov');
    const { markCloudSyncUnavailable, progressSaveStatus, resetCloudSaveStatus } =
      await import('@/stores/tarkov/progressSaveStatus');
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const deferred = createDeferredRead();
    const failedRead = { data: null, error: { message: 'offline' } };
    single.mockImplementationOnce(() => deferred.promise).mockResolvedValue(failedRead);
    const startup = initializeTarkovSync();
    const failure = expect(startup).rejects.toThrow('Supabase initial load failed');
    await waitForBackgroundTasks();
    expect(single).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
    expect(readAccountRecoveryCopy('user-1')).toBeNull();
    const newer = {
      gameEdition: 2,
      pve: {
        ...progressWithLevel(9),
        displayName: 'Other tab during read',
        pmcFaction: 'BEAR' as const,
        xpOffset: 1234,
        skillOffsets: { endurance: 3 },
      },
    };
    seedOwnedEnvelope('user-1', newer, Date.now() - 1000);
    deferred.resolve(failedRead);
    await failure;
    resetTarkovSync('initial sync failed', { preserveStorageBaselineForUserId: 'user-1' });
    markCloudSyncUnavailable(async () => false);
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    useTarkovStore().$patch((state) => {
      state.pvp.level = 42;
    });
    await nextTick();
    await flushActiveProgressWrites();
    expect(progressSaveStatus.local).toBe('failed');
    expect(progressSaveStatus.localFailure).toBe('quota');
    setItem.mockRestore();
    single.mockResolvedValue({ data: createRemoteRow(), error: null });
    preserveUnsavedSessionProgress('user-1');
    await initializeTarkovSync();
    expect(useTarkovStore().pvp.level).toBe(42);
    expect(useTarkovStore().gameEdition).toBe(2);
    expect(useTarkovStore().pve).toMatchObject(newer.pve);
    resetCloudSaveStatus();
  });
  it('does not replace the store from memory for another account or without unsaved edits', async () => {
    const { preserveUnsavedSessionProgress } = await import('@/stores/useTarkov');
    const { recordLocalSave } = await import('@/stores/tarkov/progressSaveStatus');
    seedOwnedEnvelope('user-1', { pvp: progressWithLevel(5) });
    recordLocalSave(true);
    useTarkovStore().$patch((state) => {
      state.pvp.level = 42;
    });
    preserveUnsavedSessionProgress('user-1');
    recordLocalSave(false, 'quota');
    preserveUnsavedSessionProgress('user-2');
    await initializeTarkovSync();
    // The startup load resolved from storage and the cloud, not from the in-memory edit.
    expect(useTarkovStore().pvp.level).not.toBe(42);
    recordLocalSave(true);
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
  it('keeps the owned active copy in place when hydrating before the session loads', () => {
    supabaseContext.user.loggedIn = false;
    supabaseContext.user.id = null;
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'user-1',
        data: { ...structuredClone(defaultState), pvp: progressWithLevel(7) },
      })
    );
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    expect(store.pvp.level).toBe(1);
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!)).toMatchObject({
      _userId: 'user-1',
      data: { pvp: { level: 7 } },
    });
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
  it('uses the freshest matching active snapshot when it is newer than the handoff', async () => {
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
        data: {
          ...structuredClone(defaultState),
          pvp: progressWithLevel(12),
        },
      })
    );
    const overwrittenSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || '{}');
    expect(overwrittenSnapshot._userId).toBe('user-2');
    expect(overwrittenSnapshot.data?.pvp?.level).toBe(12);
    await initializeTarkovSync();
    expect(store.pvp.level).toBe(12);
    expect(getLastSyncPayload().p_modes.pvp).toEqual(expect.objectContaining({ level: 12 }));
  });
  it('keeps preserved snapshot mode clocks when adopting it through real persistence', async () => {
    const base = Date.parse('2026-09-06T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(base + 100_000);
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    supabaseContext.user.id = 'user-2';
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: base + 10_000,
        _metadataTimestamp: base + 10_000,
        _modeTimestamps: { pvp: base + 10_000, pve: base + 10_000, seasonal: base + 10_000 },
        _userId: 'user-2',
        data: { ...structuredClone(defaultState), pvp: progressWithLevel(9) },
      })
    );
    resetTarkovSync('user switched', { preservePersistedStateForUserId: 'user-2' });
    store.$reset();
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: base + 15_000,
        _userId: 'user-2',
        data: structuredClone(defaultState),
      })
    );
    single.mockResolvedValue({
      data: createRemoteRow({ updated_at: new Date(base + 1_000).toISOString() }),
      error: null,
    });
    modeProgressResult.data = [
      {
        game_mode: 'pvp',
        season_number: 0,
        progress_data: progressWithLevel(1),
        progress_updated_at: new Date(base + 1_000).toISOString(),
      },
    ];
    await initializeTarkovSync();
    await nextTick();
    await flushActiveProgressWrites();
    expect(store.pvp.level).toBe(9);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!);
    expect(persisted.data.pvp.level).toBe(9);
    expect(persisted._modeTimestamps.pvp).toBe(base + 10_000);
  });
  it.each([
    { level: 2, handoff: false },
    { level: 1, handoff: false },
    { level: 2, handoff: true },
    { level: 1, handoff: true },
  ])(
    'keeps a genuine queued level decrease to $level through startup, handoff=$handoff',
    async ({ level, handoff }) => {
      const base = Date.parse('2026-09-06T12:00:00Z');
      vi.spyOn(Date, 'now').mockReturnValue(base + 100_000);
      localStorage.setItem(
        STORAGE_KEYS.progress,
        JSON.stringify({
          _timestamp: base + 10_000,
          _modeTimestamps: { pvp: base + 10_000, pve: 0, seasonal: 0 },
          _userId: 'user-1',
          data: { ...structuredClone(defaultState), pvp: progressWithLevel(9) },
        })
      );
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      const store = useTarkovStore();
      const gate = Promise.withResolvers<undefined>();
      const held = navigator.locks.request(
        `${STORAGE_KEYS.progress}:mutation`,
        { mode: 'exclusive' },
        () => gate.promise
      );
      try {
        store.$patch((state) => {
          state.pvp.level = level;
        });
        if (handoff) preserveUnsavedSessionProgress('user-1');
        single.mockResolvedValue({
          data: createRemoteRow({ updated_at: new Date(base + 1_000).toISOString() }),
          error: null,
        });
        modeProgressResult.data = [
          {
            game_mode: 'pvp',
            season_number: 0,
            progress_data: progressWithLevel(9),
            progress_updated_at: new Date(base + 1_000).toISOString(),
          },
        ];
        await initializeTarkovSync();
        expect(store.pvp.level).toBe(level);
        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!).data.pvp.level).toBe(9);
      } finally {
        gate.resolve(undefined);
        await held;
        await flushActiveProgressWrites();
      }
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!);
      expect(persisted.data.pvp.level).toBe(level);
      expect(persisted._modeTimestamps.pvp).toBe(base + 100_000);
    }
  );
  it('keeps a failed memory edit when an older conditional acknowledgement succeeds', async () => {
    const original = JSON.stringify({
      _userId: 'user-1',
      _timestamp: 100,
      data: { ...structuredClone(defaultState), pvp: progressWithLevel(10) },
    });
    localStorage.setItem(STORAGE_KEYS.progress, original);
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    const status = await import('@/stores/tarkov/progressSaveStatus');
    const setItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === STORAGE_KEYS.progress && JSON.parse(value).data.pvp.level === 20)
        throw new DOMException('full', 'QuotaExceededError');
      setItem(key, value);
    });
    store.$patch((state) => {
      state.pvp.level = 20;
    });
    expect(
      await persistActiveProgressValue(
        original,
        true,
        parsePersistedProgressState(original, 'user-1')
      )
    ).toBe(true);
    await flushActiveProgressWrites();
    expect(store.pvp.level).toBe(20);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!).data.pvp.level).toBe(10);
    expect(status.progressSaveStatus.local).toBe('failed');
    expect(status.progressSaveStatus.localFailure).toBe('quota');
    expect(status.hasUnsavedProgressChanges()).toBe(true);
  });
  it('keeps genuine queued owner progress when durable storage belongs to another account', async () => {
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    const foreign = JSON.stringify({
      _userId: 'user-2',
      _timestamp: 100,
      data: { ...structuredClone(defaultState), pvp: progressWithLevel(15) },
    });
    localStorage.setItem(STORAGE_KEYS.progress, foreign);
    const gate = Promise.withResolvers<undefined>();
    const held = navigator.locks.request(
      `${STORAGE_KEYS.progress}:mutation`,
      { mode: 'exclusive' },
      () => gate.promise
    );
    try {
      store.$patch((state) => {
        state.pvp.level = 37;
      });
      // Initial startup must see this real edit without an explicit retry handoff.
      await initializeTarkovSync();
      expect(store.pvp.level).toBe(37);
      expect(
        JSON.parse(progressPersistStorage.getItem(STORAGE_KEYS.progress)!).data.pvp.level
      ).toBe(37);
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(foreign);
    } finally {
      gate.resolve(undefined);
      await held;
      await flushActiveProgressWrites();
    }
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!).data.pvp.level).toBe(37);
    expect(readAccountRecoveryCopy('user-2')?.state.pvp.level).toBe(15);
  });
  it('invalidates the real session-transition placeholder while the shared lock is held', async () => {
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    const original = JSON.stringify({
      _userId: 'user-1',
      _timestamp: 100,
      data: { ...structuredClone(defaultState), pvp: progressWithLevel(9) },
    });
    localStorage.setItem(STORAGE_KEYS.progress, original);
    const gate = Promise.withResolvers<undefined>();
    const held = navigator.locks.request(
      `${STORAGE_KEYS.progress}:mutation`,
      { mode: 'exclusive' },
      () => gate.promise
    );
    let transition: Promise<void> | undefined;
    try {
      supabaseContext.user.id = 'user-2';
      transition = resetTarkovStoreForSessionTransition('user-1', 'account switch');
      await nextTick();
      expect(store.pvp.level).toBe(1);
      expect(progressPersistStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
    } finally {
      gate.resolve(undefined);
      await held;
      await transition;
      await flushActiveProgressWrites();
    }
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
    const recovered = readAccountRecoveryCopy('user-1');
    expect(recovered?.state.pvp.level).toBe(9);
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
    await resetTarkovStoreForSessionTransition('user-1', 'logout');
    const restoredSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || '{}');
    expect(store.pvp.level).toBe(1);
    expect(restoredSnapshot._userId).toBe('user-1');
    expect(restoredSnapshot.data?.pvp?.level).toBe(11);
  });
  it('clears progress when preserved logout storage cannot be rewritten', async () => {
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
    await expect(resetTarkovStoreForSessionTransition('user-1', 'logout')).resolves.toBeUndefined();
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
    await resetTarkovStoreForSessionTransition('user-1', 'logout');
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
    await resetTarkovStoreForSessionTransition('user-1', 'logout');
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
        p_modes: {
          pve: expect.objectContaining({
            level: 8,
            progressEpoch: 0,
          }),
        },
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
    await flushActiveProgressWrites();
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
    'makes one direct initial upload and leaves retries to the reconciled controller: %s',
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
        await flushActiveProgressWrites();
        expect(syncInitialState).toHaveBeenCalledTimes(1);
        if (outcome === 'session-reset') resetTarkovSync('session changed');
        await vi.advanceTimersByTimeAsync(5000);
        // A second direct attempt would skip the remote merge that controller retries perform.
        expect(syncInitialState).toHaveBeenCalledTimes(1);
        const options = useSupabaseSyncMock.mock.calls.at(-1)?.[0] as {
          reconcileBeforeRetry?: unknown;
        };
        expect(options.reconcileBeforeRetry).toEqual(expect.any(Function));
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
  it.each([
    ['active', 'short_remote'],
    ['recovery', 'short_remote'],
    ['active', 'both_oversized'],
    ['recovery', 'both_oversized'],
    ['active', 'remote_clear'],
    ['recovery', 'remote_clear'],
    ['foreign', 'short_remote'],
    ['legacy', 'short_remote'],
    ['active', 'newer_remote_epoch'],
    ['active', 'older_remote_epoch'],
    ['recovery', 'older_remote_epoch'],
  ])(
    'preserves historical confirmation winners through %s hydration with %s',
    async (source, scenario) => {
      const local = {
        ...progressWithLevel(1),
        progressEpoch: scenario === 'older_remote_epoch' ? 1 : 0,
        taskAvailability: Object.fromEntries(
          Array.from({ length: 66 }, (_, i) => [
            `s${i + 1}`,
            { requirements: 'r'.repeat(4000), timestamp: i + 200 },
          ])
        ),
      };
      const envelope = JSON.stringify({
        _userId: source === 'foreign' ? 'user-2' : 'user-1',
        _timestamp: SESSION_BASE_MS,
        data: { ...structuredClone(defaultState), pvp: local },
      });
      localStorage.setItem(
        source !== 'recovery'
          ? STORAGE_KEYS.progress
          : `${STORAGE_KEYS.progressRecoveryPrefix}user-1`,
        source === 'legacy'
          ? JSON.stringify({ ...structuredClone(defaultState), pvp: local })
          : envelope
      );
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      const store = useTarkovStore();
      if (source === 'active') {
        expect(store.pvp.taskAvailability).not.toHaveProperty('s1');
        expect(Object.keys(store.pvp.taskAvailability ?? {})).toHaveLength(65);
      }
      single.mockResolvedValue({
        data: createRemoteRow({ pvp_data: progressWithLevel(1) }),
        error: null,
      });
      const remote =
        scenario === 'both_oversized'
          ? {
              ...Object.fromEntries(
                Array.from({ length: 65 }, (_, i) => [
                  `s${i + 2}`,
                  { requirements: 'r'.repeat(4000), timestamp: i },
                ])
              ),
              extra: { requirements: 'r'.repeat(4000), timestamp: 0 },
              s1: { requirements: 'old', timestamp: 100 },
            }
          : {
              s1: {
                requirements: scenario === 'remote_clear' ? '' : 'old',
                timestamp: scenario === 'remote_clear' ? 200 : 0,
              },
            };
      modeProgressResult.data = [
        modeRow('pvp', {
          ...progressWithLevel(1),
          progressEpoch: scenario === 'newer_remote_epoch' ? 1 : 0,
          taskAvailability: remote,
        }),
      ];
      await initializeTarkovSync();
      if (source === 'foreign' || source === 'legacy' || scenario === 'newer_remote_epoch') {
        expect(store.pvp.taskAvailability).toEqual(remote);
      } else if (scenario === 'remote_clear') {
        expect(store.pvp.taskAvailability?.s1).toEqual(remote.s1);
        expect(Object.keys(store.pvp.taskAvailability ?? {})).toHaveLength(66);
      } else {
        expect(store.pvp.taskAvailability).not.toHaveProperty('s1');
        expect(Object.keys(store.pvp.taskAvailability ?? {})).toHaveLength(65);
      }
    }
  );
  it.each(['pvp', 'pve', 'seasonal'] as const)(
    'reconciles historical %s evidence after a bounded write and real reload',
    async (mode) => {
      const confirmations = Object.fromEntries(
        Array.from({ length: 66 }, (_, i) => [
          `s${i + 1}`,
          { requirements: 'r'.repeat(4000), timestamp: i + 200 },
        ])
      );
      const raw = JSON.stringify({
        _userId: 'user-1',
        _timestamp: SESSION_BASE_MS,
        data: {
          ...structuredClone(defaultState),
          [mode]: { ...progressWithLevel(1), taskAvailability: confirmations },
        },
      });
      localStorage.setItem(STORAGE_KEYS.progress, raw);
      const createPersistedStore = () => {
        const pinia = createPinia().use(piniaPluginPersistedstate);
        createApp({}).use(pinia);
        setActivePinia(pinia);
        return useTarkovStore();
      };
      const first = createPersistedStore();
      first[mode].level = 2;
      await nextTick();
      await flushActiveProgressWrites();
      expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBe(raw);
      resetTarkovSync('reload');
      const restored = createPersistedStore();
      single.mockResolvedValue({
        data: createRemoteRow({ pvp_data: progressWithLevel(1) }),
        error: null,
      });
      modeProgressResult.data = [
        modeRow(mode, {
          ...progressWithLevel(1),
          taskAvailability: { s1: { requirements: 'old', timestamp: 0 } },
        }),
      ];
      await initializeTarkovSync();
      expect(restored[mode].taskAvailability).not.toHaveProperty('s1');
      expect(restored[mode].level).toBe(2);
      expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBeNull();
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!);
      expect(Object.keys(saved.data[mode].taskAvailability)).toHaveLength(65);
      expect(saved).not.toHaveProperty('confirmationCandidates');
      expect(saved.data).not.toHaveProperty('confirmationCandidates');
    }
  );
  it('retains historical evidence across sign-out and another account before owner reconciliation', async () => {
    const confirmations = Object.fromEntries(
      Array.from({ length: 66 }, (_, i) => [
        `s${i + 1}`,
        { requirements: 'r'.repeat(4000), timestamp: i + 200 },
      ])
    );
    const raw = JSON.stringify({
      _userId: 'user-1',
      _timestamp: SESSION_BASE_MS,
      data: {
        ...structuredClone(defaultState),
        pvp: { ...progressWithLevel(1), taskAvailability: confirmations },
      },
    });
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    supabaseContext.user.id = null as unknown as string;
    supabaseContext.user.loggedIn = false;
    await resetTarkovStoreForSessionTransition('user-1', 'logout');
    await nextTick();
    await flushActiveProgressWrites();
    supabaseContext.user.id = 'user-2';
    supabaseContext.user.loggedIn = true;
    resetTarkovSync('another account');
    await initializeTarkovSync();
    expect(store.pvp.taskAvailability).toEqual({});
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBe(raw);
    supabaseContext.user.id = 'user-1';
    resetTarkovSync('original owner');
    single.mockResolvedValue({
      data: createRemoteRow({ pvp_data: progressWithLevel(1) }),
      error: null,
    });
    modeProgressResult.data = [
      modeRow('pvp', {
        ...progressWithLevel(1),
        taskAvailability: { s1: { requirements: 'old', timestamp: 0 } },
      }),
    ];
    await initializeTarkovSync();
    expect(store.pvp.taskAvailability).not.toHaveProperty('s1');
    expect(Object.keys(store.pvp.taskAvailability!)).toHaveLength(65);
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBeNull();
  });
  it('preserves the original on failed startup upload and retires it only after a successful retry', async () => {
    const confirmations = Object.fromEntries(
      Array.from({ length: 66 }, (_, i) => [
        `s${i + 1}`,
        { requirements: 'r'.repeat(4000), timestamp: i + 200 },
      ])
    );
    const raw = JSON.stringify({
      _userId: 'user-1',
      _timestamp: SESSION_BASE_MS,
      data: {
        ...structuredClone(defaultState),
        pvp: { ...progressWithLevel(1), taskAvailability: confirmations },
      },
    });
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`, raw);
    single.mockResolvedValue({
      data: createRemoteRow({ pvp_data: progressWithLevel(1) }),
      error: null,
    });
    modeProgressResult.data = [
      modeRow('pvp', {
        ...progressWithLevel(1),
        taskAvailability: { s1: { requirements: 'old', timestamp: 0 } },
      }),
    ];
    rpc.mockResolvedValue({ error: { message: 'offline' } });
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBe(raw);
    rpc.mockResolvedValue({ error: null });
    await initializeTarkovSync();
    expect(useTarkovStore().pvp.taskAvailability).not.toHaveProperty('s1');
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBeNull();
  });
  it('reconciles historical evidence even when quota prevents making a recovery copy', async () => {
    const confirmations = Object.fromEntries(
      Array.from({ length: 66 }, (_, i) => [
        `s${i + 1}`,
        { requirements: 'r'.repeat(4000), timestamp: i + 200 },
      ])
    );
    const raw = JSON.stringify({
      _userId: 'user-1',
      _timestamp: SESSION_BASE_MS,
      data: {
        ...structuredClone(defaultState),
        pvp: { ...progressWithLevel(1), taskAvailability: confirmations },
      },
    });
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useTarkovStore();
    const originalSet = localStorage.setItem.bind(localStorage);
    const quotaSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === `${STORAGE_KEYS.progressRecoveryPrefix}user-1`)
        throw new DOMException('full', 'QuotaExceededError');
      originalSet(key, value);
    });
    store.pvp.level = 2;
    await nextTick();
    await flushActiveProgressWrites();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    single.mockResolvedValue({
      data: createRemoteRow({ pvp_data: progressWithLevel(1) }),
      error: null,
    });
    modeProgressResult.data = [
      modeRow('pvp', {
        ...progressWithLevel(1),
        taskAvailability: { s1: { requirements: 'old', timestamp: 0 } },
      }),
    ];
    await initializeTarkovSync();
    expect(store.pvp.taskAvailability).not.toHaveProperty('s1');
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)!);
    expect(saved.data.pvp.taskAvailability).not.toHaveProperty('s1');
    expect(Object.keys(saved.data.pvp.taskAvailability)).toHaveLength(65);
    quotaSpy.mockRestore();
    store.$dispose();
  });
  it.each([66, 1001])(
    'does not resurrect older duplicates when the server unions the bounded startup upload from %s entries',
    async (count) => {
      const confirmations = Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          `s${i + 1}`,
          { requirements: 'r'.repeat(4000), timestamp: i + 200 },
        ])
      );
      seedOwnedEnvelope('user-1', {
        pvp: { ...progressWithLevel(1), taskAvailability: confirmations },
      });
      let server = Object.fromEntries(
        Array.from({ length: Math.min(count, 1000) }, (_, i) => [
          `s${i + 1}`,
          { requirements: 'old', timestamp: 0 },
        ])
      );
      single.mockResolvedValue({
        data: createRemoteRow({ pvp_data: progressWithLevel(1) }),
        error: null,
      });
      modeProgressResult.data = [
        modeRow('pvp', { ...progressWithLevel(1), taskAvailability: server }),
      ];
      rpc.mockImplementation((_name, payload) => {
        const modes = payload?.p_modes as Partial<Record<'pvp', UserProgressData>> | undefined;
        if (modes?.pvp) server = mergeTaskAvailability(server, modes.pvp.taskAvailability);
        return Promise.resolve({ error: null });
      });
      await initializeTarkovSync();
      expect(useTarkovStore().pvp.taskAvailability).not.toHaveProperty('s1');
      expect(server.s1?.requirements).not.toBe('old');
      expect(Object.values(server).every((entry) => entry.requirements !== 'old')).toBe(true);
      expect(Object.keys(server).length).toBeLessThanOrEqual(1000);
      for (const [, payload] of rpc.mock.calls) {
        expect(payload?.p_modes).toBeDefined();
        const modes = payload?.p_modes as Partial<Record<'pvp', UserProgressData>>;
        const map = modes.pvp?.taskAvailability ?? {};
        const encoder = new TextEncoder();
        const bytes = Object.entries(map).reduce(
          (total, [id, entry]) =>
            total + encoder.encode(id).length + encoder.encode(entry.requirements).length,
          0
        );
        expect(bytes).toBeLessThanOrEqual(262144);
        expect(Object.keys(map).length).toBeLessThanOrEqual(1000);
        expect(encoder.encode(JSON.stringify(payload?.p_modes)).length).toBeLessThanOrEqual(
          512 * 1024
        );
      }
    }
  );
  it('retains the original when the final upload fails after a successful bounded eviction pass', async () => {
    const confirmations = Object.fromEntries(
      Array.from({ length: 66 }, (_, i) => [
        `s${i + 1}`,
        { requirements: 'r'.repeat(4000), timestamp: i + 200 },
      ])
    );
    seedOwnedEnvelope('user-1', {
      pvp: { ...progressWithLevel(1), taskAvailability: confirmations },
    });
    const raw = localStorage.getItem(STORAGE_KEYS.progress);
    let server = { s1: { requirements: 'old', timestamp: 0 } };
    single.mockResolvedValue({
      data: createRemoteRow({ pvp_data: progressWithLevel(1) }),
      error: null,
    });
    modeProgressResult.data = [
      modeRow('pvp', { ...progressWithLevel(1), taskAvailability: server }),
    ];
    let writes = 0;
    rpc.mockImplementation((_name, payload) => {
      writes++;
      if (writes === 2) return Promise.resolve({ error: { message: 'offline' } });
      const modes = payload?.p_modes as Partial<Record<'pvp', UserProgressData>> | undefined;
      if (modes?.pvp)
        server = mergeTaskAvailability(server, modes.pvp.taskAvailability) as typeof server;
      return Promise.resolve({ error: null });
    });
    await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
    expect(server.s1.requirements).toBe('');
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    modeProgressResult.data = [
      modeRow('pvp', { ...progressWithLevel(1), taskAvailability: server }),
    ];
    await initializeTarkovSync();
    expect(Object.values(server).every((entry) => entry.requirements !== 'old')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).not.toBe(raw);
  });
  it('does not launch the final upload after auth changes during an eviction pass', async () => {
    const confirmations = Object.fromEntries(
      Array.from({ length: 66 }, (_, i) => [
        `s${i + 1}`,
        { requirements: 'r'.repeat(4000), timestamp: i + 200 },
      ])
    );
    seedOwnedEnvelope('user-1', {
      pvp: { ...progressWithLevel(1), taskAvailability: confirmations },
    });
    const raw = localStorage.getItem(STORAGE_KEYS.progress);
    single.mockResolvedValue({
      data: createRemoteRow({ pvp_data: progressWithLevel(1) }),
      error: null,
    });
    modeProgressResult.data = [
      modeRow('pvp', {
        ...progressWithLevel(1),
        taskAvailability: { s1: { requirements: 'old', timestamp: 0 } },
      }),
    ];
    rpc.mockImplementationOnce(async () => {
      await switchSession('user-1', 'user-2');
      return Promise.resolve({ error: null });
    });
    await initializeTarkovSync();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBe(raw);
    expect(useTarkovStore().pvp.taskAvailability).toEqual({});
  });
  it('merges historical oversized confirmations before startup eviction', async () => {
    const local = {
      ...progressWithLevel(1),
      taskAvailability: { s1: { requirements: 'old', timestamp: 0 } },
    };
    seedOwnedEnvelope('user-1', { pvp: local });
    useTarkovStore().$patch({ pvp: local });
    single.mockResolvedValue({
      data: createRemoteRow({ pvp_data: progressWithLevel(1) }),
      error: null,
    });
    modeProgressResult.data = [
      modeRow('pvp', {
        ...progressWithLevel(1),
        taskAvailability: Object.fromEntries(
          Array.from({ length: 66 }, (_, i) => [
            `s${i + 1}`,
            { requirements: 'r'.repeat(4000), timestamp: i + 1 },
          ])
        ),
      }),
    ];
    await initializeTarkovSync();
    expect(useTarkovStore().pvp.taskAvailability).not.toHaveProperty('s1');
    expect(Object.keys(useTarkovStore().pvp.taskAvailability ?? {})).toHaveLength(65);
  });
  it.each([{ rows: [] }, { rows: [{ game_mode: 'pvp', season_number: 0, progress_data: {} }] }])(
    'ignores poisoned legacy payloads when normalized rows are %j',
    async ({ rows }) => {
      modeProgressResult.data = rows;
      single.mockResolvedValue({
        data: createRemoteRow({
          game_edition: 3,
          tarkov_uid: 12345,
          pvp_data: progressWithTaskState('poisoned-legacy-task', true),
          pve_data: progressWithLevel(70),
        }),
        error: null,
      });
      await initializeTarkovSync();
      expect(single).toHaveBeenCalledOnce();
      expect(select.mock.calls.flat().join(',')).not.toMatch(/pvp_data|pve_data/);
      expect(useTarkovStore().pvp.taskCompletions['poisoned-legacy-task']).toBeUndefined();
      expect(useTarkovStore().pve.level).toBe(1);
      expect(useTarkovStore().gameEdition).toBe(3);
      expect(useTarkovStore().tarkovUid).toBe(12345);
    }
  );
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
  it.each([
    { scenario: 'cleared', locking: true },
    { scenario: 'clear failed', locking: false },
  ])(
    'reports a signed-out Seasonal reset only once its active copy is cleared: $scenario',
    async ({ locking }) => {
      supabaseContext.user.id = null;
      supabaseContext.user.loggedIn = false;
      const original = JSON.stringify({
        _userId: null,
        _timestamp: Date.now(),
        data: { ...structuredClone(defaultState), seasonal: progressWithLevel(17) },
      });
      localStorage.setItem(STORAGE_KEYS.progress, original);
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      const store = useTarkovStore();
      expect(store.seasonal.level).toBe(17);
      const locks = Object.getOwnPropertyDescriptor(navigator, 'locks')!;
      if (!locking)
        Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      try {
        const reset = store.resetSeasonalData();
        if (locking) await expect(reset).resolves.toBeUndefined();
        else await expect(reset).rejects.toThrow('Local progress could not be cleared after reset');
      } finally {
        Object.defineProperty(navigator, 'locks', locks);
      }
      expect(store.seasonal.level).toBe(defaultState.seasonal.level);
      const completion = expect(loggerMock.debug);
      (locking ? completion : completion.not).toHaveBeenCalledWith(
        '[TarkovStore] Seasonal data reset complete'
      );
      // A reload restores an uncleared envelope, so only a failure may be reported for it.
      expect(localStorage.getItem(STORAGE_KEYS.progress) === original).toBe(!locking);
    }
  );
  it('logs an online profile reset whose active copy could not be cleared as failed', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.pvp.level = 42;
    });
    const locks = Object.getOwnPropertyDescriptor(navigator, 'locks')!;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    try {
      await store.resetOnlineProfile();
    } finally {
      Object.defineProperty(navigator, 'locks', locks);
    }
    // The cloud already holds the reset, so memory follows it even though cleanup failed.
    expect(store.pvp.level).toBe(defaultState.pvp.level);
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Error resetting online profile:',
      expect.objectContaining({
        message: 'Online profile reset saved, but local progress could not be cleared',
      })
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
      await switchSession('user-1', 'user-2');
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
      await switchSession('user-1', null, 'logout');
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
      const staleModeRead = createDeferredModeRead();
      staleModeRead.begin();
      single.mockResolvedValueOnce({
        data: createRemoteRow({
          user_id: 'user-1',
          updated_at: sessionClock(1_000),
          pvp_data: null,
          pve_data: null,
        }),
        error: null,
      });
      const staleInit = initializeTarkovSync();
      await settleBackgroundWork();
      await switchSession('user-1', 'user-2');
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
      await switchSession('user-2', 'user-1');
      const freshRow = createRemoteRow({
        updated_at: sessionClock(30_000),
        user_id: 'user-1',
        pvp_data: compoundProgress(50, 'task-return-second'),
        pve_data: progressWithLevel(12),
      });
      single.mockResolvedValue({ data: freshRow, error: null });
      await initializeTarkovSync();
      await settleBackgroundWork();
      const store = useTarkovStore();
      expect(store.pvp.taskCompletions['task-return-second']?.complete).toBe(true);
      expect(store.pvp.level).toBe(50);
      const baseline = watchSessionActivity();
      staleModeRead.release([
        { game_mode: 'pvp', season_number: 0, progress_data: compoundProgress(10, 'task-stale-a') },
        { game_mode: 'pve', season_number: 0, progress_data: progressWithLevel(3) },
      ]);
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
      await switchSession('user-1', 'user-2');
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
      await switchSession('user-1', 'user-2');
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
      await switchSession('user-1', 'user-2');
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
      await switchSession('user-1', 'user-2');
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
      await flushActiveProgressWrites();
      const baseline = watchSessionActivity();
      staleMergeWrite.resolve({ error: null });
      await staleInit.catch(() => undefined);
      await settleBackgroundWork();
      await nextTick();
      await flushActiveProgressWrites();
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
  describe('progress save status', () => {
    type StatusOptions = {
      onSaveStatusChange: (status: Record<string, unknown>) => void;
      retryDelaysMs: readonly number[];
    };
    const failedStatus = {
      state: 'failed',
      failure: 'offline',
      retryAttempt: 3,
      nextRetryAt: null,
    };
    it('mirrors only the current controller and routes manual retries to it', async () => {
      const retryNow = vi.fn().mockResolvedValue(true);
      useSupabaseSyncMock.mockReturnValue({
        cleanup: cleanupSync,
        syncToSupabase: syncInitialState,
        pause: pauseSync,
        resume: resumeSync,
        retryNow,
      } as unknown as ReturnType<typeof useSupabaseSyncMock>);
      await initializeTarkovSync();
      const status = await import('@/stores/tarkov/progressSaveStatus');
      const options = useSupabaseSyncMock.mock.calls.at(-1)?.[0] as StatusOptions;
      expect(options.retryDelaysMs).toEqual(status.CLOUD_SAVE_RETRY_DELAYS_MS);
      options.onSaveStatusChange(failedStatus);
      expect(status.progressSaveStatus.cloud).toEqual(failedStatus);
      await expect(status.retryCloudSave()).resolves.toBe(true);
      expect(retryNow).toHaveBeenCalledOnce();
      await switchSession('user-1', null, 'signed out');
      expect(status.progressSaveStatus.cloud.state).toBe('idle');
      // A disposed controller cannot resurrect a warning for the next session.
      options.onSaveStatusChange(failedStatus);
      expect(status.progressSaveStatus.cloud.state).toBe('idle');
      await expect(status.retryCloudSave()).resolves.toBe(false);
    });
    it('records local save failures from the real persistence plugin', async () => {
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      await initializeTarkovSync();
      const status = await import('@/stores/tarkov/progressSaveStatus');
      useTarkovStore().$patch((state) => {
        state.pvp.level = 7;
      });
      await nextTick();
      await flushActiveProgressWrites();
      expect(status.progressSaveStatus.local).toBe('saved');
      const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      });
      useTarkovStore().$patch((state) => {
        state.pvp.level = 8;
      });
      await nextTick();
      await flushActiveProgressWrites();
      expect(status.progressSaveStatus.local).toBe('failed');
      expect(status.progressSaveStatus.localFailure).toBe('quota');
      setItem.mockRestore();
    });
  });
  describe('account recovery copies', () => {
    const recoveryKey = (userId: string) => `${STORAGE_KEYS.progressRecoveryPrefix}${userId}`;
    const writeActiveCopy = (userId: string | null, level: number, timestamp: number) =>
      localStorage.setItem(
        STORAGE_KEYS.progress,
        JSON.stringify({
          _timestamp: timestamp,
          _userId: userId,
          data: { ...structuredClone(defaultState), pvp: progressWithLevel(level) },
        })
      );
    const readRecoveryLevel = (userId: string) =>
      JSON.parse(localStorage.getItem(recoveryKey(userId)) ?? 'null')?.data?.pvp?.level;
    it('keeps unacknowledged changes for their owner across guest and other-account use', async () => {
      const store = useTarkovStore();
      const preservedAt = Date.parse('2026-02-25T00:00:00.000Z');
      writeActiveCopy('user-1', 11, preservedAt);
      await switchSession('user-1', null, 'logout');
      expect(readRecoveryLevel('user-1')).toBe(11);
      // A guest session overwrites the active copy; the recovery copy is separate.
      writeActiveCopy(null, 4, preservedAt + 1000);
      await switchSession(null, 'user-2', 'login');
      single.mockResolvedValue({
        data: createRemoteRow({
          user_id: 'user-2',
          pvp_data: progressWithLevel(2),
          updated_at: '2026-03-01T00:00:00.000Z',
        }),
        error: null,
      });
      await initializeTarkovSync();
      expect(store.pvp.level).toBe(2);
      expect(readRecoveryLevel('user-1')).toBe(11);
      await switchSession('user-2', 'user-1', 'account switch');
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
      // Reconciled with the cloud, so the copy is retired; the other account's is kept.
      expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
      expect(readRecoveryLevel('user-2')).toBe(2);
    });
    it.each([
      ['retires', true],
      ['keeps', false],
    ])(
      '%s a metadata-only recovery copy by whether a startup upload is acknowledged',
      async (_label, acknowledged) => {
        const base = Date.parse('2026-02-25T00:00:00.000Z');
        localStorage.setItem(
          recoveryKey('user-1'),
          JSON.stringify({
            _timestamp: base,
            _userId: 'user-1',
            data: {
              ...structuredClone(defaultState),
              pvp: { ...structuredClone(defaultState.pvp), displayName: 'recovered' },
            },
          })
        );
        single.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
        syncInitialState.mockResolvedValue(null);
        await initializeTarkovSync();
        await settleBackgroundWork();
        expect(useTarkovStore().pvp.displayName).toBe('recovered');
        expect(syncInitialState).toHaveBeenCalledOnce();
        expect(localStorage.getItem(recoveryKey('user-1'))).not.toBeNull();
        // A later scheduled retry, not the first attempt, is acknowledged.
        const options = useSupabaseSyncMock.mock.calls.at(-1)?.[0] as { onSynced: () => void };
        if (acknowledged) options.onSynced();
        expect(localStorage.getItem(recoveryKey('user-1')) === null).toBe(acknowledged);
      }
    );
    it('reports possibly unsynced progress only when local state could await the cloud', async () => {
      const { mayHoldUnsyncedProgress } = await import('@/stores/useTarkov');
      const store = useTarkovStore();
      expect(mayHoldUnsyncedProgress('user-1')).toBe(false);
      localStorage.setItem(recoveryKey('user-1'), '{"_userId":"user-1","data":{}}');
      expect(mayHoldUnsyncedProgress('user-1')).toBe(true);
      localStorage.removeItem(recoveryKey('user-1'));
      store.$patch((state) => {
        state.pvp = progressWithLevel(4);
      });
      expect(mayHoldUnsyncedProgress('user-1')).toBe(true);
    });
    it('retries a rejected startup recovery copy removal on the next upload', async () => {
      const store = useTarkovStore();
      localStorage.setItem(
        recoveryKey('user-1'),
        JSON.stringify({
          _timestamp: Date.parse('2026-02-25T00:00:00.000Z'),
          _userId: 'user-1',
          data: { ...structuredClone(defaultState), pvp: progressWithLevel(5) },
        })
      );
      single.mockResolvedValue({
        data: createRemoteRow({
          pvp_data: progressWithLevel(1),
          updated_at: '2026-02-01T00:00:00.000Z',
        }),
        error: null,
      });
      const removeItem = vi.spyOn(localStorage, 'removeItem').mockImplementation((key: string) => {
        if (key === recoveryKey('user-1')) throw new DOMException('denied', 'SecurityError');
      });
      await initializeTarkovSync();
      expect(store.pvp.level).toBe(5);
      expect(localStorage.getItem(recoveryKey('user-1'))).not.toBeNull();
      removeItem.mockRestore();
      const options = useSupabaseSyncMock.mock.calls.at(-1)?.[0] as { onSynced: () => void };
      options.onSynced();
      expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
    });
    it('retries recovery copy retirement on a later upload when removal fails', async () => {
      localStorage.setItem(
        recoveryKey('user-1'),
        JSON.stringify({
          _timestamp: Date.parse('2026-02-25T00:00:00.000Z'),
          _userId: 'user-1',
          data: {
            ...structuredClone(defaultState),
            pvp: { ...structuredClone(defaultState.pvp), displayName: 'recovered' },
          },
        })
      );
      single.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
      syncInitialState.mockResolvedValue(null);
      await initializeTarkovSync();
      await settleBackgroundWork();
      const options = useSupabaseSyncMock.mock.calls.at(-1)?.[0] as { onSynced: () => void };
      const removeItem = vi.spyOn(localStorage, 'removeItem').mockImplementationOnce(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      options.onSynced();
      expect(localStorage.getItem(recoveryKey('user-1'))).not.toBeNull();
      removeItem.mockRestore();
      options.onSynced();
      expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
    });
    it('does not fold the transition placeholder into the next owner recovery copy', async () => {
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      useTarkovStore();
      const base = Date.parse('2026-02-25T00:00:00.000Z');
      const recovery = JSON.stringify({
        _timestamp: base,
        _userId: 'user-2',
        data: {
          ...structuredClone(defaultState),
          pvp: { ...progressWithLevel(6), displayName: 'second-owner' },
        },
      });
      localStorage.setItem(recoveryKey('user-2'), recovery);
      writeActiveCopy('user-1', 3, base);
      await switchSession('user-1', 'user-2');
      expect(localStorage.getItem(recoveryKey('user-2'))).toBe(recovery);
    });
    it('does not restore a recovery copy older than the owner active copy', async () => {
      const store = useTarkovStore();
      const base = Date.parse('2026-02-25T00:00:00.000Z');
      localStorage.setItem(
        recoveryKey('user-1'),
        JSON.stringify({
          _timestamp: base,
          _userId: 'user-1',
          data: { ...structuredClone(defaultState), pvp: progressWithLevel(5) },
        })
      );
      writeActiveCopy('user-1', 9, base + 1000);
      single.mockResolvedValue({
        data: createRemoteRow({
          pvp_data: progressWithLevel(1),
          updated_at: '2026-02-01T00:00:00.000Z',
        }),
        error: null,
      });
      await initializeTarkovSync();
      expect(store.pvp.level).toBe(9);
      expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
    });
    it('skips the recovery copy when the cloud acknowledged every change', async () => {
      const hasPendingChanges = vi.fn(() => false);
      useSupabaseSyncMock.mockReturnValue({
        cleanup: cleanupSync,
        syncToSupabase: syncInitialState,
        pause: pauseSync,
        resume: resumeSync,
        hasPendingChanges,
      } as unknown as ReturnType<typeof useSupabaseSyncMock>);
      writeActiveCopy('user-1', 3, Date.parse('2026-02-25T00:00:00.000Z'));
      await initializeTarkovSync();
      await switchSession('user-1', null, 'logout');
      expect(hasPendingChanges).toHaveBeenCalled();
      expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
    });
    it('keeps other accounts recovery copies and backups across session transitions', async () => {
      localStorage.setItem(recoveryKey('user-9'), '{"_userId":"user-9","data":{}}');
      localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-9_123`, '{"data":{}}');
      writeActiveCopy('user-1', 3, Date.parse('2026-02-25T00:00:00.000Z'));
      await switchSession('user-1', 'user-2', 'account switch');
      expect(localStorage.getItem(STORAGE_KEYS.progress) ?? '').not.toContain('"user-1"');
      expect(localStorage.getItem(recoveryKey('user-9'))).not.toBeNull();
      expect(localStorage.getItem(`${STORAGE_KEYS.progressBackupPrefix}user-9_123`)).not.toBeNull();
      expect(readRecoveryLevel('user-1')).toBe(3);
    });
    it('retains nothing for an owner whose device data removal is pending', async () => {
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      const { requestDeviceDataRemoval, clearDeviceDataRemoval } =
        await import('@/stores/tarkov/deviceData');
      localStorage.setItem(recoveryKey('user-1'), '{"_userId":"user-1","data":{}}');
      localStorage.setItem(recoveryKey('user-2'), '{"_userId":"user-2","data":{}}');
      writeActiveCopy('user-1', 15, Date.parse('2026-02-25T00:00:00.000Z'));
      resetTarkovSync('capture pre-removal handoff', {
        preservePersistedStateForUserId: 'user-1',
      });
      requestDeviceDataRemoval('user-1');
      await switchSession('user-1', null, 'logout');
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
      expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
      expect(localStorage.getItem(recoveryKey('user-2'))).not.toBeNull();
      clearDeviceDataRemoval();
      single.mockResolvedValue({
        data: createRemoteRow({
          user_id: 'user-1',
          pvp_data: progressWithLevel(2),
        }),
        error: null,
      });
      await switchSession(null, 'user-1', 'owner signs back in after device removal');
      await initializeTarkovSync();
      expect(useTarkovStore().pvp.level).toBe(2);
    });
    it('retains a mismatched owner copy found during hydration as its recovery copy', () => {
      writeActiveCopy('user-9', 6, Date.parse('2026-02-25T00:00:00.000Z'));
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      const store = useTarkovStore();
      expect(store.pvp.level).toBe(1);
      expect(readRecoveryLevel('user-9')).toBe(6);
      expect(
        Object.keys(localStorage).some((key) => key.startsWith(STORAGE_KEYS.progressBackupPrefix))
      ).toBe(false);
    });
    it('protects an owner-scoped active copy during guest hydration when recovery storage is full', async () => {
      const original = JSON.stringify({
        _timestamp: 10,
        _userId: 'user-1',
        data: { ...structuredClone(defaultState), pvp: progressWithLevel(15) },
      });
      localStorage.setItem(STORAGE_KEYS.progress, original);
      supabaseContext.user.id = null;
      supabaseContext.user.loggedIn = false;
      const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === recoveryKey('user-1')) throw new Error('full');
        return Storage.prototype.setItem.call(localStorage, key, value);
      });
      const pinia = createPinia().use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);
      const store = useTarkovStore();
      expect(store.pvp.level).toBe(defaultState.pvp.level);
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
      await clearActiveProgressStorage();
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
      progressPersistStorage.setItem(
        STORAGE_KEYS.progress,
        JSON.stringify({ _userId: null, data: defaultState })
      );
      await flushActiveProgressWrites();
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
      setItem.mockRestore();
    });
    it('retains the latest owner envelope before a cross-tab write replaces it', async () => {
      const latestOwnerCopy = JSON.stringify({
        _timestamp: 22,
        _userId: 'user-9',
        data: { ...structuredClone(defaultState), pvp: progressWithLevel(21) },
      });
      localStorage.setItem(STORAGE_KEYS.progress, latestOwnerCopy);
      progressPersistStorage.setItem(
        STORAGE_KEYS.progress,
        JSON.stringify({ _timestamp: 23, _userId: 'user-2', data: defaultState })
      );
      await flushActiveProgressWrites();
      expect(readRecoveryLevel('user-9')).toBe(21);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) ?? '{}')._userId).toBe(
        'user-2'
      );
    });
    it('blocks a new owner from replacing the active copy when recovery retention fails', async () => {
      const store = useTarkovStore();
      store.$patch((state) => {
        state.pvp.level = 15;
      });
      const original = JSON.stringify({
        _timestamp: 10,
        _userId: 'user-1',
        data: { ...structuredClone(defaultState), pvp: progressWithLevel(15) },
      });
      localStorage.setItem(STORAGE_KEYS.progress, original);
      const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === recoveryKey('user-1')) throw new Error('full');
        return Storage.prototype.setItem.call(localStorage, key, value);
      });
      await switchSession('user-1', null, 'quota during sign-out');
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
      expect(store.pvp.level).toBe(defaultState.pvp.level);
      await switchSession(null, 'user-2', 'quota persists during next sign-in');
      expect(store.pvp.level).toBe(defaultState.pvp.level);
      progressPersistStorage.setItem(
        STORAGE_KEYS.progress,
        JSON.stringify({ _userId: 'user-2', data: defaultState })
      );
      await flushActiveProgressWrites();
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
      await expect(initializeTarkovSync()).rejects.toThrow('Account recovery retention is blocked');
      expect(useSupabaseSyncMock).not.toHaveBeenCalled();
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
      setItem.mockRestore();
      single.mockResolvedValue({
        data: createRemoteRow({
          user_id: 'user-2',
          pvp_data: progressWithLevel(2),
        }),
        error: null,
      });
      await initializeTarkovSync();
      expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
      expect(readRecoveryLevel('user-1')).toBe(15);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) ?? '{}')._userId).toBe(
        'user-2'
      );
      expect(useTarkovStore().pvp.level).toBe(2);
    });
    it('aborts sign-in when a foreign active copy cannot be retained', async () => {
      const original = JSON.stringify({
        _timestamp: 10,
        _userId: 'user-9',
        data: { ...structuredClone(defaultState), pvp: progressWithLevel(15) },
      });
      localStorage.setItem(STORAGE_KEYS.progress, original);
      vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === recoveryKey('user-9')) throw new Error('storage full');
        return Storage.prototype.setItem.call(localStorage, key, value);
      });
      await expect(initializeTarkovSync()).rejects.toThrow('Account recovery retention is blocked');
      expect(useSupabaseSyncMock).not.toHaveBeenCalled();
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
      expect(showLoadFailed).toHaveBeenCalled();
    });
    it('aborts sign-in when the current recovery copy is malformed', async () => {
      localStorage.setItem(recoveryKey('user-1'), '{malformed');
      await expect(initializeTarkovSync()).rejects.toThrow('Account recovery retention is blocked');
      expect(useSupabaseSyncMock).not.toHaveBeenCalled();
      expect(localStorage.getItem(recoveryKey('user-1'))).toBe('{malformed');
      expect(showLoadFailed).toHaveBeenCalled();
    });
    it('aborts reconciliation when a foreign active copy appears after the startup guard', async () => {
      const original = JSON.stringify({
        _timestamp: 10,
        _userId: 'user-9',
        data: { ...structuredClone(defaultState), pvp: progressWithLevel(15) },
      });
      localStorage.setItem(STORAGE_KEYS.progress, original);
      const getItem = localStorage.getItem.bind(localStorage);
      let activeReads = 0;
      vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => {
        if (key === STORAGE_KEYS.progress) {
          activeReads += 1;
          if (activeReads === 1) return null;
        }
        return getItem(key);
      });
      vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === recoveryKey('user-9')) throw new Error('storage full');
        return Storage.prototype.setItem.call(localStorage, key, value);
      });
      await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
      expect(activeReads).toBeGreaterThanOrEqual(2);
      expect(useSupabaseSyncMock).not.toHaveBeenCalled();
      expect(Storage.prototype.getItem.call(localStorage, STORAGE_KEYS.progress)).toBe(original);
    });
    it('releases only the removed owner retention barrier after explicit device-data removal', async () => {
      const original = JSON.stringify({
        _timestamp: 10,
        _userId: 'user-1',
        data: { ...structuredClone(defaultState), pvp: progressWithLevel(15) },
      });
      localStorage.setItem(STORAGE_KEYS.progress, original);
      const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === recoveryKey('user-1')) throw new Error('full');
        return Storage.prototype.setItem.call(localStorage, key, value);
      });
      await switchSession('user-1', null, 'quota during sign-out');
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
      const { removeAccountDeviceData, requestDeviceDataRemoval } =
        await import('@/stores/tarkov/deviceData');
      requestDeviceDataRemoval('user-1');
      await removeAccountDeviceData('user-1');
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
      setItem.mockRestore();
      await switchSession(null, 'user-2', 'owner removed local data');
      await initializeTarkovSync();
      expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
      expect(useTarkovStore().pvp.level).toBe(defaultState.pvp.level);
    });
    it('archives recovery-only progress before applying a higher remote reset epoch', async () => {
      const localEpoch = 1;
      const raw = JSON.stringify({
        _timestamp: Date.parse('2026-02-25T00:00:00.000Z'),
        _userId: 'user-1',
        data: {
          ...structuredClone(defaultState),
          pvp: { ...progressWithLevel(12), progressEpoch: localEpoch },
        },
      });
      localStorage.setItem(recoveryKey('user-1'), raw);
      single.mockResolvedValue({
        data: createRemoteRow({
          pvp_data: { ...progressWithLevel(1), progressEpoch: localEpoch + 1 },
        }),
        error: null,
      });
      await initializeTarkovSync();
      expect(listSupersededProgressCopies('user-1')).toEqual([
        expect.objectContaining({
          mode: 'pvp',
          seasonNumber: null,
          progress: expect.objectContaining({ level: 12, progressEpoch: localEpoch }),
        }),
      ]);
      expect(useTarkovStore().pvp.progressEpoch).toBe(localEpoch + 1);
      expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
    });
    it('retains displaced Seasonal progress with its active season before a remote reset', async () => {
      const localEpoch = 1;
      const raw = JSON.stringify({
        _timestamp: Date.parse('2026-02-25T00:00:00.000Z'),
        _userId: 'user-1',
        data: {
          ...structuredClone(defaultState),
          seasonalSeasonNumber: ACTIVE_SEASON_NUMBER,
          seasonal: { ...progressWithLevel(12), progressEpoch: localEpoch },
        },
      });
      localStorage.setItem(recoveryKey('user-1'), raw);
      modeProgressResult.data = [
        {
          game_mode: 'seasonal',
          season_number: ACTIVE_SEASON_NUMBER,
          progress_data: { ...progressWithLevel(1), progressEpoch: localEpoch + 1 },
        },
      ];
      await initializeTarkovSync();
      expect(listSupersededProgressCopies('user-1')).toEqual([
        expect.objectContaining({
          mode: 'seasonal',
          seasonNumber: ACTIVE_SEASON_NUMBER,
          progress: expect.objectContaining({ level: 12, progressEpoch: localEpoch }),
        }),
      ]);
      expect(useTarkovStore().seasonal.progressEpoch).toBe(localEpoch + 1);
    });
    it('keeps recovery-only progress and aborts reconciliation when reset archival fails', async () => {
      const raw = JSON.stringify({
        _timestamp: Date.parse('2026-02-25T00:00:00.000Z'),
        _userId: 'user-1',
        data: {
          ...structuredClone(defaultState),
          pvp: { ...progressWithLevel(12), progressEpoch: 1 },
        },
      });
      localStorage.setItem(recoveryKey('user-1'), raw);
      single.mockResolvedValue({
        data: createRemoteRow({ pvp_data: { ...progressWithLevel(1), progressEpoch: 2 } }),
        error: null,
      });
      const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) throw new Error('full');
        return Storage.prototype.setItem.call(localStorage, key, value);
      });
      await expect(initializeTarkovSync()).rejects.toThrow('Supabase initial load failed');
      expect(localStorage.getItem(recoveryKey('user-1'))).toBe(raw);
      expect(listSupersededProgressCopies('user-1')).toEqual([]);
      expect(useTarkovStore().pvp.progressEpoch).toBe(1);
      expect(useSupabaseSyncMock).not.toHaveBeenCalled();
      setItem.mockRestore();
      await initializeTarkovSync();
      expect(listSupersededProgressCopies('user-1')).toEqual([
        expect.objectContaining({
          mode: 'pvp',
          progress: expect.objectContaining({ level: 12, progressEpoch: 1 }),
        }),
      ]);
      expect(useTarkovStore().pvp.progressEpoch).toBe(2);
      expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
    });
  });
});
