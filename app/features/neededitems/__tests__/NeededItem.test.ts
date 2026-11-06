// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, inject, nextTick, reactive, ref } from 'vue';
import { neededItemKey } from '@/features/neededitems/neededitem-keys';
import NeededItem from '@/features/neededitems/NeededItem.vue';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
const state = reactive({
  count: 0,
  partComplete: false,
  taskComplete: false,
  failed: false,
  moduleComplete: false,
});
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getObjectiveCount: () => state.count,
    getHideoutPartCount: () => state.count,
    setObjectiveCount: (_id: string, count: number) => {
      state.count = count;
    },
    setHideoutPartCount: (_id: string, count: number) => {
      state.count = count;
    },
    isHideoutPartComplete: () => state.partComplete,
    setHideoutPartComplete: () => {
      state.partComplete = true;
    },
    setHideoutPartUncomplete: () => {
      state.partComplete = false;
    },
    isTaskComplete: () => state.taskComplete,
    isTaskFailed: () => state.failed,
    isHideoutModuleComplete: () => false,
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    get moduleCompletions() {
      return { module: { self: state.moduleComplete } };
    },
    objectiveCompletions: { objective: { self: false, friend: false, done: true } },
    tasksCompletions: { task: { friend: false } },
    modulePartCompletions: { part: { friend: false } },
    getDisplayName: (user: string) => `name-${user}`,
    teamStores: { friend: { getObjectiveCount: () => 1, getHideoutPartCount: () => 2 } },
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    tasks: [
      {
        id: 'task',
        name: 'Quest',
        parents: ['parent'],
        minPlayerLevel: 12,
        kappaRequired: true,
        lightkeeperRequired: true,
      },
    ],
    hideoutStations: [{ id: 'station', name: 'Workbench' }],
    alternativeTasks: {},
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string, params?: Record<string, unknown>) =>
      `${key}${params ? JSON.stringify(params) : ''}`,
  }),
}));
vi.mock('@/stores/usePreferences', () => ({ usePreferencesStore: () => ({}) }));
vi.mock('@/composables/useCraftableItem', () => ({
  useCraftableItem: () => ({ isCraftable: computed(() => false) }),
}));
vi.mock('@/composables/useCyclingItem', () => ({
  useCyclingItem: () => ({ currentItem: computed(() => null), isCycling: computed(() => false) }),
}));
const Probe = defineComponent({
  emits: ['increase-count', 'decrease-count', 'toggle-count', 'set-count'],
  setup() {
    return { context: inject(neededItemKey)! };
  },
  template: `<div>
    <output>{{ context.currentCount.value }}/{{ context.neededCount.value }}|{{ context.selfCompletedNeed.value }}|{{ context.item.value?.id }}|{{ context.relatedTask.value?.name }}|{{ context.relatedStation.value?.name }}|{{ context.lockedBefore.value }}|{{ context.levelRequired.value }}|{{ context.isKappaRequired.value }}|{{ context.isLightkeeperRequired.value }}|{{ JSON.stringify(context.teamNeeds.value) }}|hidden:{{ context.hiddenForSelf.value }}|hint:{{ context.hiddenForSelfHint.value }}</output>
    <button @click="$emit('increase-count')">increase</button>
    <button @click="$emit('decrease-count')">decrease</button>
    <button @click="$emit('toggle-count')">toggle</button>
    <button @click="$emit('set-count', 1)">set</button>
  </div>`,
});
const taskNeed = {
  id: 'objective',
  taskId: 'task',
  needType: 'taskObjective',
  count: 3,
  item: { id: 'bolts' },
} as NeededItemTaskObjective;
const hideoutNeed = {
  id: 'part',
  needType: 'hideoutModule',
  count: 3,
  item: { id: 'screw' },
  hideoutModule: { id: 'module', stationId: 'station', predecessors: ['previous'] },
} as NeededItemHideoutModule;
const render = (
  need: NeededItemTaskObjective | NeededItemHideoutModule,
  itemStyle: 'card' | 'row'
) =>
  mount(NeededItem, {
    props: { need, itemStyle, initiallyVisible: true },
    global: {
      stubs: {
        AsyncComponentWrapper: Probe,
        LazyNeededItemSmallCard: Probe,
        LazyNeededItemRow: Probe,
        NeededItemSmallCard: Probe,
        NeededItemRow: Probe,
      },
    },
  });
describe('NeededItem progress wiring', () => {
  beforeEach(() =>
    Object.assign(state, {
      count: 0,
      partComplete: false,
      taskComplete: false,
      failed: false,
      moduleComplete: false,
    })
  );
  it.each(['card', 'row'] as const)(
    'persists all %s task controls through shared progress',
    async (style) => {
      const wrapper = render(taskNeed, style);
      await flushPromises();
      const buttons = wrapper.findAll('button');
      await buttons[0]!.trigger('click');
      expect(state.count).toBe(1);
      expect(wrapper.get('output').text()).toContain('1/3|false|bolts|Quest');
      expect(wrapper.get('output').text()).toContain('12|true|true');
      expect(wrapper.text()).toContain('"user":"friend","count":1');
      await buttons[2]!.trigger('click');
      expect(state.count).toBe(3);
      await buttons[1]!.trigger('click');
      expect(state.count).toBe(2);
      await buttons[3]!.trigger('click');
      expect(state.count).toBe(1);
      state.taskComplete = true;
      await nextTick();
      expect(wrapper.get('output').text()).toContain('3/3|true');
      state.failed = true;
      await nextTick();
      expect(wrapper.get('output').text()).toContain('1/3|false');
    }
  );
  it('provides hiddenForSelf from the need Needed Items kept for teammates', async () => {
    const hidden = render({ ...taskNeed, hiddenForSelf: true }, 'card');
    const shown = render(taskNeed, 'card');
    await flushPromises();
    expect(hidden.get('output').text()).toContain('hidden:true');
    expect(hidden.get('output').text()).toContain(
      'hint:needed_items.hidden_for_you_hint{"teammates":"name-friend (1/'
    );
    expect(shown.get('output').text()).toContain('hidden:false|hint:');
    expect(shown.get('output').text()).not.toContain('hidden_for_you_hint');
  });
  it.each(['card', 'row'] as const)(
    'synchronizes %s hideout collection and completion',
    async (style) => {
      const wrapper = render(hideoutNeed, style);
      await flushPromises();
      expect(wrapper.get('output').text()).toContain('screw||Workbench|1|0|false|false');
      expect(wrapper.text()).toContain('"user":"friend","count":2');
      await flushPromises();
      const buttons = wrapper.findAll('button');
      await buttons[2]!.trigger('click');
      expect(state.count).toBe(3);
      expect(state.partComplete).toBe(true);
      await buttons[1]!.trigger('click');
      expect(state.count).toBe(2);
      expect(state.partComplete).toBe(false);
      await buttons[0]!.trigger('click');
      expect(state.partComplete).toBe(true);
      await buttons[3]!.trigger('click');
      expect(state.count).toBe(1);
      expect(state.partComplete).toBe(false);
      state.moduleComplete = true;
      await nextTick();
      expect(wrapper.get('output').text()).toContain('3/3|true');
    }
  );
});
