import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapTaskVisibilityPanel from '@/features/maps/MapTaskVisibilityPanel.vue';
import { buildMapTaskVisibilityState } from '@/features/maps/utils/mapTaskVisibility';
import type { Task } from '@/types/tarkov';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const mockPreferencesStore = {
  clearMapTaskVisibility: vi.fn(),
};
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
const tasks = [
  { id: 'task-a', name: 'Task A' },
  { id: 'task-b', name: 'Task B' },
] as Task[];
const mountPanel = (hidden: string[], focus: string[]) =>
  mount(MapTaskVisibilityPanel, {
    props: {
      tasks,
      state: buildMapTaskVisibilityState(
        hidden,
        focus,
        tasks.map((task) => task.id)
      ),
    },
    global: {
      stubs: {
        UIcon: true,
        TaskMapVisibilityToggles: {
          props: ['taskId'],
          template: '<span class="toggles-stub" :data-task-id="taskId" />',
        },
        AppTooltip: { template: '<div><slot /></div>' },
        UPopover: { template: '<div><slot /><slot name="content" /></div>' },
        UButton: {
          inheritAttrs: false,
          props: ['ariaLabel'],
          emits: ['click'],
          template:
            '<button :data-testid="$attrs[\'data-testid\']" :aria-label="ariaLabel" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });
describe('MapTaskVisibilityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('summarizes all quests and hides Show all when nothing is hidden', () => {
    const wrapper = mountPanel([], []);
    expect(wrapper.find('[data-testid="map-raid-plan-summary"]').text()).toContain(
      'page.tasks.map.raid_plan.summary_all'
    );
    expect(wrapper.find('[data-testid="map-raid-plan-show-all"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="map-raid-plan-row"]')).toHaveLength(2);
  });
  it('clears only the listed map tasks from Show all', async () => {
    const wrapper = mountPanel(['task-a'], []);
    await wrapper.find('[data-testid="map-raid-plan-show-all"]').trigger('click');
    expect(mockPreferencesStore.clearMapTaskVisibility).toHaveBeenCalledWith(['task-a', 'task-b']);
  });
  it('flags when every quest on the map is hidden', () => {
    const wrapper = mountPanel(['task-a', 'task-b'], []);
    expect(wrapper.find('[data-testid="map-raid-plan-all-hidden"]').exists()).toBe(true);
  });
  it('renders per-quest toggles and marks unfocused rows while focus is active', () => {
    const wrapper = mountPanel([], ['task-b']);
    const toggles = wrapper.findAll('.toggles-stub').map((node) => node.attributes('data-task-id'));
    expect(toggles).toEqual(['task-a', 'task-b']);
    expect(wrapper.find('[data-testid="map-raid-plan-summary"]').text()).toContain(
      'page.tasks.map.raid_plan.summary_focus'
    );
    expect(wrapper.text()).toContain('page.tasks.map.raid_plan.status_unfocused');
  });
});
