import { describe, expect, it } from 'vitest';
import { computeStreamerKappaMetrics } from '@/server/utils/streamerKappa';
import type { GameEdition, NeededItemTaskObjective, Task } from '@/types/tarkov';
const COLLECTOR_TASK_ID = '5c51aac186f77432ea65c552';
const makeTask = (id: string, overrides: Partial<Task> = {}): Task => {
  return {
    factionName: 'Any',
    id,
    ...overrides,
  };
};
const makeNeededObjective = (
  id: string,
  taskId: string,
  count: number,
  itemId: string
): NeededItemTaskObjective => {
  return {
    count,
    id,
    item: {
      id: itemId,
    },
    needType: 'taskObjective',
    taskId,
  };
};
const makeEdition = (value: number, excludedTaskIds: string[] = []): GameEdition => {
  return {
    defaultCultistCircleLevel: 0,
    defaultStashLevel: 0,
    excludedTaskIds,
    id: `edition-${value}`,
    title: `Edition ${value}`,
    traderRepBonus: {},
    value,
  };
};
describe('computeStreamerKappaMetrics', () => {
  it('excludes failed and invalid kappa branches and computes collector item progress', () => {
    const tasks: Task[] = [
      makeTask('a', { kappaRequired: true }),
      makeTask('b', { kappaRequired: true }),
      makeTask('c', { kappaRequired: true }),
      makeTask('d', {
        kappaRequired: true,
        taskRequirements: [
          {
            status: ['complete'],
            task: { id: 'c' },
          },
        ],
      }),
      makeTask(COLLECTOR_TASK_ID, {
        name: 'Collector',
        trader: { id: 'fence', name: 'Fence' },
      }),
    ];
    const neededObjectives: NeededItemTaskObjective[] = [
      makeNeededObjective('collector-1', COLLECTOR_TASK_ID, 3, 'item-kappa'),
      makeNeededObjective('collector-2', COLLECTOR_TASK_ID, 2, 'item-kappa'),
      makeNeededObjective('ob-1', 'b', 3, 'item-not-collector'),
      makeNeededObjective('ob-2', 'b', 2, 'item-not-collector'),
    ];
    const result = computeStreamerKappaMetrics({
      editions: [makeEdition(1)],
      gameEdition: 1,
      neededItemTaskObjectives: neededObjectives,
      pmcFaction: 'USEC',
      taskCompletions: {
        a: { complete: true, failed: false },
        c: { complete: true, failed: true },
      },
      taskObjectives: {
        'collector-1': { complete: false, count: 2 },
        'collector-2': { complete: false, count: 1 },
      },
      tasks,
    });
    expect(result.tasks).toEqual({
      completed: 1,
      percentage: 50,
      remaining: 1,
      total: 2,
    });
    expect(result.items).toEqual({
      collected: 2,
      percentage: 40,
      remaining: 3,
      total: 5,
    });
  });
  it('applies faction and edition filtering to kappa totals', () => {
    const tasks: Task[] = [
      makeTask('task-any', { kappaRequired: true }),
      makeTask('task-edition-locked', { kappaRequired: true }),
      makeTask('task-bear', { factionName: 'BEAR', kappaRequired: true }),
    ];
    const result = computeStreamerKappaMetrics({
      editions: [makeEdition(1, ['task-edition-locked'])],
      gameEdition: 1,
      neededItemTaskObjectives: [],
      pmcFaction: 'USEC',
      taskCompletions: {},
      taskObjectives: {},
      tasks,
    });
    expect(result.tasks.total).toBe(1);
    expect(result.tasks.completed).toBe(0);
    expect(result.tasks.remaining).toBe(1);
    expect(result.items.total).toBe(0);
    expect(result.items.collected).toBe(0);
  });
  it('detects collector task by name and trader when id differs', () => {
    const tasks: Task[] = [
      makeTask('collector-overlay', {
        name: 'Collector',
        trader: { id: 'fence', name: 'Fence' },
      }),
    ];
    const result = computeStreamerKappaMetrics({
      editions: [makeEdition(1)],
      gameEdition: 1,
      neededItemTaskObjectives: [
        makeNeededObjective('collector-fallback', 'collector-overlay', 2, 'item-x'),
      ],
      pmcFaction: 'USEC',
      taskCompletions: {},
      taskObjectives: {
        'collector-fallback': { complete: false, count: 1 },
      },
      tasks,
    });
    expect(result.items.total).toBe(2);
    expect(result.items.collected).toBe(1);
  });
});
