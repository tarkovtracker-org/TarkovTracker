// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, onScopeDispose } from 'vue';
import { useTaskDetailReadiness } from '@/composables/useTaskDetailReadiness';
import * as persistence from '@/stores/tarkov/progressPersistence';
import { getPromiseStore } from '@/stores/tarkov/promiseStore';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import * as cache from '@/utils/tarkovCache';
import { createDeferred } from '@/utils/test-helpers';
import type { StoryChapter } from '@/types/tarkov';
const idle = vi.hoisted(() => ({ tasks: [] as Array<() => void> }));
vi.mock('@/utils/idleScheduler', () => ({
  queueIdleTask: vi.fn(
    (task: () => void | Promise<void>) =>
      new Promise<void>((resolve, reject) => {
        idle.tasks.push(() => {
          void Promise.resolve().then(task).then(resolve, reject);
        });
      })
  ),
}));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const parentId = 'a'.repeat(24);
const childId = 'b'.repeat(24);
const invalidations = ['mode', 'language', 'owner', 'abort'] as const;
const chapter = (linked = false): StoryChapter => ({
  id: 'tour',
  name: 'Tour',
  normalizedName: 'tour',
  order: 1,
  wikiLink: '',
  objectives: {
    [parentId]: {
      id: parentId,
      description: 'Main',
      type: 'main',
      sourceQuestId: 'quest',
      order: 1,
    },
    [childId]: {
      id: childId,
      description: 'Optional',
      type: 'optional',
      sourceQuestId: 'quest',
      order: 2,
      ...(linked ? { parentObjectiveId: parentId } : {}),
    },
  },
});
const bundle = (scope = 'regular-en') => ({
  scope,
  tasksCore: { tasks: [{ id: 'task', name: 'Task' }], maps: [], traders: [] },
  hideout: { hideoutStations: [{ id: 'station', name: 'Station', levels: [] }] },
  prestige: { prestige: [] },
  editions: { editions: [], storyChapters: [chapter()] },
});
const response = () => ({ data: { editions: [], storyChapters: [chapter(true)] } });
const startIdle = async () => {
  idle.tasks.splice(0).forEach((task) => task());
  await flushPromises();
};
const prepare = () => {
  const store = useMetadataStore();
  for (const key of [
    'loadStaticMapData',
    'checkCachePurge',
    'fetchBootstrapData',
    'fetchItemsLiteData',
    'fetchTaskObjectivesData',
    'fetchTaskRewardsData',
    'fetchObjectiveModeCountDifferences',
  ] as const)
    vi.spyOn(store, key).mockResolvedValue(undefined);
  vi.spyOn(store, 'loadCriticalCacheData').mockResolvedValue(bundle() as never);
  return store;
};
const warm = (store: ReturnType<typeof useMetadataStore>, options = {}) =>
  store.fetchAllData(false, { cachedData: bundle() as never, ...options });
describe('complete cached startup catalog freshness', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    idle.tasks.length = 0;
    vi.spyOn(cache, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cache, 'setCachedData').mockResolvedValue();
    vi.spyOn(cache, 'cleanupExpiredCache').mockResolvedValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('renders cached data without waiting, then adopts fresh links without progress writes', async () => {
    const store = prepare();
    const progress = useTarkovStore();
    progress.pvp.storyChapters = {
      tour: { objectives: { [parentId]: { complete: true, timestamp: 1 } } },
    };
    const progressBefore = JSON.stringify(progress.$state);
    const mutation = vi.spyOn(persistence, 'executeProgressMutation');
    const sync = vi.spyOn(persistence, 'syncProgressState');
    const pending = createDeferred<object>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('$fetch', fetch);
    await store.initialize({ gameMode: 'pvp' });
    expect(store.initialized).toBe(true);
    expect(store.storyChapters[0]?.objectives?.[childId]).not.toHaveProperty('parentObjectiveId');
    expect(fetch).not.toHaveBeenCalled();
    await startIdle();
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/tarkov/editions', {
      query: { lang: 'en', gameMode: 'regular' },
    });
    pending.resolve(response());
    await flushPromises();
    expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
    expect(JSON.stringify(progress.$state)).toBe(progressBefore);
    expect(mutation).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    await warm(store, { cachedData: { ...bundle(), editions: response().data } as never });
    await startIdle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
  });
  it('keeps the last-good cache after failure and retries on a later cached startup', async () => {
    const store = prepare();
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response());
    vi.stubGlobal('$fetch', fetch);
    await warm(store);
    await startIdle();
    expect(store.storyChapters[0]?.objectives?.[childId]).not.toHaveProperty('parentObjectiveId');
    expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(false);
    await warm(store);
    await startIdle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
  });
  it.each(['pending', 'failed'])(
    'does not replace a validated live catalog while its cache write is %s',
    async (kind) => {
      const store = prepare();
      const write = createDeferred<undefined>();
      vi.mocked(cache.setCachedData).mockReturnValue(write.promise);
      const fetch = vi.fn().mockResolvedValue(response());
      vi.stubGlobal('$fetch', fetch);
      await warm(store);
      await startIdle();
      expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
      if (kind === 'failed') write.reject(new Error('cache unavailable'));
      await flushPromises();
      await warm(store);
      expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
      await startIdle();
      expect(fetch).toHaveBeenCalledTimes(1);
      if (kind === 'pending') write.resolve(undefined);
      await flushPromises();
    }
  );
  it.each(['pending', 'failed'])(
    'preserves live data across an explicit same-scope fetch while its cache write is %s',
    async (kind) => {
      const store = prepare();
      const write = createDeferred<undefined>();
      vi.mocked(cache.setCachedData).mockReturnValue(write.promise);
      vi.mocked(cache.getCachedData).mockResolvedValue({
        editions: [
          {
            id: 'standard',
            value: 1,
            title: 'Standard',
            defaultStashLevel: 1,
            defaultCultistCircleLevel: 0,
            traderRepBonus: {},
          },
        ],
        storyChapters: [chapter()],
      });
      const fetch = vi.fn().mockResolvedValue(response());
      vi.stubGlobal('$fetch', fetch);
      try {
        await warm(store);
        await startIdle();
        if (kind === 'failed') write.reject(new Error('cache unavailable'));
        await flushPromises();
        await store.fetchEditionsData();
        await flushPromises();
        expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
        expect(fetch).toHaveBeenCalledTimes(1);
        await store.fetchEditionsData(true);
        expect(fetch).toHaveBeenNthCalledWith(2, '/api/tarkov/editions', {
          query: { lang: 'en', gameMode: 'regular', cacheBust: '1' },
        });
        await store.fetchEditionsData(false, { revalidate: true });
        expect(fetch).toHaveBeenNthCalledWith(3, '/api/tarkov/editions', {
          query: { lang: 'en', gameMode: 'regular' },
        });
      } finally {
        if (kind === 'pending') write.resolve(undefined);
        await flushPromises();
      }
    }
  );
  it('rechecks browser data after a cancelled refresh loses the settled live proof', async () => {
    const store = prepare();
    vi.mocked(cache.setCachedData).mockRejectedValue(new Error('storage unavailable'));
    vi.mocked(cache.getCachedData).mockResolvedValue({
      editions: [
        {
          id: 'standard',
          value: 1,
          title: 'Standard',
          defaultStashLevel: 1,
          defaultCultistCircleLevel: 0,
          traderRepBonus: {},
        },
      ],
      storyChapters: [chapter()],
    });
    const obsolete = createDeferred<object>();
    const fetch = vi
      .fn()
      .mockResolvedValue(response())
      .mockResolvedValueOnce(response())
      .mockReturnValueOnce(obsolete.promise);
    vi.stubGlobal('$fetch', fetch);
    await warm(store);
    await startIdle();
    const controller = new AbortController();
    const forced = store.fetchEditionsData(true, { signal: controller.signal });
    const rejected = expect(forced).rejects.toMatchObject({ name: 'AbortError' });
    await flushPromises();
    controller.abort();
    obsolete.resolve(response());
    await rejected;
    expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
    await store.fetchEditionsData();
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith('/api/tarkov/editions', {
      query: { lang: 'en', gameMode: 'regular' },
    });
    expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
  });
  it.each([
    ['mode', 'pending', 'network'],
    ['mode', 'failed', 'network'],
    ['language', 'pending', 'network'],
    ['language', 'failed', 'network'],
    ['mode', 'pending', 'cached'],
    ['mode', 'failed', 'cached'],
    ['language', 'pending', 'cached'],
    ['language', 'failed', 'cached'],
  ])(
    'rechecks a retired %s scope after a %s cache write and %s replacement',
    async (scopeKind, writeKind, replacement) => {
      const store = prepare();
      const write = createDeferred<undefined>();
      vi.mocked(cache.setCachedData).mockReturnValue(write.promise);
      vi.mocked(cache.getCachedData).mockResolvedValue({
        editions: [
          {
            id: 'standard',
            value: 1,
            title: 'Standard',
            defaultStashLevel: 1,
            defaultCultistCircleLevel: 0,
            traderRepBonus: {},
          },
        ],
        storyChapters: [chapter()],
      });
      const fetch = vi.fn().mockResolvedValue(response());
      vi.stubGlobal('$fetch', fetch);
      try {
        await warm(store);
        await startIdle();
        if (writeKind === 'failed') write.reject(new Error('cache unavailable'));
        await flushPromises();
        const changeScope = (away: boolean) => {
          if (scopeKind === 'mode') store.currentGameMode = away ? 'pve' : 'pvp';
          else store.languageCode = away ? 'fr' : 'en';
        };
        changeScope(true);
        if (replacement === 'cached') {
          const otherScope = scopeKind === 'mode' ? 'pve-en' : 'regular-fr';
          if (scopeKind === 'mode') {
            vi.mocked(store.loadCriticalCacheData).mockResolvedValueOnce(
              bundle(otherScope) as never
            );
            await store.initialize({ gameMode: 'pve' });
          } else {
            await store.fetchAllData(false, { cachedData: bundle(otherScope) as never });
          }
          await startIdle();
        } else {
          await store.fetchEditionsData(true);
          expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(false);
        }
        changeScope(false);
        await store.fetchEditionsData();
        await flushPromises();
        await warm(store);
        await startIdle();
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(fetch).toHaveBeenLastCalledWith('/api/tarkov/editions', {
          query: { lang: 'en', gameMode: 'regular' },
        });
        expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
      } finally {
        if (writeKind === 'pending') write.resolve(undefined);
        await flushPromises();
      }
    }
  );
  it.each(['mode', 'language', 'owner-disposal'])(
    'does not let a superseded awaited cache gate replace current work after %s changes',
    async (kind) => {
      const store = prepare();
      vi.mocked(cache.getCachedData).mockResolvedValue({
        editions: [
          {
            id: 'standard',
            value: 1,
            title: 'Standard',
            defaultStashLevel: 1,
            defaultCultistCircleLevel: 0,
            traderRepBonus: {},
          },
        ],
        storyChapters: [chapter()],
      });
      const fetch = vi.fn().mockResolvedValue(response());
      vi.stubGlobal('$fetch', fetch);
      await warm(store);
      if (kind !== 'owner-disposal') await startIdle();
      const initialRequests = fetch.mock.calls.length;
      const entered = createDeferred<undefined>();
      const resume = createDeferred<undefined>();
      const currentResponse = createDeferred<object>();
      const realGate = store.reuseOrApplyCachedEditions.bind(store);
      vi.spyOn(store, 'reuseOrApplyCachedEditions').mockImplementationOnce(async (...args) => {
        const result = await realGate(...args);
        entered.resolve(undefined);
        await resume.promise;
        return result;
      });
      let owner = true;
      const caller = effectScope();
      const superseded = caller.run(() => {
        onScopeDispose(() => {
          owner = false;
        });
        return store.fetchEditionsData(false, { isOwner: () => owner });
      })!;
      await entered.promise;
      if (kind === 'mode') store.currentGameMode = 'pve';
      if (kind === 'language') store.languageCode = 'fr';
      if (kind === 'owner-disposal') caller.stop();
      const scope = kind === 'mode' ? 'pve-en' : kind === 'language' ? 'regular-fr' : 'regular-en';
      fetch.mockReturnValue(currentResponse.promise);
      await store.fetchAllData(false, { cachedData: bundle(scope) as never, isOwner: () => true });
      await startIdle();
      const latest = store.ensureEditionsData();
      try {
        expect(fetch).toHaveBeenCalledTimes(initialRequests + 1);
        resume.resolve(undefined);
        await superseded;
        await flushPromises();
        expect(fetch).toHaveBeenCalledTimes(initialRequests + 1);
        currentResponse.resolve(response());
        await latest;
        expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
      } finally {
        caller.stop();
        resume.resolve(undefined);
        currentResponse.resolve(response());
        await Promise.allSettled([superseded, latest]);
        await flushPromises();
      }
    }
  );
  it.each(['scope', 'owner-disposal'])(
    'does not publish historical live freshness after %s supersedes the loader continuation',
    async (kind) => {
      const store = prepare();
      const fetch = vi.fn().mockResolvedValue(response());
      vi.stubGlobal('$fetch', fetch);
      let owner = true;
      const caller = effectScope();
      vi.mocked(cache.setCachedData).mockImplementationOnce(async () => {
        queueMicrotask(() => {
          if (kind === 'scope') {
            store.currentGameMode = 'pve';
            store.applyCriticalCachedData(bundle('pve-en') as never);
          } else caller.stop();
        });
      });
      try {
        await caller.run(() => {
          onScopeDispose(() => {
            owner = false;
          });
          return store.fetchEditionsData(false, { revalidate: true, isOwner: () => owner });
        });
        expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(false);
        store.currentGameMode = 'pvp';
        await warm(store);
        await startIdle();
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
      } finally {
        caller.stop();
        await flushPromises();
      }
    }
  );
  it('does not clear current catalog errors from a superseded deferred request body', async () => {
    const store = prepare();
    const superseded = store.fetchEditionsData();
    store.currentGameMode = 'pve';
    store.applyCriticalCachedData(bundle('pve-en') as never);
    const currentError = new Error('current scope failed');
    store.editionsError = currentError;
    await superseded;
    expect(store.editionsError).toBe(currentError);
  });
  it.each(invalidations)('drops a queued refresh after %s changes', async (kind) => {
    const store = prepare();
    const controller = new AbortController();
    let owner = true;
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('$fetch', fetch);
    await warm(store, { signal: controller.signal, isOwner: () => owner });
    expect(idle.tasks).toHaveLength(1);
    const invalidate = {
      mode: () => {
        store.currentGameMode = 'pve';
      },
      language: () => {
        store.languageCode = 'de';
      },
      owner: () => {
        owner = false;
      },
      abort: () => controller.abort(),
    };
    invalidate[kind]();
    await startIdle();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(invalidations)('rejects an in-flight result after %s changes', async (kind) => {
    const store = prepare();
    const controller = new AbortController();
    let owner = true;
    const pending = createDeferred<object>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('$fetch', fetch);
    await warm(store, { signal: controller.signal, isOwner: () => owner });
    await startIdle();
    expect(fetch).toHaveBeenCalledTimes(1);
    const invalidate = {
      mode: () => {
        store.currentGameMode = 'pve';
      },
      language: () => {
        store.languageCode = 'de';
      },
      owner: () => {
        owner = false;
      },
      abort: () => controller.abort(),
    };
    invalidate[kind]();
    pending.resolve(response());
    await flushPromises();
    expect(store.storyChapters[0]?.objectives?.[childId]).not.toHaveProperty('parentObjectiveId');
    expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(false);
  });
  it('starts only the latest queued cached startup', async () => {
    const store = prepare();
    const pending = createDeferred<object>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('$fetch', fetch);
    await warm(store);
    await warm(store);
    await startIdle();
    expect(fetch).toHaveBeenCalledTimes(1);
    pending.resolve(response());
    await flushPromises();
    expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
  });
  it('keeps the queued freshness check when task readiness reuses the hydrated catalog', async () => {
    const store = prepare();
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('$fetch', fetch);
    await warm(store);
    await store.ensureEditionsData();
    expect(fetch).not.toHaveBeenCalled();
    await startIdle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
  });
  it('revalidates a warm startup after the real task-detail readiness composable uses cached editions', async () => {
    const store = prepare();
    const pending = createDeferred<object>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('$fetch', fetch);
    await warm(store);
    const scope = effectScope();
    try {
      const ready = scope.run(() => useTaskDetailReadiness())!;
      await flushPromises();
      expect(ready.value).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
      await startIdle();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(store.storyChapters[0]?.objectives?.[childId]).not.toHaveProperty('parentObjectiveId');
      pending.resolve(response());
      await flushPromises();
      expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
      expect(ready.value).toBe(true);
    } finally {
      scope.stop();
    }
  });
  it('drops disposed caller work and lets a later startup retry without a cache purge', async () => {
    const store = prepare();
    const controller = new AbortController();
    const scope = effectScope();
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('$fetch', fetch);
    await scope.run(() => {
      onScopeDispose(() => controller.abort());
      return warm(store, { signal: controller.signal });
    });
    scope.stop();
    await startIdle();
    expect(fetch).not.toHaveBeenCalled();
    expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(false);
    await warm(store);
    await startIdle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
  });
  it('waits for an already-running catalog refresh before revealing task details', async () => {
    const store = prepare();
    const pending = createDeferred<object>();
    vi.stubGlobal('$fetch', vi.fn().mockReturnValue(pending.promise));
    await warm(store);
    await startIdle();
    const scope = effectScope();
    try {
      const ready = scope.run(() => useTaskDetailReadiness())!;
      await flushPromises();
      expect(ready.value).toBe(false);
      pending.resolve(response());
      await flushPromises();
      expect(ready.value).toBe(true);
      expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
    } finally {
      scope.stop();
    }
  });
  it.each(['owner', 'abort'])(
    'retries a %s-cancelled refresh without joining or publishing its stale response',
    async (kind) => {
      const store = prepare();
      const controller = new AbortController();
      let owner = true;
      const obsolete = createDeferred<object>();
      const fetch = vi.fn().mockReturnValueOnce(obsolete.promise).mockResolvedValue(response());
      vi.stubGlobal('$fetch', fetch);
      await warm(store, { signal: controller.signal, isOwner: () => owner });
      await startIdle();
      if (kind === 'owner') owner = false;
      if (kind === 'abort') controller.abort();
      const retry = store.fetchEditionsData(false, { revalidate: true });
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(2);
      await retry;
      obsolete.resolve({ data: { editions: [], storyChapters: [chapter()] } });
      await flushPromises();
      expect(store.storyChapters[0]?.objectives?.[childId]?.parentObjectiveId).toBe(parentId);
      expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(true);
      expect(store.editionsError).toBeNull();
    }
  );
});
