// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTarkovSync, resetTarkovSync, useTarkovStore } from '@/stores/useTarkov';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { UserProgressData } from '@/stores/progressState';
const {
  channel,
  cleanupSync,
  createRemoteRow,
  getRealtimeCallback,
  i18nTranslate,
  loggerMock,
  pauseSync,
  resumeSync,
  setRealtimeCallback,
  showApiUpdated,
  showLoadFailed,
  showLocalIgnored,
  showProgressMerged,
  single,
  supabaseContext,
  upsert,
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
    skillOffsets: {},
    storyChapters: {},
    ...overrides,
  });
  const createRemoteRow = (
    overrides: Partial<{
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
  };
  const showApiUpdated = vi.fn();
  const showLoadFailed = vi.fn();
  const showLocalIgnored = vi.fn();
  const showProgressMerged = vi.fn();
  const cleanupSync = vi.fn();
  const pauseSync = vi.fn();
  const resumeSync = vi.fn();
  const useSupabaseSyncMock = vi.fn((_options?: unknown) => ({
    cleanup: cleanupSync,
    pause: pauseSync,
    resume: resumeSync,
  }));
  type RemoteRow = ReturnType<typeof createRemoteRow>;
  type SupabaseErrorLike = { code?: string; message: string } | null;
  type SingleResult = { data: RemoteRow | null; error: SupabaseErrorLike };
  type UpsertResult = { error: SupabaseErrorLike };
  const single = vi.fn(
    async (): Promise<SingleResult> => ({ data: createRemoteRow(), error: null })
  );
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn(async (): Promise<UpsertResult> => ({ error: null }));
  const from = vi.fn(() => ({
    eq,
    select,
    single,
    upsert,
  }));
  const channel = {
    on: vi.fn((_: string, __: Record<string, unknown>, callback: typeof realtimeState.callback) => {
      realtimeState.callback = callback;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
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
      id: 'user-1',
      loggedIn: true,
      providers: [] as string[],
    },
    client: {
      channel: vi.fn(() => channel),
      from,
      removeChannel: vi.fn(),
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
    createRemoteRow,
    getRealtimeCallback: () => realtimeState.callback,
    i18nTranslate,
    loggerMock,
    pauseSync,
    resumeSync,
    setRealtimeCallback: (callback: ((payload: { new: unknown; old: unknown }) => void) | null) => {
      realtimeState.callback = callback;
    },
    showApiUpdated,
    showLoadFailed,
    showLocalIgnored,
    showProgressMerged,
    single,
    supabaseContext,
    upsert,
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
  useSupabaseSync: () => useSupabaseSyncMock(),
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
  useMetadataStore: () => ({
    getTaskById: (taskId: string) => ({
      id: taskId,
      name: `Task ${taskId}`,
    }),
    tasks: [],
  }),
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
  skillOffsets: {},
  storyChapters: {},
});
const cloneProgress = (value: UserProgressData): UserProgressData => {
  return JSON.parse(JSON.stringify(value)) as UserProgressData;
};
const setLocalProgress = (level = 5) => {
  const store = useTarkovStore();
  store.$patch((state) => {
    state.pvp.level = level;
  });
};
describe('useTarkov sync integration', () => {
  beforeEach(() => {
    resetTarkovSync('test setup');
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    setRealtimeCallback(null);
    supabaseContext.user.id = 'user-1';
    supabaseContext.user.loggedIn = true;
    supabaseContext.user.providers = [];
    supabaseContext.user.createdAt = '2026-02-20T00:00:00.000Z';
    single.mockResolvedValue({ data: createRemoteRow(), error: null });
    upsert.mockResolvedValue({ error: null });
    channel.on.mockImplementation((_: string, __: Record<string, unknown>, callback) => {
      setRealtimeCallback(callback as (payload: { new: unknown; old: unknown }) => void);
      return channel;
    });
    channel.subscribe.mockImplementation(() => channel);
    useSupabaseSyncMock.mockReturnValue({
      cleanup: cleanupSync,
      pause: pauseSync,
      resume: resumeSync,
    });
  });
  afterEach(() => {
    resetTarkovSync('test teardown');
    localStorage.clear();
  });
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
  it('shows other_account toast and clears mismatched local data', async () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({
        _timestamp: Date.now(),
        _userId: 'other-user',
        data: useTarkovStore().$state,
      })
    );
    await initializeTarkovSync();
    expect(showLocalIgnored).toHaveBeenCalledWith('other_account');
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
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
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[TarkovStore] Could not persist local ownership metadata:',
      expect.any(Error)
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
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        pvp_data: expect.objectContaining({ level: 10 }),
      })
    );
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
    expect(upsert).not.toHaveBeenCalled();
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
    upsert.mockResolvedValueOnce({
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
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(useSupabaseSyncMock).toHaveBeenCalledTimes(1);
    expect(showLoadFailed).not.toHaveBeenCalled();
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
  it('shows merge toast for realtime conflicts when no API update metadata is present', async () => {
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithTaskState('task-1', false),
      }),
      error: null,
    });
    await initializeTarkovSync();
    const callback = getRealtimeCallback();
    expect(callback).toBeTypeOf('function');
    showApiUpdated.mockClear();
    showProgressMerged.mockClear();
    callback?.({
      new: {
        current_game_mode: 'pvp',
        game_edition: 1,
        tarkov_uid: null,
        pvp_data: progressWithTaskState('task-1', true),
        pve_data: progressWithTaskState('task-2', false),
        updated_at: '2000-01-01T00:00:00.000Z',
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
    const callback = getRealtimeCallback();
    showProgressMerged.mockClear();
    callback?.({
      new: {
        current_game_mode: store.currentGameMode,
        game_edition: store.gameEdition,
        tarkov_uid: store.tarkovUid,
        pvp_data: {
          ...cloneProgress(store.pvp),
          taskObjectives: { 'obj-1': { complete: false, count: 2 } },
          hideoutModules: { 'mod-1': { complete: true } },
          hideoutParts: { 'part-1': { complete: false, count: 2 } },
        },
        pve_data: cloneProgress(store.pve),
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
    const callback = getRealtimeCallback();
    expect(callback).toBeTypeOf('function');
    showApiUpdated.mockClear();
    showProgressMerged.mockClear();
    const now = Date.now();
    callback?.({
      new: {
        current_game_mode: 'pvp',
        game_edition: 1,
        tarkov_uid: null,
        pvp_data: {
          ...progressWithTaskState('task-1', true),
          lastApiUpdate: {
            id: `api-pvp-${now}`,
            at: now,
            source: 'api',
            tasks: [{ id: 'task-1', state: 'completed' }],
          },
        },
        pve_data: {
          ...progressWithTaskState('task-2', true),
          lastApiUpdate: {
            id: `api-pve-${now}`,
            at: now,
            source: 'api',
            tasks: [{ id: 'task-2', state: 'completed' }],
          },
        },
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
  it('deduplicates repeated API update toast payloads by update id', async () => {
    const now = Date.now();
    single.mockResolvedValue({
      data: createRemoteRow({
        pvp_data: progressWithTaskState('task-1', false),
      }),
      error: null,
    });
    await initializeTarkovSync();
    const callback = getRealtimeCallback();
    expect(callback).toBeTypeOf('function');
    const payload = {
      current_game_mode: 'pvp',
      game_edition: 1,
      tarkov_uid: null,
      pvp_data: {
        ...progressWithTaskState('task-1', true),
        lastApiUpdate: {
          id: 'duplicate-api-id',
          at: now,
          source: 'api',
          tasks: [{ id: 'task-1', state: 'completed' }],
        },
      },
      pve_data: progressWithTaskState('task-2', false),
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
    let callback = getRealtimeCallback();
    expect(callback).toBeTypeOf('function');
    const payload = {
      current_game_mode: 'pvp',
      game_edition: 1,
      tarkov_uid: null,
      pvp_data: {
        ...progressWithTaskState('task-1', true),
        lastApiUpdate: {
          id: 'reset-dedupe-id',
          at: now,
          source: 'api',
          tasks: [{ id: 'task-1', state: 'completed' }],
        },
      },
      pve_data: progressWithTaskState('task-2', false),
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
    callback = getRealtimeCallback();
    callback?.({
      new: {
        ...payload,
        updated_at: new Date(now + 2000).toISOString(),
      },
      old: {},
    });
    expect(showApiUpdated).toHaveBeenCalledTimes(2);
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
});
