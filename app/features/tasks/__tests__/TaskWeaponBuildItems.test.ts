// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { useGraphBuilder } from '@/composables/useGraphBuilder';
import { useNeededItemProgress } from '@/features/neededitems/useNeededItemProgress';
import QuestObjectives from '@/features/tasks/QuestObjectives.vue';
import type { Task, TaskObjective as Objective } from '@/types/tarkov';
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => metadata }));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({ getTaskUserView: 'self' }),
}));
vi.mock('@/stores/useProgress', () => ({ useProgressStore: () => ({ unlockedTasks: {} }) }));
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStoreWithSupabase: () => ({ systemStore: { userTeam: null } }),
}));
vi.mock('@/stores/useTarkov', () => ({ useTarkovStore: () => store }));
const objective: Objective = {
  id: 'build',
  taskId: 'gunsmith',
  type: 'buildWeapon',
  description: 'Build the weapon with the required specifications',
  item: { id: 'weapon', name: 'Base weapon' },
  containsAll: [{ id: 'part', name: 'Required part' }],
};
const needs = useGraphBuilder().processTaskData([
  { id: 'gunsmith', objectives: [objective] } as Task,
]).neededItemTaskObjectives;
const metadata = {
  objectives: [objective],
  neededItemTaskObjectives: needs,
  getObjectiveModeCountDifference: () => null,
};
const state = reactive({
  counts: {} as Record<string, number>,
  completions: {} as Record<string, boolean>,
  taskState: 'incomplete',
});
const store = {
  getObjectiveCount: (id: string) => state.counts[id] ?? 0,
  setObjectiveCount: vi.fn((id: string, count: number) => {
    state.counts[id] = count;
  }),
  isTaskObjectiveComplete: (id: string) => state.completions[id] === true,
  toggleTaskObjectiveComplete: vi.fn((id: string) => {
    state.completions[id] = !state.completions[id];
  }),
  isTaskComplete: () => state.taskState === 'complete',
  isTaskFailed: () => state.taskState === 'failed',
  getCurrentGameMode: () => 'pvp',
};
const render = (value = objective) =>
  mount(QuestObjectives, {
    props: { objectives: [value], irrelevantCount: 0, uncompletedIrrelevant: 0 },
    global: {
      stubs: {
        UIcon: true,
        UBadge: true,
        'i18n-t': true,
        AppTooltip: { template: '<div><slot /></div>' },
        ObjectiveRequiredItems: true,
        ObjectiveItemDisplay: {
          props: ['primaryItem'],
          template: '<span>{{ primaryItem.name }}</span>',
        },
        ObjectiveCountControls: true,
      },
    },
  });
describe('weapon build collection on task cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.counts = {};
    state.completions = { unrelated: true };
    state.taskState = 'incomplete';
    metadata.neededItemTaskObjectives = needs;
  });
  it('renders the existing base and part needs below the separate objective control', () => {
    const wrapper = render();
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('Base weapon');
    expect(wrapper.text()).toContain('Required part');
    expect(wrapper.get('[role="button"]').find('[data-weapon-build-items]').exists()).toBe(false);
    expect(
      render({ ...objective, type: 'visit' })
        .find('[data-weapon-build-items]')
        .exists()
    ).toBe(false);
  });
  it('shares both directions of Needed Items collection without completing the build or other objectives', async () => {
    const wrapper = render();
    const [base, part] = needs;
    const progress = useNeededItemProgress();
    await wrapper.get('input[aria-label$="Required part"]').setValue(true);
    expect(store.setObjectiveCount).toHaveBeenLastCalledWith('build:part', 1);
    expect(progress.storedCountOf(part!)).toBe(1);
    progress.setCount(base!, 1);
    await nextTick();
    expect(
      (wrapper.get('input[aria-label$="Base weapon"]').element as HTMLInputElement).checked
    ).toBe(true);
    progress.setCount(part!, 0);
    await nextTick();
    expect(
      (wrapper.get('input[aria-label$="Required part"]').element as HTMLInputElement).checked
    ).toBe(false);
    expect(store.toggleTaskObjectiveComplete).not.toHaveBeenCalled();
    expect(state.completions).toEqual({ unrelated: true });
    await wrapper.get('[data-objective-controls] button').trigger('click');
    expect(state.completions).toEqual({ unrelated: true, build: true });
    expect(state.counts).toEqual({ 'build:part': 0, build: 1 });
  });
  it.each(['complete', 'failed'])('disables collection for a %s parent task', async (status) => {
    state.taskState = status;
    const wrapper = render();
    expect((wrapper.get('input').element as HTMLInputElement).disabled).toBe(true);
    await wrapper.get('input').trigger('change');
    expect(store.setObjectiveCount).not.toHaveBeenCalled();
  });
  it('keeps multi-item collection bounded and separate from objective completion', async () => {
    metadata.neededItemTaskObjectives = [{ ...needs[0]!, count: 2 }, needs[1]!];
    const wrapper = render();
    const controls = wrapper.findComponent({ name: 'ObjectiveCountControls' });
    controls.vm.$emit('increase');
    await nextTick();
    expect(state.counts.build).toBe(1);
    controls.vm.$emit('set-count', 9);
    await nextTick();
    expect(state.counts.build).toBe(2);
    controls.vm.$emit('toggle');
    await nextTick();
    expect(state.counts.build).toBe(0);
    controls.vm.$emit('decrease');
    await nextTick();
    expect(state.counts.build).toBe(0);
    expect(state.completions).toEqual({ unrelated: true });
  });
});
