import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapRequiredItemsSummary from '@/features/maps/MapRequiredItemsSummary.vue';
import type { Task, TaskObjective } from '@/types/tarkov';
import type { ComponentCustomProperties } from 'vue';
vi.mock('@/features/tasks/ObjectiveRequiredItems.vue', () => ({
  default: {
    name: 'ObjectiveRequiredItems',
    template:
      '<div class="objective-required-items-mock" :data-variant="variant" :data-equipment="JSON.stringify(equipment ?? [])" :data-required-keys="JSON.stringify(requiredKeys ?? [])" :data-counts="JSON.stringify(counts ?? {})"><slot /></div>',
    props: ['equipment', 'requiredKeys', 'counts', 'variant'],
  },
}));
const mockProgressStore = {
  objectiveCompletions: {} as Record<string, Record<string, boolean>>,
};
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => mockProgressStore,
}));
describe('MapRequiredItemsSummary', () => {
  const mapId = 'customs';
  const task: Task = {
    id: 'task-1',
    name: 'Test Task',
    objectives: [
      {
        id: 'obj-1',
        type: 'plantItem',
        maps: [{ id: 'customs' }],
        items: [{ id: 'item-1', name: 'Item 1', shortName: 'I1' }],
        count: 2,
      },
      {
        id: 'obj-2',
        type: 'giveItem',
        maps: [{ id: 'customs' }],
        items: [{ id: 'item-2', name: 'Item 2', shortName: 'I2' }],
      },
      {
        id: 'obj-3',
        type: 'plantItem',
        maps: [{ id: 'shoreline' }],
        items: [{ id: 'item-3', name: 'Item 3', shortName: 'I3' }],
      },
    ] as TaskObjective[],
  } as Task;
  const mountSummary = (tasks: Task[]) =>
    mount(MapRequiredItemsSummary, {
      props: {
        mapId,
        tasks,
      },
      global: {
        stubs: {
          UIcon: true,
        },
        config: {
          globalProperties: { $t: (key: string) => key } as ComponentCustomProperties &
            Record<string, unknown>,
        },
      },
    });
  beforeEach(() => {
    mockProgressStore.objectiveCompletions = {};
  });
  it('aggregates bring-mode equipment for the selected map with counts', () => {
    const wrapper = mountSummary([task]);
    const equipmentSummary = wrapper.find('[data-variant="equipment"]');
    expect(equipmentSummary.exists()).toBe(true);
    const equipment = JSON.parse(equipmentSummary.attributes('data-equipment') ?? '[]') as Array<{
      id: string;
    }>;
    const counts = JSON.parse(equipmentSummary.attributes('data-counts') ?? '{}') as Record<
      string,
      number
    >;
    expect(equipment.map((item) => item.id)).toEqual(['item-1']);
    expect(counts).toEqual({ 'item-1': 2 });
    expect(wrapper.text()).toContain('page.tasks.map.required_items_summary');
    expect(wrapper.find('[data-variant="keys"]').exists()).toBe(false);
  });
  it('preserves key alternative groups in map summary', () => {
    const keyTask: Task = {
      id: 'task-2',
      name: 'Key Task',
      objectives: [
        {
          id: 'key-obj-1',
          type: 'mark',
          maps: [{ id: 'customs' }],
          requiredKeys: [
            [
              { id: 'key-a', name: 'Key A', shortName: 'A' },
              { id: 'key-b', name: 'Key B', shortName: 'B' },
            ],
          ],
        },
        {
          id: 'key-obj-2',
          type: 'mark',
          maps: [{ id: 'customs' }],
          requiredKeys: [[{ id: 'key-c', name: 'Key C', shortName: 'C' }]],
        },
      ] as TaskObjective[],
    } as Task;
    const wrapper = mountSummary([keyTask]);
    const keysSummary = wrapper.find('[data-variant="keys"]');
    expect(keysSummary.exists()).toBe(true);
    const keyGroups = JSON.parse(keysSummary.attributes('data-required-keys') ?? '[]') as Array<
      Array<{ id: string }>
    >;
    expect(keyGroups.map((group) => group.map((key) => key.id))).toEqual([
      ['key-a', 'key-b'],
      ['key-c'],
    ]);
    expect(wrapper.text()).toContain('page.tasks.map.required_keys_summary');
  });
  it('excludes completed objectives', () => {
    mockProgressStore.objectiveCompletions = {
      'obj-1': { self: true },
    };
    const wrapper = mountSummary([task]);
    expect(wrapper.find('.bg-surface-800/50').exists()).toBe(false);
  });
});
