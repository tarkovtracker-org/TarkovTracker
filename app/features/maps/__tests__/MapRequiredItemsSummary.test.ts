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
    expect(keysSummary.classes()).toContain('mt-0!');
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
    expect(wrapper.findAll('h3').map((heading) => heading.text())).toEqual([
      'page.tasks.pinned_tasks_section',
      'page.tasks.map.active_tasks_group',
    ]);
    expect(wrapper.findAll('h4').map((heading) => heading.text())).toEqual([
      'page.tasks.map.required_items',
      'page.tasks.map.required_items',
    ]);
    expect(wrapper.text()).not.toContain('page.tasks.map.required_items_summary');
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
  it('does not let the team chip change required items', () => {
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['obj-1', { category: 'self', selfNeedsObjective: true }],
    ]);
    const withTeam = mountSummary([task], objectiveVisibility);
    expect(equipmentIds(withTeam.get('[data-variant="equipment"]'))).toEqual(['item-1']);
    mockPreferencesStore.getMapShowTeamObjectives = false;
    const withoutTeam = mountSummary([task], objectiveVisibility);
    expect(equipmentIds(withoutTeam.get('[data-variant="equipment"]'))).toEqual(['item-1']);
  });
  it('excludes objectives only teammates still need', () => {
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
      ['team-obj', { category: 'team', selfNeedsObjective: false }],
    ]);
    const wrapper = mountSummary([teamTask], objectiveVisibility);
    expect(wrapper.find('[data-variant="equipment"]').exists()).toBe(false);
  });
  it('excludes a completed objective even while a teammate still needs it', () => {
    mockProgressStore.objectiveCompletions = { 'obj-1': { self: true } };
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['obj-1', { category: 'team', selfNeedsObjective: false }],
    ]);
    const wrapper = mountSummary([task], objectiveVisibility);
    expect(wrapper.find('[data-variant="equipment"]').exists()).toBe(false);
  });
  it('excludes a completed pinned objective a teammate still needs', () => {
    mockPreferencesStore.getPinnedTaskIds = ['task-pinned'];
    mockProgressStore.objectiveCompletions = { 'pinned-obj-1': { self: true } };
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['pinned-obj-1', { category: 'pinned', selfNeedsObjective: false }],
    ]);
    const wrapper = mountSummary([pinnedTask], objectiveVisibility);
    expect(wrapper.find('[data-variant="equipment"]').exists()).toBe(false);
  });
  // A pinned task reports `category: 'pinned'` even when only a teammate still needs the
  // objective, so `category` alone cannot be trusted here. This is the state reached when the
  // player pins a task they have not unlocked, or one they failed, while a teammate is on it.
  it('excludes a pinned objective only a teammate still needs', () => {
    mockPreferencesStore.getPinnedTaskIds = ['task-pinned'];
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['pinned-obj-1', { category: 'pinned', selfNeedsObjective: false }],
    ]);
    const wrapper = mountSummary([pinnedTask], objectiveVisibility);
    expect(wrapper.find('[data-variant="equipment"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('page.tasks.pinned_tasks_section');
  });
  it('splits pinned and active groups when visibility state is supplied', () => {
    mockPreferencesStore.getPinnedTaskIds = ['task-pinned'];
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['obj-1', { category: 'self', selfNeedsObjective: true }],
      ['pinned-obj-1', { category: 'pinned', selfNeedsObjective: true }],
    ]);
    const wrapper = mountSummary([task, pinnedTask], objectiveVisibility);
    const groups = wrapper.findAll('[data-variant="equipment"]');
    expect(groups).toHaveLength(2);
    expect(equipmentIds(groups[0]!)).toEqual(['item-pinned']);
    expect(equipmentIds(groups[1]!)).toEqual(['item-1']);
  });
  it('hides the pinned group by category gate when visibility state is supplied', () => {
    mockPreferencesStore.getPinnedTaskIds = ['task-pinned'];
    mockPreferencesStore.getMapShowPinnedObjectives = false;
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['obj-1', { category: 'self', selfNeedsObjective: true }],
      ['pinned-obj-1', { category: 'pinned', selfNeedsObjective: true }],
    ]);
    const wrapper = mountSummary([task, pinnedTask], objectiveVisibility);
    const groups = wrapper.findAll('[data-variant="equipment"]');
    expect(groups).toHaveLength(1);
    expect(equipmentIds(groups[0]!)).toEqual(['item-1']);
  });
  it('excludes objectives the player no longer needs when visibility state is supplied', () => {
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['obj-1', { category: 'self', selfNeedsObjective: false }],
    ]);
    const wrapper = mountSummary([task], objectiveVisibility);
    expect(wrapper.find('[data-variant="equipment"]').exists()).toBe(false);
  });
  it('excludes objectives missing from the supplied visibility map', () => {
    const wrapper = mountSummary([task], new Map<string, MapObjectiveVisibility>());
    expect(wrapper.find('[data-variant="equipment"]').exists()).toBe(false);
  });
  it('splits key groups across the pinned and active groups', () => {
    mockPreferencesStore.getPinnedTaskIds = ['keyed-pinned'];
    const keyedPinned: Task = {
      id: 'keyed-pinned',
      objectives: [
        {
          id: 'keyed-pinned-obj',
          type: 'mark',
          maps: [{ id: 'customs' }],
          requiredKeys: [[{ id: 'key-pinned', name: 'Pinned Key', shortName: 'PK' }]],
        },
      ] as TaskObjective[],
    } as Task;
    const keyedActive: Task = {
      id: 'keyed-active',
      objectives: [
        {
          id: 'keyed-active-obj',
          type: 'mark',
          maps: [{ id: 'customs' }],
          requiredKeys: [[{ id: 'key-active', name: 'Active Key', shortName: 'AK' }]],
        },
      ] as TaskObjective[],
    } as Task;
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>([
      ['keyed-pinned-obj', { category: 'pinned', selfNeedsObjective: true }],
      ['keyed-active-obj', { category: 'self', selfNeedsObjective: true }],
    ]);
    const wrapper = mountSummary([keyedPinned, keyedActive], objectiveVisibility);
    const keyGroups = wrapper.findAll('[data-variant="keys"]');
    expect(keyGroups).toHaveLength(2);
    const idsFor = (element: { attributes: (key: string) => string | undefined }) =>
      (
        JSON.parse(element.attributes('data-required-keys') ?? '[]') as Array<Array<{ id: string }>>
      ).flatMap((group) => group.map((key) => key.id));
    expect(idsFor(keyGroups[0]!)).toEqual(['key-pinned']);
    expect(idsFor(keyGroups[1]!)).toEqual(['key-active']);
  });
});
