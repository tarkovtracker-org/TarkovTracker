import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapRequiredItemsSummary from '@/features/maps/MapRequiredItemsSummary.vue';
import type { MapObjectiveVisibility } from '@/composables/useMapObjectiveMarks';
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
const defaultMarkerColors: Record<string, string> = { PINNED_OBJECTIVE: '#7c3bed' };
const mockPreferencesStore = {
  getPinnedTaskIds: [] as string[],
  getMapShowPinnedObjectives: true,
  getMapShowSelfObjectives: true,
  getMapShowTeamObjectives: true,
  getMapMarkerColors: { ...defaultMarkerColors },
};
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
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
  const mountSummary = (
    tasks: Task[],
    objectiveVisibility?: ReadonlyMap<string, MapObjectiveVisibility>
  ) =>
    mount(MapRequiredItemsSummary, {
      props: {
        mapId,
        objectiveVisibility,
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
  const pinnedTask: Task = {
    id: 'task-pinned',
    name: 'Pinned Task',
    objectives: [
      {
        id: 'pinned-obj-1',
        type: 'plantItem',
        maps: [{ id: 'customs' }],
        items: [{ id: 'item-pinned', name: 'Pinned Item', shortName: 'PI' }],
        count: 1,
      },
    ] as TaskObjective[],
  } as Task;
  const equipmentIds = (element: { attributes: (key: string) => string | undefined }) =>
    (JSON.parse(element.attributes('data-equipment') ?? '[]') as Array<{ id: string }>).map(
      (item) => item.id
    );
  beforeEach(() => {
    mockProgressStore.objectiveCompletions = {};
    mockPreferencesStore.getPinnedTaskIds = [];
    mockPreferencesStore.getMapShowPinnedObjectives = true;
    mockPreferencesStore.getMapShowSelfObjectives = true;
    mockPreferencesStore.getMapShowTeamObjectives = true;
    mockPreferencesStore.getMapMarkerColors = { ...defaultMarkerColors };
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
  it('splits pinned tasks into a leading accented group', () => {
    mockPreferencesStore.getPinnedTaskIds = ['task-pinned'];
    const wrapper = mountSummary([task, pinnedTask]);
    const groups = wrapper.findAll('[data-variant="equipment"]');
    expect(groups).toHaveLength(2);
    expect(equipmentIds(groups[0]!)).toEqual(['item-pinned']);
    expect(equipmentIds(groups[1]!)).toEqual(['item-1']);
    expect(wrapper.text()).toContain('page.tasks.pinned_tasks_section');
    expect(wrapper.text()).toContain('page.tasks.map.active_tasks_group');
  });
  it('applies the custom pinned marker colour as the group accent', () => {
    mockPreferencesStore.getPinnedTaskIds = ['task-pinned'];
    mockPreferencesStore.getMapMarkerColors = { PINNED_OBJECTIVE: '#123456' };
    const wrapper = mountSummary([pinnedTask]);
    expect(wrapper.html()).toContain('#123456');
  });
  it('renders no group titles when nothing is pinned', () => {
    const wrapper = mountSummary([task]);
    expect(wrapper.text()).toContain('page.tasks.map.required_items_summary');
    expect(wrapper.text()).not.toContain('page.tasks.pinned_tasks_section');
    expect(wrapper.text()).not.toContain('page.tasks.map.active_tasks_group');
  });
  it('hides the pinned group when the pinned chip is off', () => {
    mockPreferencesStore.getPinnedTaskIds = ['task-pinned'];
    mockPreferencesStore.getMapShowPinnedObjectives = false;
    const wrapper = mountSummary([task, pinnedTask]);
    const groups = wrapper.findAll('[data-variant="equipment"]');
    expect(groups).toHaveLength(1);
    expect(equipmentIds(groups[0]!)).toEqual(['item-1']);
    expect(wrapper.text()).not.toContain('page.tasks.pinned_tasks_section');
    expect(wrapper.text()).not.toContain('page.tasks.map.active_tasks_group');
  });
  it('hides the active group when the regular chip is off', () => {
    mockPreferencesStore.getPinnedTaskIds = ['task-pinned'];
    mockPreferencesStore.getMapShowSelfObjectives = false;
    mockPreferencesStore.getMapShowTeamObjectives = true;
    const wrapper = mountSummary([task, pinnedTask]);
    const groups = wrapper.findAll('[data-variant="equipment"]');
    expect(groups).toHaveLength(1);
    expect(equipmentIds(groups[0]!)).toEqual(['item-pinned']);
    expect(wrapper.text()).toContain('page.tasks.pinned_tasks_section');
  });
  it('renders nothing when both chips are off', () => {
    mockPreferencesStore.getPinnedTaskIds = ['task-pinned'];
    mockPreferencesStore.getMapShowPinnedObjectives = false;
    mockPreferencesStore.getMapShowSelfObjectives = false;
    mockPreferencesStore.getMapShowTeamObjectives = false;
    const wrapper = mountSummary([task, pinnedTask]);
    expect(wrapper.findAll('[data-variant]')).toHaveLength(0);
    expect(wrapper.text().trim()).toBe('');
  });
  it('does not let the team chip change active required items', () => {
    const teamTask: Task = {
      id: 'team-task',
      objectives: [
        {
          id: 'team-obj',
          type: 'plantItem',
          maps: [{ id: 'customs' }],
          items: [{ id: 'item-team', name: 'Team Item', shortName: 'TI' }],
        },
      ] as TaskObjective[],
    } as Task;
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['team-obj', { category: 'team', hasActiveObjective: true }],
    ]);
    const withTeam = mountSummary([teamTask], objectiveVisibility);
    expect(equipmentIds(withTeam.get('[data-variant="equipment"]'))).toEqual(['item-team']);
    mockPreferencesStore.getMapShowTeamObjectives = false;
    const withoutTeam = mountSummary([teamTask], objectiveVisibility);
    expect(equipmentIds(withoutTeam.get('[data-variant="equipment"]'))).toEqual(['item-team']);
  });
  it('retains a teammate objective when self already completed it', () => {
    mockProgressStore.objectiveCompletions = { 'team-obj': { self: true } };
    const teamTask: Task = {
      id: 'team-task',
      objectives: [
        {
          id: 'team-obj',
          type: 'plantItem',
          maps: [{ id: 'customs' }],
          items: [{ id: 'item-team', name: 'Team Item', shortName: 'TI' }],
        },
      ] as TaskObjective[],
    } as Task;
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['team-obj', { category: 'team', hasActiveObjective: true }],
    ]);
    const wrapper = mountSummary([teamTask], objectiveVisibility);
    expect(equipmentIds(wrapper.get('[data-variant="equipment"]'))).toEqual(['item-team']);
  });
});
