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
describe('useGraphBuilder needed item accepted items', () => {
  it('carries all accepted items for "any of these" objectives', () => {
    const task: Task = {
      id: 'first-in-line',
      name: 'First in Line',
      failConditions: [],
      objectives: [
        {
          id: 'obj-meds',
          type: 'giveItem',
          count: 3,
          foundInRaid: true,
          items: [
            { id: 'augmentin', name: 'Augmentin antibiotic pills' },
            { id: 'analgin', name: 'Analgin painkillers' },
            { id: 'ibuprofen', name: 'Ibuprofen painkillers' },
          ],
        },
      ],
      taskRequirements: [],
    };
    const { processTaskData } = useGraphBuilder();
    const result = processTaskData([task]);
    const need = result.neededItemTaskObjectives.find((n) => n.id === 'obj-meds');
    expect(need).toBeDefined();
    // Primary item stays canonical for grouping/keying/progress.
    expect(need?.item?.id).toBe('augmentin');
    expect(need?.count).toBe(3);
    // Full list is carried for display-only cycling.
    expect(need?.acceptedItems?.map((i) => i.id)).toEqual(['augmentin', 'analgin', 'ibuprofen']);
  });
  it('filters falsy/invalid entries when deriving acceptedItems', () => {
    const task: Task = {
      id: 'mixed-items-task',
      name: 'Mixed Items Task',
      failConditions: [],
      objectives: [
        {
          id: 'obj-meds',
          type: 'giveItem',
          count: 3,
          foundInRaid: true,
          items: [
            { id: 'augmentin', name: 'Augmentin antibiotic pills' },
            null,
            { name: 'Missing id item' },
            { id: 'ibuprofen', name: 'Ibuprofen painkillers' },
          ],
        },
      ],
      taskRequirements: [],
    } as unknown as Task;
    const { processTaskData } = useGraphBuilder();
    const result = processTaskData([task]);
    const need = result.neededItemTaskObjectives.find((n) => n.id === 'obj-meds');
    expect(need).toBeDefined();
    expect(need?.item?.id).toBe('augmentin');
    expect(need?.count).toBe(3);
    // Only valid entries (with a real id) are retained, in order.
    expect(need?.acceptedItems?.map((i) => i.id)).toEqual(['augmentin', 'ibuprofen']);
  });
  it('omits acceptedItems when filtering leaves a single valid entry', () => {
    const task: Task = {
      id: 'one-valid-task',
      name: 'One Valid Task',
      failConditions: [],
      objectives: [
        {
          id: 'obj-one-valid',
          type: 'giveItem',
          count: 2,
          items: [{ id: 'bitcoin', name: 'Physical Bitcoin' }, null, { name: 'Missing id item' }],
        },
      ],
      taskRequirements: [],
    } as unknown as Task;
    const { processTaskData } = useGraphBuilder();
    const result = processTaskData([task]);
    const need = result.neededItemTaskObjectives.find((n) => n.id === 'obj-one-valid');
    expect(need?.item?.id).toBe('bitcoin');
    expect(need?.acceptedItems).toBeUndefined();
  });
  it('uses the first valid item as primary when items[0] lacks an id', () => {
    const task: Task = {
      id: 'sparse-primary-task',
      name: 'Sparse Primary Task',
      failConditions: [],
      objectives: [
        {
          id: 'obj-sparse-primary',
          type: 'giveItem',
          count: 3,
          // No explicit `item`; items[0] has no id, so the guard passes via
          // markerItem. Primary must be the first valid item, not the sparse entry.
          items: [
            { name: 'Missing id item' },
            { id: 'augmentin', name: 'Augmentin antibiotic pills' },
            { id: 'analgin', name: 'Analgin painkillers' },
          ],
          markerItem: { id: 'marker', name: 'Marker' },
        },
      ],
      taskRequirements: [],
    } as unknown as Task;
    const { processTaskData } = useGraphBuilder();
    const result = processTaskData([task]);
    const need = result.neededItemTaskObjectives.find((n) => n.id === 'obj-sparse-primary');
    expect(need).toBeDefined();
    // Canonical item is the first valid (id-bearing) item, never the id-less entry.
    expect(need?.item?.id).toBe('augmentin');
    expect(need?.acceptedItems?.map((i) => i.id)).toEqual(['augmentin', 'analgin']);
  });
  it('does not set acceptedItems for single-item objectives', () => {
    const task: Task = {
      id: 'single-item-task',
      name: 'Single Item Task',
      failConditions: [],
      objectives: [
        {
          id: 'obj-single',
          type: 'giveItem',
          count: 1,
          items: [{ id: 'bitcoin', name: 'Physical Bitcoin' }],
        },
      ],
      taskRequirements: [],
    };
    const { processTaskData } = useGraphBuilder();
    const result = processTaskData([task]);
    const need = result.neededItemTaskObjectives.find((n) => n.id === 'obj-single');
    expect(need?.item?.id).toBe('bitcoin');
    expect(need?.acceptedItems).toBeUndefined();
  });
});
