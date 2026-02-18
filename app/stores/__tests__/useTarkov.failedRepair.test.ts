import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { useTarkovStore } from '@/stores/useTarkov';
import type { UserProgressData } from '@/stores/progressState';
import type { Task } from '@/types/tarkov';
const createProgressData = (
  taskCompletions: UserProgressData['taskCompletions']
): UserProgressData => ({
  level: 1,
  pmcFaction: 'USEC',
  displayName: null,
  xpOffset: 0,
  taskObjectives: {},
  taskCompletions,
  hideoutParts: {},
  hideoutModules: {},
  traders: {},
  skills: {},
  prestigeLevel: 0,
  skillOffsets: {},
  storyChapters: {},
});
const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  alternatives: [],
  failConditions: [],
  objectives: [],
  ...overrides,
});
describe('useTarkovStore failed-state repair', () => {
  it('keeps manually failed tasks during stale-failure cleanup', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const gameModeData = createProgressData({
      'task-manual': { complete: true, failed: true, manual: true },
    });
    const tasksMap = new Map<string, Task>([['task-manual', createTask('task-manual')]]);
    const repairedCount = store.repairGameModeFailedTasks(gameModeData, tasksMap);
    expect(repairedCount).toBe(0);
    expect(gameModeData.taskCompletions['task-manual']).toMatchObject({
      complete: true,
      failed: true,
      manual: true,
    });
  });
  it('clears stale non-manual failed tasks with no valid fail source', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const gameModeData = createProgressData({
      'task-stale': { complete: true, failed: true },
    });
    const tasksMap = new Map<string, Task>([['task-stale', createTask('task-stale')]]);
    const repairedCount = store.repairGameModeFailedTasks(gameModeData, tasksMap);
    expect(repairedCount).toBe(1);
    expect(gameModeData.taskCompletions['task-stale']).toMatchObject({
      complete: false,
      failed: false,
      manual: false,
    });
  });
  it('does not retroactively fail completed one-way alternative chains', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const gameModeData = createProgressData({
      'task-source': { complete: true, failed: false, timestamp: 2000 },
      'task-target': { complete: true, failed: false, timestamp: 1000 },
    });
    const tasksMap = new Map<string, Task>([
      [
        'task-source',
        createTask('task-source', {
          alternatives: ['task-target'],
          failConditions: [],
        }),
      ],
      [
        'task-target',
        createTask('task-target', {
          failConditions: [
            { id: 'fail-task-target', task: { id: 'task-source' }, status: ['complete'] },
          ],
        }),
      ],
    ]);
    const repairedCount = store.repairGameModeFailedTasks(gameModeData, tasksMap);
    expect(repairedCount).toBe(0);
    expect(gameModeData.taskCompletions['task-source']).toMatchObject({
      complete: true,
      failed: false,
    });
    expect(gameModeData.taskCompletions['task-target']).toMatchObject({
      complete: true,
      failed: false,
    });
  });
  it('unfails a task that was completed before its fail-condition trigger fired', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const gameModeData = createProgressData({
      'skier-prereq': { complete: true, failed: true, manual: false, timestamp: 1000 },
      'price-of-independence': { complete: true, failed: false, timestamp: 2000 },
    });
    const tasksMap = new Map<string, Task>([
      [
        'skier-prereq',
        createTask('skier-prereq', {
          failConditions: [
            {
              id: 'fail-skier-prereq',
              task: { id: 'price-of-independence' },
              status: ['complete'],
            },
          ],
        }),
      ],
      [
        'price-of-independence',
        createTask('price-of-independence', {
          alternatives: ['skier-prereq'],
        }),
      ],
    ]);
    const repairedCount = store.repairGameModeFailedTasks(gameModeData, tasksMap);
    expect(repairedCount).toBe(1);
    expect(gameModeData.taskCompletions['skier-prereq']).toMatchObject({
      complete: false,
      failed: false,
    });
    expect(gameModeData.taskCompletions['price-of-independence']).toMatchObject({
      complete: true,
      failed: false,
    });
  });
  it('unfails a completed task with one-way failCondition when timestamps are missing', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const gameModeData = createProgressData({
      'task-no-ts': { complete: true, failed: true, manual: false },
      'task-trigger': { complete: true, failed: false },
    });
    const tasksMap = new Map<string, Task>([
      [
        'task-no-ts',
        createTask('task-no-ts', {
          failConditions: [
            { id: 'fail-no-ts', task: { id: 'task-trigger' }, status: ['complete'] },
          ],
        }),
      ],
      [
        'task-trigger',
        createTask('task-trigger', {
          alternatives: ['task-no-ts'],
        }),
      ],
    ]);
    const repairedCount = store.repairGameModeFailedTasks(gameModeData, tasksMap);
    expect(repairedCount).toBe(1);
    expect(gameModeData.taskCompletions['task-no-ts']).toMatchObject({
      complete: false,
      failed: false,
    });
  });
  it('keeps a non-completed task failed when timestamps are missing', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const gameModeData = createProgressData({
      'task-never-done': { complete: false, failed: true, manual: false },
      'task-trigger': { complete: true, failed: false },
    });
    const tasksMap = new Map<string, Task>([
      [
        'task-never-done',
        createTask('task-never-done', {
          failConditions: [
            { id: 'fail-never-done', task: { id: 'task-trigger' }, status: ['complete'] },
          ],
        }),
      ],
      ['task-trigger', createTask('task-trigger')],
    ]);
    const repairedCount = store.repairGameModeFailedTasks(gameModeData, tasksMap);
    expect(repairedCount).toBe(0);
    expect(gameModeData.taskCompletions['task-never-done']).toMatchObject({
      complete: false,
      failed: true,
    });
  });
  it('keeps a completed task failed for mutual failConditions without timestamps', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const gameModeData = createProgressData({
      'task-a': { complete: true, failed: true, manual: false },
      'task-b': { complete: true, failed: false },
    });
    const tasksMap = new Map<string, Task>([
      [
        'task-a',
        createTask('task-a', {
          alternatives: ['task-b'],
          failConditions: [{ id: 'fail-a', task: { id: 'task-b' }, status: ['complete'] }],
        }),
      ],
      [
        'task-b',
        createTask('task-b', {
          alternatives: ['task-a'],
          failConditions: [{ id: 'fail-b', task: { id: 'task-a' }, status: ['complete'] }],
        }),
      ],
    ]);
    const repairedCount = store.repairGameModeFailedTasks(gameModeData, tasksMap);
    expect(repairedCount).toBe(0);
    expect(gameModeData.taskCompletions['task-a']).toMatchObject({
      complete: true,
      failed: true,
    });
  });
  it('fails the older task when both sides of a mutual alternative are complete', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const gameModeData = createProgressData({
      'task-a': { complete: true, failed: false, timestamp: 1000 },
      'task-b': { complete: true, failed: false, timestamp: 2000 },
    });
    const tasksMap = new Map<string, Task>([
      [
        'task-a',
        createTask('task-a', {
          alternatives: ['task-b'],
          failConditions: [{ id: 'fail-task-a', task: { id: 'task-b' }, status: ['complete'] }],
        }),
      ],
      [
        'task-b',
        createTask('task-b', {
          alternatives: ['task-a'],
          failConditions: [{ id: 'fail-task-b', task: { id: 'task-a' }, status: ['complete'] }],
        }),
      ],
    ]);
    const repairedCount = store.repairGameModeFailedTasks(gameModeData, tasksMap);
    expect(repairedCount).toBe(1);
    expect(gameModeData.taskCompletions['task-a']).toMatchObject({
      complete: true,
      failed: true,
    });
    expect(gameModeData.taskCompletions['task-b']).toMatchObject({
      complete: true,
      failed: false,
    });
  });
});
