// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { queueIdleTask } from '@/utils/idleScheduler';
import * as cacheUtils from '@/utils/tarkovCache';
import { createDeferred } from '@/utils/test-helpers';
import type { Task } from '@/types/tarkov';
vi.mock('@/utils/idleScheduler', () => ({ queueIdleTask: vi.fn(async () => undefined) }));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const deferredEdition = () => {
  const call = vi.mocked(queueIdleTask).mock.calls.find(([, options]) => options?.timeout === 3500);
  expect(call).toBeDefined();
  return call![0];
};
describe('metadata task readiness ownership', () => {
  let store: ReturnType<typeof useMetadataStore>;
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    store = useMetadataStore();
    store.initialized = true;
    store.tasks = [{ id: 'task-1', name: 'Task', objectives: [] }] as Task[];
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.spyOn(cacheUtils, 'cleanupExpiredCache').mockResolvedValue(0);
    for (const action of [
      'checkCachePurge',
      'fetchBootstrapData',
      'fetchTasksCoreData',
      'fetchHideoutData',
      'fetchItemsLiteData',
      'fetchTaskObjectivesData',
      'fetchTaskRewardsData',
      'fetchPrestigeData',
    ] as const) {
      vi.spyOn(store, action).mockResolvedValue();
    }
    vi.spyOn(store, 'assertCriticalMetadataReady').mockImplementation(() => undefined);
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ editions: {}, storyChapters: {} }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('holds readiness during initialization before cached core loading starts', async () => {
    const setup = createDeferred<undefined>();
    vi.spyOn(store, 'updateLanguageAndGameMode').mockImplementation(() => {
      store.languageCode = 'fr';
    });
    vi.spyOn(store, 'loadStaticMapData').mockReturnValueOnce(setup.promise);
    vi.spyOn(store, 'loadCriticalCacheData').mockResolvedValue(null);
    const initialization = store.initialize();
    expect(store.tasksCoreRefreshing).toBe(true);
    setup.resolve(undefined);
    await initialization;
    expect(store.tasksCoreRefreshing).toBe(false);
  });
  it('clears readiness when initialization fails before fetching core data', async () => {
    vi.spyOn(store, 'updateLanguageAndGameMode').mockImplementation(() => undefined);
    vi.spyOn(store, 'loadStaticMapData').mockRejectedValueOnce(new Error('setup failed'));
    await expect(store.initialize()).rejects.toThrow('setup failed');
    expect(store.tasksCoreRefreshing).toBe(false);
  });
  it('marks the core refresh pending before bootstrap and clears it after core settlement', async () => {
    const bootstrap = createDeferred<undefined>();
    const core = createDeferred<undefined>();
    vi.mocked(store.fetchBootstrapData).mockReturnValueOnce(bootstrap.promise);
    vi.mocked(store.fetchTasksCoreData).mockReturnValueOnce(core.promise);
    const pending = store.fetchAllData(false, { deferHeavy: true });
    expect(store.tasksCoreRefreshing).toBe(true);
    bootstrap.resolve(undefined);
    await flushPromises();
    expect(store.tasksCoreRefreshing).toBe(true);
    core.resolve(undefined);
    await pending;
    expect(store.tasksCoreRefreshing).toBe(false);
  });
  it('does not let an older refresh clear the current pending phase', async () => {
    const older = createDeferred<undefined>();
    const current = createDeferred<undefined>();
    vi.mocked(store.fetchBootstrapData)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(current.promise);
    const first = store.fetchAllData(false, { deferHeavy: true });
    const second = store.fetchAllData(false, { deferHeavy: true });
    older.resolve(undefined);
    await first;
    expect(store.tasksCoreRefreshing).toBe(true);
    current.resolve(undefined);
    await second;
    expect(store.tasksCoreRefreshing).toBe(false);
  });
  it('clears the pending phase when core fetching fails', async () => {
    vi.mocked(store.fetchTasksCoreData).mockRejectedValueOnce(new Error('core offline'));
    await expect(store.fetchAllData(false, { deferHeavy: true })).rejects.toThrow('core offline');
    expect(store.tasksCoreRefreshing).toBe(false);
  });
  it.each([false, true])(
    'consumes queued editions after an eager request (forced queue: %s)',
    async (forceRefresh) => {
      await store.fetchAllData(forceRefresh, { deferHeavy: true });
      await store.fetchEditionsData();
      await deferredEdition()();
      expect($fetch).toHaveBeenCalledTimes(1);
    }
  );
  it('consumes queued editions when the eager caller joins an existing request', async () => {
    const response = createDeferred<object>();
    vi.mocked($fetch).mockReturnValueOnce(response.promise);
    const first = store.fetchEditionsData();
    await flushPromises();
    await store.fetchAllData(false, { deferHeavy: true });
    const joined = store.fetchEditionsData();
    response.resolve({ editions: {}, storyChapters: {} });
    await Promise.all([first, joined]);
    await deferredEdition()();
    expect($fetch).toHaveBeenCalledTimes(1);
  });
  it('retains deferred editions when no eager request takes ownership', async () => {
    await store.fetchAllData(false, { deferHeavy: true });
    expect($fetch).not.toHaveBeenCalled();
    await deferredEdition()();
    expect($fetch).toHaveBeenCalledTimes(1);
  });
});
