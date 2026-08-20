import { describe, expect, it } from 'vitest';
import { useGraphBuilder } from '@/composables/useGraphBuilder';
import type { HideoutStation, Task } from '@/types/tarkov';
describe('useGraphBuilder hideout requirements', () => {
  it.each(['5449016a4bdc2d6f028b456f', '5696686a4bdc2da3298b456a', '569668774bdc2da2298b4568'])(
    'preserves currency item %s in hideout requirement metadata',
    (itemId) => {
      const stations: HideoutStation[] = [
        {
          id: 'station-1',
          name: 'Heating',
          levels: [
            {
              id: 'station-1-level-1',
              level: 1,
              constructionTime: 0,
              itemRequirements: [
                {
                  id: `currency-${itemId}`,
                  item: { id: itemId, name: 'Currency' },
                  count: 25000,
                  quantity: 25000,
                },
              ],
              stationLevelRequirements: [],
              skillRequirements: [],
              traderRequirements: [],
              crafts: [],
            },
          ],
        },
      ];
      const { processHideoutData } = useGraphBuilder();
      expect(processHideoutData(stations).neededItemHideoutModules).toMatchObject([
        {
          id: `currency-${itemId}`,
          item: { id: itemId, name: 'Currency' },
          count: 25000,
        },
      ]);
    }
  );
});
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
describe('useGraphBuilder buildWeapon containsAll needs', () => {
  const buildTask = (foundInRaid?: boolean): Task =>
    ({
      id: 'gunsmith-11',
      name: 'Gunsmith - Part 11',
      failConditions: [],
      objectives: [
        {
          id: 'obj-build',
          type: 'buildWeapon',
          count: 1,
          ...(foundInRaid === undefined ? {} : { foundInRaid }),
          item: { id: 'vector', name: 'KRISS Vector' },
          containsAll: [
            { id: 'rail', name: 'Vector modular rail' },
            { name: 'Missing id mod' },
            { id: 'foregrip', name: 'Skeletonized foregrip' },
          ],
        },
      ],
      taskRequirements: [],
    }) as unknown as Task;
  it('emits a need per explicit mod alongside the base weapon', () => {
    const { processTaskData } = useGraphBuilder();
    const needs = processTaskData([buildTask()]).neededItemTaskObjectives;
    const byId = [...needs].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId.map((need) => [need.id, need.item?.id])).toEqual([
      ['obj-build', 'vector'],
      ['obj-build:foregrip', 'foregrip'],
      ['obj-build:rail', 'rail'],
    ]);
    expect(needs.every((need) => need.taskId === 'gunsmith-11' && need.count === 1)).toBe(true);
  });
  it('keeps mod progress separate from the objective while pointing back to it', () => {
    const { processTaskData } = useGraphBuilder();
    const needs = processTaskData([buildTask()]).neededItemTaskObjectives;
    const mods = needs.filter((need) => need.id !== 'obj-build');
    expect(mods.map((need) => need.sourceObjectiveId)).toEqual(['obj-build', 'obj-build']);
    expect(needs.find((need) => need.id === 'obj-build')?.sourceObjectiveId).toBeUndefined();
  });
  it('mirrors the objective found-in-raid flag onto its mods', () => {
    const { processTaskData } = useGraphBuilder();
    const needs = processTaskData([buildTask(true)]).neededItemTaskObjectives;
    expect(needs.every((need) => need.foundInRaid === true)).toBe(true);
  });
});
