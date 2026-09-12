// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskObjective from '@/features/tasks/TaskObjective.vue';
import type { TaskObjective as Objective } from '@/types/tarkov';
const { toggle, setCount } = vi.hoisted(() => ({ toggle: vi.fn(), setCount: vi.fn() }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({ objectives: [], getObjectiveModeCountDifference: () => null }),
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
    isTaskObjectiveComplete: () => false,
    isTaskComplete: () => false,
    isTaskFailed: () => false,
    getCurrentGameMode: () => 'pvp',
    getObjectiveCount: () => 0,
    toggleTaskObjectiveComplete: toggle,
    setObjectiveCount: setCount,
  }),
}));
const createWrapper = () =>
  mount(TaskObjective, {
    props: {
      objective: {
        id: 'objective-1',
        type: 'visit',
        description: 'Visit the location',
      } as Objective,
    },
    global: {
      stubs: {
        UIcon: true,
        UBadge: true,
        AppTooltip: { template: '<div><slot /></div>' },
        ObjectiveRequiredItems: true,
      },
    },
  });
describe('TaskObjective interaction boundaries', () => {
  beforeEach(() => vi.clearAllMocks());
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
});
