// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useProfileTaskMetadata } from '@/composables/useProfileTaskMetadata';
import { projectDuplicateObjectiveProgress } from '@/utils/taskNormalization';
import { createDeferred } from '@/utils/test-helpers';
import type { GameMode } from '@/utils/constants';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('profile mode metadata', () => {
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
      return Promise.resolve({ data: { storyChapters: [] } });
    });
    vi.stubGlobal('$fetch', fetch);
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(mode, ref('de')))!;
    const firstSignal = fetch.mock.calls[0]![1].signal;
    mode.value = 'pve';
    await flushPromises();
    expect(firstSignal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      '/api/tarkov/tasks-objectives',
      expect.objectContaining({
        query: { gameMode: 'pve', lang: 'de' },
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
  it('aborts hanging optional requests after 15 seconds and exposes completed tasks', async () => {
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
    await vi.advanceTimersByTimeAsync(15000);
    expect(result.tasks.value).toEqual([expect.objectContaining({ id: 'task' })]);
    expect(result.error.value?.message).toBe('Profile metadata request timed out');
    expect(result.loading.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
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
      return Promise.resolve({ data: { storyChapters: [] } });
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
      return Promise.resolve({ data: { storyChapters: [null] } });
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
