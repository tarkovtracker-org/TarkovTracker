import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapTaskVisibilityPanel from '@/features/maps/MapTaskVisibilityPanel.vue';
import type { Task } from '@/types/tarkov';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const mockPreferencesStore = {
  clearMapTaskVisibility: vi.fn(),
  showOnlyMapTask: vi.fn(),
  toggleMapHiddenTask: vi.fn(),
};
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
const tasks = [
  { id: 'task-a', name: 'Task A' },
  { id: 'task-b', name: 'Task B' },
] as Task[];
const mountPanel = (hidden: string[]) =>
  mount(MapTaskVisibilityPanel, {
    props: { tasks, hiddenTaskIds: new Set(hidden) },
    global: {
      stubs: {
        UIcon: true,
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
    const wrapper = mountPanel([]);
    expect(wrapper.find('[data-testid="map-raid-plan-summary"]').text()).toContain(
      'page.tasks.map.raid_plan.summary_all'
    );
    expect(wrapper.find('[data-testid="map-raid-plan-show-all"]').exists()).toBe(false);
    const toggles = wrapper.findAll('[data-testid="map-raid-plan-row-toggle"]');
    expect(toggles.map((toggle) => toggle.attributes('aria-checked'))).toEqual(['true', 'true']);
  });
  it('shows the hidden summary and clears only the listed map tasks from Show all', async () => {
    const wrapper = mountPanel(['task-a']);
    expect(wrapper.find('[data-testid="map-raid-plan-summary"]').text()).toContain(
      'page.tasks.map.raid_plan.summary_hidden'
    );
    await wrapper.find('[data-testid="map-raid-plan-show-all"]').trigger('click');
    expect(mockPreferencesStore.clearMapTaskVisibility).toHaveBeenCalledWith(['task-a', 'task-b']);
  });
  it('toggles a row and shows only one quest', async () => {
    const wrapper = mountPanel(['task-b']);
    const toggles = wrapper.findAll('[data-testid="map-raid-plan-row-toggle"]');
    expect(toggles[1]!.attributes('aria-checked')).toBe('false');
    await toggles[1]!.trigger('click');
    expect(mockPreferencesStore.toggleMapHiddenTask).toHaveBeenCalledWith('task-b');
    await wrapper.findAll('[data-testid="map-raid-plan-row-only"]')[0]!.trigger('click');
    expect(mockPreferencesStore.showOnlyMapTask).toHaveBeenCalledWith('task-a', [
      'task-a',
      'task-b',
    ]);
  });
  it('flags when every quest on the map is hidden', () => {
    const wrapper = mountPanel(['task-a', 'task-b']);
    expect(wrapper.find('[data-testid="map-raid-plan-all-hidden"]').exists()).toBe(true);
  });
});
