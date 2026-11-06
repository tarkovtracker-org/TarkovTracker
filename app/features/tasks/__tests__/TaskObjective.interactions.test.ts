// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ObjectiveCountControls from '@/features/tasks/ObjectiveCountControls.vue';
import ObjectiveItemDisplay from '@/features/tasks/ObjectiveItemDisplay.vue';
import TaskObjective from '@/features/tasks/TaskObjective.vue';
import type { TaskObjective as Objective } from '@/types/tarkov';
const { toggle, setCount, fullObjectives, isComplete, isTaskComplete } = vi.hoisted(() => ({
  toggle: vi.fn(),
  setCount: vi.fn(),
  fullObjectives: [] as Objective[],
  isComplete: vi.fn(() => false),
  isTaskComplete: vi.fn(() => false),
}));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    objectives: fullObjectives,
    getObjectiveModeCountDifference: () => null,
  }),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({ getTaskUserView: 'self' }),
}));
vi.mock('@/stores/useProgress', () => ({ useProgressStore: () => ({ unlockedTasks: {} }) }));
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStoreWithSupabase: () => ({ systemStore: { userTeam: null } }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    isTaskObjectiveComplete: isComplete,
    isTaskComplete,
    isTaskFailed: () => false,
    getCurrentGameMode: () => 'pvp',
    getObjectiveCount: () => 0,
    toggleTaskObjectiveComplete: toggle,
    setObjectiveCount: setCount,
  }),
}));
const createWrapper = (objective: Partial<Objective> = {}) =>
  mount(TaskObjective, {
    props: {
      objective: {
        id: 'objective-1',
        type: 'visit',
        description: 'Visit the location',
        ...objective,
      } as Objective,
    },
    global: {
      stubs: {
        UIcon: true,
        UBadge: true,
        AppTooltip: { template: '<div><slot /></div>' },
        ObjectiveRequiredItems: true,
        ObjectiveItemDisplay: {
          props: ['primaryItem', 'acceptedItems', 'paused'],
          template: '<span data-testid="accepted-items"><button>Any item</button></span>',
        },
        // The count controls call useToast() in setup, which needs Nuxt composable
        // context this happy-dom fixture does not provide; they are not under test.
        ObjectiveCountControls: true,
      },
    },
  });
describe('TaskObjective interaction boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fullObjectives.length = 0;
    isComplete.mockReturnValue(false);
    isTaskComplete.mockReturnValue(false);
  });
  it('activates the row once with Enter or Space', async () => {
    const wrapper = createWrapper();
    await wrapper.trigger('keydown', { key: 'Enter' });
    expect(toggle).toHaveBeenCalledTimes(1);
    await wrapper.trigger('keydown', { key: ' ' });
    expect(toggle).toHaveBeenCalledTimes(2);
  });
  it('does not toggle twice when the nested completion button is clicked', async () => {
    const wrapper = createWrapper();
    await wrapper.get('[data-objective-controls] button').trigger('click');
    expect(toggle).toHaveBeenCalledExactlyOnceWith('objective-1');
  });
  it('ignores control-container clicks and preserves nested Space defaults', async () => {
    const wrapper = createWrapper();
    await wrapper.get('[data-objective-controls]').trigger('click');
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    wrapper.get('[data-objective-controls] button').element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
  });
  it('shows the full sell-item pool without the truncated equipment strip', async () => {
    const items = Array.from({ length: 3500 }, (_, index) => ({
      id: `item-${index}`,
      name: `Item ${index}`,
    }));
    const wrapper = createWrapper({
      type: 'sellItem',
      description: 'Sell any items to Prapor',
      count: 50,
      items,
    });
    const display = wrapper.getComponent(ObjectiveItemDisplay);
    expect(display.props('acceptedItems')).toEqual(items);
    expect(display.props('primaryItem')).toEqual(items[0]);
    expect(wrapper.find('objective-required-items-stub').exists()).toBe(false);
    expect(wrapper.text()).toContain('Sell any items to Prapor');
    expect(wrapper.find('u-icon-stub').attributes('name')).toBe('i-mdi-cart-arrow-up');
    expect(wrapper.getComponent(ObjectiveCountControls).props('neededCount')).toBe(50);
    await wrapper.get('[data-testid="accepted-items"]').trigger('click');
    await wrapper.get('[data-testid="accepted-items"] button').trigger('click');
    expect(toggle).not.toHaveBeenCalled();
    expect(setCount).not.toHaveBeenCalled();
  });
  it('uses a singular sell item when the accepted-item array is absent', () => {
    const item = { id: 'item-1', name: 'Sellable item' };
    const wrapper = createWrapper({ type: 'sellItem', item });
    expect(wrapper.getComponent(ObjectiveItemDisplay).props('primaryItem')).toEqual(item);
  });
  it('lets display clicks reach outside-dismissal listeners without changing progress', async () => {
    const wrapper = createWrapper({ type: 'sellItem', items: [{ id: 'a' }, { id: 'b' }] });
    const host = document.createElement('div');
    const bubbled = vi.fn();
    host.addEventListener('click', bubbled);
    host.append(wrapper.element);
    await wrapper.get('[data-testid="accepted-items"]').trigger('click');
    await wrapper.get('[data-testid="accepted-items"] button').trigger('click');
    expect(bubbled).toHaveBeenCalledTimes(2);
    expect(toggle).not.toHaveBeenCalled();
    expect(setCount).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('prefers the hydrated canonical item when the accepted pool has a different order', () => {
    const items = [
      { id: 'first', name: 'First' },
      { id: 'canonical', name: 'Canonical' },
    ];
    fullObjectives.push({
      id: 'objective-1',
      type: 'sellItem',
      item: items[1],
      items,
    } as Objective);
    isComplete.mockReturnValue(true);
    const wrapper = createWrapper({ type: 'sellItem', item: items[0] });
    const display = wrapper.getComponent(ObjectiveItemDisplay);
    expect(display.props('primaryItem')).toEqual(items[1]);
    expect(display.props('acceptedItems')).toEqual(items);
  });
  it('uses the hydrated sell pool when the row only has sparse metadata', () => {
    const items = [
      { id: 'item-1', name: 'First' },
      { id: 'item-2', name: 'Second' },
    ];
    fullObjectives.push({ id: 'objective-1', type: 'sellItem', items } as Objective);
    const wrapper = createWrapper({ type: 'sellItem' });
    expect(wrapper.getComponent(ObjectiveItemDisplay).props('acceptedItems')).toEqual(items);
  });
  it.each(['objective', 'task'])('pauses sale-item cycling when the %s is complete', (kind) => {
    (kind === 'objective' ? isComplete : isTaskComplete).mockReturnValue(true);
    const wrapper = createWrapper({
      type: 'sellItem',
      taskId: 'parent-task',
      items: [{ id: 'a' }, { id: 'b' }],
    });
    expect(wrapper.getComponent(ObjectiveItemDisplay).props('paused')).toBe(true);
  });
});
