import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHideoutStations, getTasks } from '../services/tarkov';
import { deleteMemoryCache } from '../utils/memory-cache';
import { getTaskCatalogInvalidator } from '../utils/task-catalog';
import { transformProgress } from '../utils/transform';
import type { GameMode, UserProgressData } from '../types';
const MODES: GameMode[] = ['pvp', 'pve', 'seasonal'];
const taskPayload = (id = 'root') => ({
  data: {
    tasks: {
      [id]: { id, name: id, objectives: [{ id: `${id}-objective` }], taskRequirements: [] },
      child: {
        id: 'child',
        name: 'child',
        objectives: [{ id: 'child-objective' }],
        taskRequirements: [{ task: id, status: ['COMPLETE'] }],
      },
    },
  },
});
const hideoutPayload = { data: { stash: { id: 'stash', levels: [] } } };
describe('gateway catalog cache', () => {
  beforeEach(() => {
    for (const mode of ['regular', 'pve', 'pvp-season']) {
      deleteMemoryCache(`tarkov:tasks:${mode}`);
      deleteMemoryCache(`tarkov:hideout:${mode}`);
    }
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('shares one fetch and normalization per resource and mode during concurrent misses', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      await gate;
      return Response.json(
        String(input).endsWith('/tasks') ? taskPayload(String(input)) : hideoutPayload
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const pending = MODES.map((mode) =>
      Array.from({ length: 20 }, () => Promise.all([getTasks(mode), getHideoutStations(mode)]))
    );
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(new Set(fetcher.mock.calls.map(([url]) => String(url))).size).toBe(6);
    release();
    const groups = await Promise.all(pending.map((requests) => Promise.all(requests)));
    for (const group of groups) {
      for (const [tasks, hideout] of group) {
        expect(tasks).toBe(group[0]![0]);
        expect(hideout).toBe(group[0]![1]);
      }
    }
    expect(groups[0]![0]![0]).not.toBe(groups[1]![0]![0]);
    await Promise.all(MODES.map((mode) => getTasks(mode)));
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it.each([
    { name: 'HTTP error', response: () => Promise.resolve(new Response('', { status: 503 })) },
    { name: 'network error', response: () => Promise.reject(new Error('offline')) },
    { name: 'malformed JSON', response: () => Promise.resolve(new Response('{')) },
    { name: 'malformed envelope', response: () => Promise.resolve(Response.json({ data: null })) },
  ])('retries after a shared $name instead of caching failure', async ({ response }) => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(response)
      .mockResolvedValueOnce(Response.json(taskPayload()));
    vi.stubGlobal('fetch', fetcher);
    const results = await Promise.all(Array.from({ length: 20 }, () => getTasks('pvp')));
    expect(results.every((tasks) => tasks.length === 0)).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await getTasks('pvp')).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('retries hideout after failure and does not cache an invalid shape', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json(hideoutPayload));
    vi.stubGlobal('fetch', fetcher);
    expect(await getHideoutStations('pve')).toEqual([]);
    expect(await getHideoutStations('pve')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('bounds failed fetches by the existing abort deadline and allows a retry', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException('deadline exceeded', 'TimeoutError');
    });
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', fetcher);
    expect(await getTasks('pvp')).toEqual([]);
    expect(await getTasks('pvp')).toEqual([]);
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    timeout.mockRestore();
  });
  it('refreshes the immutable catalog and its graph after expiry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async () => Response.json(taskPayload('old')))
      .mockImplementationOnce(async () => Response.json(taskPayload('new')));
    vi.stubGlobal('fetch', fetcher);
    const old = await getTasks('pvp');
    expect(Object.isFrozen(old)).toBe(true);
    expect(Object.isFrozen(old[1]!.taskRequirements![0]!.status)).toBe(true);
    const oldInvalidator = getTaskCatalogInvalidator(old)!;
    const state = { taskCompletions: { old: { failed: true } }, pmcFaction: 'USEC' };
    expect(oldInvalidator(state).invalidTasks.child).toBe(true);
    vi.setSystemTime(Date.now() + 3_600_000);
    const fresh = await getTasks('pvp');
    expect(fresh).not.toBe(old);
    expect(getTaskCatalogInvalidator(fresh)!(state).invalidTasks.child).toBeUndefined();
    expect(getTaskCatalogInvalidator(old)).toBe(oldInvalidator);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not cache mutable caller-owned task arrays in the transform', () => {
    const tasks = [
      {
        id: 'child',
        name: 'Child',
        taskRequirements: [{ task: { id: 'root' }, status: ['complete'] }],
      },
    ];
    const progress: UserProgressData = {
      taskCompletions: { root: { failed: true }, child: { complete: false } },
      level: 1,
      pmcFaction: 'USEC',
      displayName: 'Test',
      xpOffset: 0,
      taskObjectives: {},
      hideoutParts: {},
      hideoutModules: {},
      traders: {},
      skills: {},
      prestigeLevel: 0,
      skillOffsets: {},
    };
    expect(
      transformProgress(progress, 'user', 1, tasks, []).tasksProgress.find(
        (task) => task.id === 'child'
      )?.invalid
    ).toBe(true);
    tasks[0]!.taskRequirements[0]!.status.push('failed');
    expect(
      transformProgress(progress, 'user', 1, tasks, []).tasksProgress.find(
        (task) => task.id === 'child'
      )?.invalid
    ).toBeUndefined();
    expect(getTaskCatalogInvalidator(tasks)).toBeUndefined();
  });
});
