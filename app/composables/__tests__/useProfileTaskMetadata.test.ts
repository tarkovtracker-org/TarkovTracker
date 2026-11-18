// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useProfileTaskMetadata } from '@/composables/useProfileTaskMetadata';
import { useMetadataStore } from '@/stores/useMetadata';
import { localizeMetadata } from '@/utils/metadataLocalization';
import { getTarkovAccessState } from '@/utils/tarkovApiFetch';
import * as cache from '@/utils/tarkovCache';
import { projectDuplicateObjectiveProgress } from '@/utils/taskNormalization';
import { createDeferred } from '@/utils/test-helpers';
import type { GameMode } from '@/utils/constants';
const { accessGate } = vi.hoisted(() => ({
  accessGate: { pending: null as Promise<number> | null },
}));
vi.mock('@/utils/tarkovApiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/tarkovApiFetch')>();
  return {
    ...actual,
    ensureTarkovAccess: (signal?: AbortSignal) =>
      accessGate.pending ?? actual.ensureTarkovAccess(signal),
  };
});
beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(cache, 'getCachedData').mockResolvedValue(null);
  vi.spyOn(cache, 'setCachedData').mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  accessGate.pending = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('profile mode metadata', () => {
  it.each([
    ['tasks-core', null],
    ['tasks-core', {}],
    ['tasks-core', { id: 123 }],
    ['tasks-objectives', null],
    ['tasks-objectives', {}],
    ['tasks-objectives', { id: 123 }],
  ])('refetches cached %s with an incompatible task entry %j', async (type, entry) => {
    vi.mocked(cache.getCachedData).mockImplementation(async (candidate) =>
      candidate === type ? ({ tasks: [entry], maps: [], traders: [] } as never) : null
    );
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/tasks-core'))
        return { data: { tasks: [{ id: 'task', name: 'Task' }], maps: [], traders: [] } };
      if (url.endsWith('/tasks-objectives'))
        return { data: { tasks: [{ id: 'task', objectives: [{ id: 'objective' }] }] } };
      if (url.endsWith('/prestige')) return { data: { prestige: [] } };
      return { data: { editions: [], storyChapters: [] } };
    });
    vi.stubGlobal('$fetch', fetch);
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pvp'), ref('en')))!;
    await flushPromises();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/' + type))).toHaveLength(1);
    expect(result.tasks.value[0]?.id).toBe('task');
    expect(result.tasks.value[0]?.objectives?.[0]?.id).toBe('objective');
    expect(result.error.value).toBeNull();
    scope.stop();
  });
  it('refetches malformed cached prestige and stores valid editions with a one-hour TTL', async () => {
    vi.mocked(cache.getCachedData).mockImplementation(async (type) =>
      type === 'prestige' ? ({ prestige: [{ id: 'bad', level: 'invalid' }] } as never) : null
    );
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/tasks-core'))
        return { data: { tasks: [{ id: 'task', name: 'Task' }], maps: [], traders: [] } };
      if (url.endsWith('/tasks-objectives')) return { data: { tasks: [] } };
      if (url.endsWith('/prestige')) return { data: { prestige: [] } };
      return { data: { editions: [], storyChapters: [] } };
    });
    vi.stubGlobal('$fetch', fetch);
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pvp'), ref('en')))!;
    await flushPromises();
    expect(result.error.value).toBeNull();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/prestige'))).toHaveLength(1);
    expect(cache.setCachedData).toHaveBeenCalledWith(
      'prestige',
      'neutral-v1-regular',
      'en',
      { prestige: [] },
      cache.CACHE_CONFIG.DEFAULT_TTL,
      expect.any(Function)
    );
    expect(cache.setCachedData).toHaveBeenCalledWith(
      'editions',
      'neutral-v1-regular',
      'en',
      { editions: [], storyChapters: [] },
      3_600_000,
      expect.any(Function)
    );
    scope.stop();
  });
  it('keeps malformed network chapters out of the shared catalog cache', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/tasks-core'))
          return { data: { tasks: [{ id: 'task' }], maps: [], traders: [] } };
        if (url.endsWith('/tasks-objectives')) return { data: { tasks: [] } };
        if (url.endsWith('/prestige')) return { data: { prestige: [] } };
        return { data: { editions: [], storyChapters: [{ id: 'incomplete' }] } };
      })
    );
    const scope = effectScope();
    scope.run(() => useProfileTaskMetadata(ref<GameMode>('pvp'), ref('en')));
    await flushPromises();
    expect(
      vi.mocked(cache.setCachedData).mock.calls.filter(([type]) => type === 'editions')
    ).toEqual([]);
    scope.stop();
  });
  it('keeps an older profile request from overwriting a newer shared metadata request', async () => {
    const old = createDeferred<object>();
    const fresh = createDeferred<object>();
    let coreRequests = 0;
    vi.stubGlobal(
      '$fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/tasks-core')) return ++coreRequests === 1 ? old.promise : fresh.promise;
        if (url.endsWith('/tasks-objectives')) return { data: { tasks: [] } };
        if (url.endsWith('/prestige')) return { data: { prestige: [] } };
        return { data: { editions: [], storyChapters: [] } };
      })
    );
    const scope = effectScope();
    scope.run(() => useProfileTaskMetadata(ref<GameMode>('pvp'), ref('en')));
    await vi.waitFor(() => expect(coreRequests).toBe(1));
    const current = useMetadataStore().fetchTasksCoreData(true);
    await vi.waitFor(() => expect(coreRequests).toBe(2));
    old.resolve({ data: { tasks: [{ id: 'old', name: 'Old' }], maps: [], traders: [] } });
    await flushPromises();
    expect(
      vi.mocked(cache.setCachedData).mock.calls.filter(([type]) => type === 'tasks-core')
    ).toEqual([]);
    fresh.resolve({ data: { tasks: [{ id: 'fresh', name: 'Fresh' }], maps: [], traders: [] } });
    await current;
    expect(
      vi.mocked(cache.setCachedData).mock.calls.filter(([type]) => type === 'tasks-core')
    ).toHaveLength(1);
    scope.stop();
  });
  it('reuses neutral profile catalogs and loads one table when the language changes', async () => {
    const entries = new Map<string, unknown>();
    vi.mocked(cache.getCachedData).mockImplementation(
      async (type, key, language) => (entries.get(`${type}/${key}/${language}`) ?? null) as never
    );
    vi.mocked(cache.setCachedData).mockImplementation(async (type, key, language, data) => {
      entries.set(`${type}/${key}/${language}`, structuredClone(data));
    });
    const language = ref('en');
    const name = '@tt:regular:tasks:name';
    const fetch = vi.fn(async (url: string, options: { query: Record<string, string> }) => {
      if (url.endsWith('/strings'))
        return { data: { strings: { [name]: options.query.lang === 'de' ? 'Aufgabe' : 'Task' } } };
      expect(options.query).not.toHaveProperty('lang');
      if (url.endsWith('/tasks-core'))
        return { data: { tasks: [{ id: 'task', name }], maps: [], traders: [] } };
      if (url.endsWith('/tasks-objectives')) return { data: { tasks: [] } };
      if (url.endsWith('/prestige')) return { data: { prestige: [] } };
      return { data: { editions: [], storyChapters: [] } };
    });
    vi.stubGlobal('$fetch', fetch);
    const mainView = localizeMetadata(useMetadataStore(), { name }, 'en');
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pvp'), language))!;
    await mainView;
    await flushPromises();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/strings'))).toHaveLength(1);
    expect(result.tasks.value[0]?.name).toBe('Task');
    fetch.mockClear();
    language.value = 'de';
    await flushPromises();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/tarkov/strings']);
    expect(result.tasks.value[0]?.name).toBe('Aufgabe');
    fetch.mockClear();
    language.value = 'en';
    await flushPromises();
    expect(fetch).not.toHaveBeenCalled();
    expect(result.tasks.value[0]?.name).toBe('Task');
    scope.stop();
  });
  it('requests the selected mode and ignores responses from an obsolete mode', async () => {
    const old = createDeferred<object>();
    const mode = ref<GameMode>('pvp');
    const fetch = vi.fn((url: string, _options: { signal: AbortSignal }) => {
      if (mode.value === 'pvp') return old.promise;
      if (url.includes('tasks-core'))
        return Promise.resolve({
          data: { tasks: [{ id: 'pve', name: 'PvE', traderRequirements: [] }] },
        });
      if (url.includes('tasks-objectives'))
        return Promise.resolve({
          data: { tasks: [{ id: 'pve', objectives: [{ id: 'pve-objective' }] }] },
        });
      if (url.includes('prestige')) return Promise.resolve({ data: { prestige: [] } });
      return Promise.resolve({ data: { editions: [], storyChapters: [] } });
    });
    vi.stubGlobal('$fetch', fetch);
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(mode, ref('de')))!;
    await flushPromises();
    const firstSignal = fetch.mock.calls[0]![1].signal;
    mode.value = 'pve';
    await flushPromises();
    expect(firstSignal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      '/api/tarkov/tasks-objectives',
      expect.objectContaining({
        query: { gameMode: 'pve' },
      })
    );
    expect(result.tasks.value).toEqual([
      expect.objectContaining({ id: 'pve', objectives: [{ id: 'pve-objective' }] }),
    ]);
    old.resolve({ data: { tasks: [{ id: 'pvp' }] } });
    await flushPromises();
    expect(result.tasks.value[0]?.id).toBe('pve');
    scope.stop();
  });
  it('retains task metadata when independent prestige and overlay resources fail', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn((url: string) => {
        if (url.includes('tasks-core'))
          return Promise.resolve({ data: { tasks: [{ id: 'task' }] } });
        if (url.includes('tasks-objectives'))
          return Promise.resolve({
            data: { tasks: [{ id: 'task', objectives: [{ id: 'objective' }] }] },
          });
        return Promise.reject(new Error('Optional metadata unavailable'));
      })
    );
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pve'), ref('en')))!;
    await flushPromises();
    expect(result.tasks.value[0]?.objectives).toEqual([{ id: 'objective' }]);
    expect(result.chapters.value).toEqual([]);
    expect(result.prestige.value).toEqual([]);
    expect(result.error.value?.message).toBe('Optional metadata unavailable');
    expect(result.loading.value).toBe(false);
    scope.stop();
  });
  it('aborts hanging optional requests after the server retry budget and exposes completed tasks', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal(
      '$fetch',
      vi.fn((url: string, options: { signal: AbortSignal }) => {
        if (url.includes('tasks-core'))
          return Promise.resolve({ data: { tasks: [{ id: 'task' }] } });
        if (url.includes('tasks-objectives')) return Promise.resolve({ data: { tasks: [] } });
        return new Promise((_, reject) =>
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          })
        );
      })
    );
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pve'), ref('en')))!;
    await vi.advanceTimersByTimeAsync(60000);
    expect(result.tasks.value).toEqual([expect.objectContaining({ id: 'task' })]);
    expect(result.error.value?.message).toBe('Profile metadata request timed out');
    expect(result.loading.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });
  it('starts the request budget only after a slow security check releases access', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const clearance = createDeferred<number>();
    accessGate.pending = clearance.promise;
    const fetch = vi.fn((url: string) => {
      if (url.includes('tasks-')) return Promise.resolve({ data: { tasks: [{ id: 'task' }] } });
      if (url.includes('prestige')) return Promise.resolve({ data: { prestige: [] } });
      return Promise.resolve({ data: { editions: [], storyChapters: [] } });
    });
    vi.stubGlobal('$fetch', fetch);
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pve'), ref('en')))!;
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.loading.value).toBe(true);
    expect(result.error.value).toBeNull();
    accessGate.pending = null;
    clearance.resolve(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(result.tasks.value).toEqual([expect.objectContaining({ id: 'task' })]);
    expect(result.error.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });
  it('surfaces a failed access check without starting catalog requests', async () => {
    accessGate.pending = Promise.reject(new Error('The access check failed.'));
    const fetch = vi.fn();
    vi.stubGlobal('$fetch', fetch);
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pve'), ref('en')))!;
    await flushPromises();
    expect(fetch).not.toHaveBeenCalled();
    expect(result.error.value?.message).toBe('The access check failed.');
    expect(result.loading.value).toBe(false);
    scope.stop();
  });
  it('reloads after access recovers from a failed security check', async () => {
    accessGate.pending = Promise.reject(new Error('The security check was dismissed.'));
    const fetch = vi.fn((url: string) => {
      if (url.includes('tasks-')) return Promise.resolve({ data: { tasks: [{ id: 'task' }] } });
      if (url.includes('prestige')) return Promise.resolve({ data: { prestige: [] } });
      return Promise.resolve({ data: { editions: [], storyChapters: [] } });
    });
    vi.stubGlobal('$fetch', fetch);
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pve'), ref('en')))!;
    await flushPromises();
    expect(result.error.value?.message).toBe('The security check was dismissed.');
    accessGate.pending = null;
    getTarkovAccessState().recoveryEpoch.value += 1;
    await flushPromises();
    expect(result.error.value).toBeNull();
    expect(result.tasks.value).toEqual([expect.objectContaining({ id: 'task' })]);
    scope.stop();
  });
});
it('qualifies shared objectives and enriches the isolated prerequisite graph', async () => {
  const tasks = [
    { id: 'a', taskRequirements: [], objectives: [{ id: 'shared' }] },
    {
      id: 'b',
      taskRequirements: [{ task: { id: 'a' }, status: ['complete'] }],
      objectives: [{ id: 'shared' }],
    },
    { id: 'c', taskRequirements: [{ task: { id: 'b' }, status: ['complete'] }], objectives: [] },
  ];
  const original = structuredClone(tasks);
  vi.stubGlobal(
    '$fetch',
    vi.fn((url: string) => {
      if (url.includes('tasks-')) return Promise.resolve({ data: { tasks } });
      if (url.includes('prestige')) return Promise.resolve({ data: { prestige: [] } });
      return Promise.resolve({ data: { editions: [], storyChapters: [] } });
    })
  );
  const scope = effectScope();
  const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pve'), ref('en')))!;
  await flushPromises();
  expect(result.tasks.value[0]?.objectives?.[0]?.id).toBe('shared:a');
  expect(result.tasks.value[1]?.objectives?.[0]?.id).toBe('shared:b');
  expect(result.tasks.value[2]?.predecessors).toEqual(expect.arrayContaining(['a', 'b']));
  const legacy = {
    shared: { complete: true, count: 2 },
    'shared:b': { complete: false, count: 1 },
  };
  const projected = projectDuplicateObjectiveProgress(legacy, result.duplicateObjectiveIds.value);
  expect(projected).toEqual({
    'shared:a': { complete: true, count: 2 },
    'shared:b': { complete: false, count: 1 },
  });
  expect(legacy.shared).toEqual({ complete: true, count: 2 });
  expect(legacy).not.toHaveProperty('shared:a');
  expect(tasks).toEqual(original);
  scope.stop();
});
it('keeps required catalogs when optional chapter normalization fails', async () => {
  vi.stubGlobal(
    '$fetch',
    vi.fn((url: string) => {
      if (url.includes('tasks-'))
        return Promise.resolve({ data: { tasks: [{ id: 'task', objectives: [] }] } });
      if (url.includes('prestige')) return Promise.resolve({ data: { prestige: [] } });
      return Promise.resolve({ data: { editions: [], storyChapters: [null] } });
    })
  );
  const scope = effectScope();
  const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pve'), ref('en')))!;
  await flushPromises();
  expect(result.tasks.value[0]?.id).toBe('task');
  expect(result.chapters.value).toEqual([]);
  expect(result.error.value).toBeInstanceOf(Error);
  expect(result.loading.value).toBe(false);
  scope.stop();
});
it.each([
  {},
  { data: null },
  { data: { prestige: {} } },
  { data: { prestige: [null] } },
  ...[
    { id: '', level: 1 },
    { id: ' ', level: 1 },
    { id: 'p', level: 1.5 },
    { id: 'p', level: -1 },
    { id: 'p', level: 7 },
    { id: 'p', level: 1, prestigeLevel: 7 },
    { id: 'p', level: 1, conditions: [null] },
    { id: 'p', level: 1, conditions: [[]] },
  ].map((entry) => ({ data: { prestige: [entry] } })),
])('keeps task catalogs when optional prestige is malformed: %j', async (payload) => {
  vi.stubGlobal(
    '$fetch',
    vi.fn((url: string) => {
      if (url.includes('tasks-'))
        return Promise.resolve({ data: { tasks: [{ id: 'task', objectives: [] }] } });
      if (url.includes('prestige')) return Promise.resolve(payload);
      return Promise.resolve({ data: { editions: [], storyChapters: [] } });
    })
  );
  const scope = effectScope();
  const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pvp'), ref('en')))!;
  await flushPromises();
  expect(result.tasks.value[0]?.id).toBe('task');
  expect(result.prestige.value).toEqual([]);
  expect(result.error.value?.message).toBe('Invalid optional prestige catalog');
  expect(result.loading.value).toBe(false);
  scope.stop();
});
it.each(['core', 'objectives'])(
  'reports required %s failures and clears loading',
  async (failedCatalog) => {
    vi.stubGlobal(
      '$fetch',
      vi.fn((url: string) => {
        if (url.includes(`tasks-${failedCatalog}`)) return Promise.reject('Catalog unavailable');
        if (url.includes('tasks-')) return Promise.resolve({ data: { tasks: [] } });
        if (url.includes('prestige')) return Promise.resolve({ data: { prestige: [] } });
        return Promise.resolve(undefined);
      })
    );
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pvp'), ref('en')))!;
    expect(result.loading.value).toBe(true);
    expect(result.tasks.value).toEqual([]);
    expect(result.chapters.value).toEqual([]);
    expect(result.prestige.value).toEqual([]);
    expect(result.duplicateObjectiveIds.value.size).toBe(0);
    await flushPromises();
    expect(result.error.value?.message).toBe('Catalog unavailable');
    expect(result.loading.value).toBe(false);
    scope.stop();
  }
);
it('ignores a required catalog rejection after its scope is disposed', async () => {
  const pending = createDeferred<object>();
  vi.stubGlobal(
    '$fetch',
    vi.fn(() => pending.promise)
  );
  const scope = effectScope();
  const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pvp'), ref('en')))!;
  await vi.waitFor(() => expect($fetch).toHaveBeenCalledTimes(4));
  scope.stop();
  pending.reject(new Error('Old request failed'));
  await flushPromises();
  expect(result.error.value).toBeNull();
  expect(result.tasks.value).toEqual([]);
});
it.each([undefined, null, [{ id: 'updated' }]])(
  'preserves core gates while merging objective fields with value %j',
  async (value) => {
    const core = {
      id: 'target',
      requirementDiagnostics: ['task_requirement', 'prestige_reference'],
      objectives: [{ id: 'original' }],
      failConditions: [{ id: 'original-failure' }],
    };
    const update = {
      id: 'target',
      requirementDiagnostics: ['task_requirement'],
      objectives: value,
      failConditions: value,
    };
    const responses: Record<string, unknown> = {
      '/api/tarkov/tasks-core': { data: { tasks: [core] } },
      '/api/tarkov/tasks-objectives': { data: { tasks: [update] } },
      '/api/tarkov/prestige': { data: { prestige: [] } },
      '/api/tarkov/editions': { data: { editions: [], storyChapters: [] } },
    };
    vi.stubGlobal(
      '$fetch',
      vi.fn(async (url: string) => responses[url])
    );
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(ref<GameMode>('pvp'), ref('en')))!;
    await flushPromises();
    expect(result.tasks.value[0]).toMatchObject({
      requirementDiagnostics: core.requirementDiagnostics,
      objectives: value === undefined ? core.objectives : (value ?? []),
      failConditions: value === undefined ? core.failConditions : value,
    });
    scope.stop();
  }
);
