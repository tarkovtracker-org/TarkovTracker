import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { buildMapTaskVisibilityState } from '@/features/maps/utils/mapTaskVisibility';
import { mapTaskVisibilityKey } from '@/features/tasks/task-context';
import TaskMapVisibilityToggles from '@/features/tasks/TaskMapVisibilityToggles.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const mockPreferencesStore = {
  toggleMapFocusTask: vi.fn(),
  toggleMapHiddenTask: vi.fn(),
};
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
const mountToggles = (taskId: string, hidden: string[] = [], focus: string[] = []) =>
  mount(TaskMapVisibilityToggles, {
    props: { taskId },
    global: {
      provide: {
        [mapTaskVisibilityKey as symbol]: computed(() => ({
          taskIds: new Set(['task-a', 'task-b']),
          state: buildMapTaskVisibilityState(hidden, focus, ['task-a', 'task-b']),
        })),
      },
      stubs: {
        AppTooltip: { template: '<div><slot /></div>' },
        UButton: {
          inheritAttrs: false,
          props: ['ariaLabel'],
          emits: ['click'],
          template:
            '<button :data-testid="$attrs[\'data-testid\']" :aria-label="ariaLabel" @click="$emit(\'click\', $event)" />',
        },
      },
    },
  });
describe('TaskMapVisibilityToggles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('renders nothing for a task without objectives on the selected map', () => {
    const wrapper = mountToggles('task-elsewhere');
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it('toggles focus and hide for a task on the map', async () => {
    const wrapper = mountToggles('task-a');
    await wrapper.find('[data-testid="task-map-focus-toggle"]').trigger('click');
    await wrapper.find('[data-testid="task-map-hide-toggle"]').trigger('click');
    expect(mockPreferencesStore.toggleMapFocusTask).toHaveBeenCalledWith('task-a');
    expect(mockPreferencesStore.toggleMapHiddenTask).toHaveBeenCalledWith('task-a');
  });
  it('labels a hidden task with the show action', () => {
    const wrapper = mountToggles('task-a', ['task-a']);
    expect(wrapper.find('[data-testid="task-map-hide-toggle"]').attributes('aria-label')).toBe(
      'page.tasks.map.raid_plan.show_quest'
    );
  });
  it('adds an out-of-focus quest to focus when shown during active focus', async () => {
    const wrapper = mountToggles('task-a', ['task-a'], ['task-b']);
    const hideToggle = wrapper.find('[data-testid="task-map-hide-toggle"]');
    expect(hideToggle.attributes('aria-label')).toBe('page.tasks.map.raid_plan.show_quest');
    await hideToggle.trigger('click');
    expect(mockPreferencesStore.toggleMapFocusTask).toHaveBeenCalledWith('task-a');
    expect(mockPreferencesStore.toggleMapHiddenTask).not.toHaveBeenCalled();
  });
});
