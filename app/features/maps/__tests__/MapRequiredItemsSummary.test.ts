import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MapRequiredItemsSummary from '@/features/maps/MapRequiredItemsSummary.vue';
import type { Task, TaskObjective } from '@/types/tarkov';
import type { ComponentCustomProperties } from 'vue';
vi.mock('@/features/tasks/ObjectiveRequiredItems.vue', () => ({
  default: {
    name: 'ObjectiveRequiredItems',
    template: '<div class="objective-required-items-mock"><slot /></div>',
    props: ['equipment', 'requiredKeys', 'counts', 'variant'],
  },
}));
const mockProgressStore = {
  objectiveCompletions: {} as Record<string, Record<string, boolean>>,
};
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => mockProgressStore,
}));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
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
        type: 'giveItem', // Should be ignored by 'bring' mode in Summary logic (wait, summary uses 'bring' mode)
        maps: [{ id: 'customs' }],
        items: [{ id: 'item-2', name: 'Item 2', shortName: 'I2' }],
      },
      {
        id: 'obj-3',
        type: 'plantItem',
        maps: [{ id: 'shoreline' }], // Different map
        items: [{ id: 'item-3', name: 'Item 3', shortName: 'I3' }],
      },
    ] as TaskObjective[],
  } as Task;
  it('renders aggregated items for the correct map', () => {
    const wrapper = mount(MapRequiredItemsSummary, {
      props: {
        mapId,
        tasks: [task],
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
    const items = wrapper.findAll('.objective-required-items-mock');
    expect(items.length).toBe(1);
    expect(wrapper.text()).toContain('page.tasks.map.required_items_summary');
    expect(wrapper.text()).not.toContain('page.tasks.map.required_keys_summary');
  });
  it('excludes completed objectives', () => {
    mockProgressStore.objectiveCompletions = {
      'obj-1': { self: true },
    };
    const wrapper = mount(MapRequiredItemsSummary, {
      props: {
        mapId,
        tasks: [task],
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
    expect(wrapper.find('.bg-surface-800/50').exists()).toBe(false);
  });
});
