import { describe, expect, it } from 'vitest';
import { useGraphBuilder } from '@/composables/useGraphBuilder';
import type { Task } from '@/types/tarkov';
describe('useGraphBuilder alternatives', () => {
  it('does not create alternatives from failed-only requirements', () => {
    const prerequisite: Task = {
      id: 'out-of-curiosity',
      name: 'Out of Curiosity',
      failConditions: [],
      objectives: [],
      taskRequirements: [],
    };
    const dependentFailedOnly: Task = {
      id: 'trust-regain',
      name: 'Trust Regain',
      failConditions: [],
      objectives: [],
      taskRequirements: [{ task: { id: 'out-of-curiosity' }, status: ['failed'] }],
    };
    const { processTaskData } = useGraphBuilder();
    const result = processTaskData([prerequisite, dependentFailedOnly]);
    expect(result.alternativeTasks['out-of-curiosity']).toBeUndefined();
  });
  it('creates alternatives from complete-status fail conditions', () => {
    const source: Task = {
      id: 'out-of-curiosity',
      name: 'Out of Curiosity',
      failConditions: [],
      objectives: [],
      taskRequirements: [],
    };
    const failedBySourceCompletion: Task = {
      id: 'big-customer',
      name: 'Big Customer',
      failConditions: [
        {
          id: 'obj-fail',
          status: ['complete'],
          task: { id: 'out-of-curiosity' },
        },
      ],
      objectives: [],
      taskRequirements: [],
    };
    const { processTaskData } = useGraphBuilder();
    const result = processTaskData([source, failedBySourceCompletion]);
    expect(result.alternativeTasks['out-of-curiosity']).toEqual(['big-customer']);
  });
  it('creates alternatives from object-form fail conditions in active requirements', () => {
    const prerequisite: Task = {
      id: 'out-of-curiosity',
      name: 'Out of Curiosity',
      failConditions: {
        fail: {
          id: 'obj-fail',
          status: ['complete'],
          task: { id: 'big-customer' },
        },
      } as unknown as Task['failConditions'],
      objectives: [],
      taskRequirements: [],
    };
    const dependentActiveOnly: Task = {
      id: 'big-customer',
      name: 'Big Customer',
      failConditions: [],
      objectives: [],
      taskRequirements: [{ task: { id: 'out-of-curiosity' }, status: ['active'] }],
    };
    const { processTaskData } = useGraphBuilder();
    const result = processTaskData([prerequisite, dependentActiveOnly]);
    expect(result.alternativeTasks['out-of-curiosity']).toContain('big-customer');
  });
  it('handles sparse objective arrays when deriving required keys', () => {
    const keyedTask: Task = {
      id: 'keyed-task',
      name: 'Keyed Task',
      failConditions: [],
      objectives: [
        null as unknown as NonNullable<Task['objectives']>[number],
        {
          id: 'obj-key',
          requiredKeys: [[{ id: 'item-key', name: 'Dorm Room 114 Key' }]],
        },
      ],
      taskRequirements: [],
    };
    const { processTaskData } = useGraphBuilder();
    const result = processTaskData([keyedTask]);
    expect(result.tasks[0]?.requiredKeys).toEqual([
      {
        anyOf: false,
        keys: [{ id: 'item-key', name: 'Dorm Room 114 Key' }],
        maps: undefined,
        optional: false,
      },
    ]);
  });
});
