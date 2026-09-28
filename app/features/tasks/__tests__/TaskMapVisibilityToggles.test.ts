import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { mapTaskVisibilityKey } from '@/features/tasks/task-context';
import TaskMapVisibilityToggles from '@/features/tasks/TaskMapVisibilityToggles.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const mockPreferencesStore = {
  showOnlyMapTask: vi.fn(),
  toggleMapHiddenTask: vi.fn(),
};
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
const mountToggles = (taskId: string, hidden: string[] = []) =>
  mount(TaskMapVisibilityToggles, {
    props: { taskId },
    global: {
      provide: {
        [mapTaskVisibilityKey as symbol]: computed(() => ({
          taskIds: ['task-a', 'task-b'],
          hiddenTaskIds: new Set(hidden),
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
  it('hides a task or shows only it', async () => {
    const wrapper = mountToggles('task-a');
    await wrapper.find('[data-testid="task-map-show-only"]').trigger('click');
    await wrapper.find('[data-testid="task-map-hide-toggle"]').trigger('click');
    expect(mockPreferencesStore.showOnlyMapTask).toHaveBeenCalledWith('task-a', [
      'task-a',
      'task-b',
    ]);
    expect(mockPreferencesStore.toggleMapHiddenTask).toHaveBeenCalledWith('task-a');
  });
  it('offers only the show action for a hidden task', async () => {
    const wrapper = mountToggles('task-a', ['task-a']);
    expect(wrapper.find('[data-testid="task-map-show-only"]').exists()).toBe(false);
    const hideToggle = wrapper.find('[data-testid="task-map-hide-toggle"]');
    expect(hideToggle.attributes('aria-label')).toBe('page.tasks.map.raid_plan.show_quest');
    await hideToggle.trigger('click');
    expect(mockPreferencesStore.toggleMapHiddenTask).toHaveBeenCalledWith('task-a');
  });
});
