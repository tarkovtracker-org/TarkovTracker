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
  getMapTaskColors: {} as Record<string, string>,
  setMapTaskColor: vi.fn(),
  clearMapTaskColors: vi.fn(),
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
const mountPanel = (hidden: string[], props: Record<string, unknown> = {}) =>
  mount(MapTaskVisibilityPanel, {
    props: { tasks, hiddenTaskIds: new Set(hidden), ...props },
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
    mockPreferencesStore.getMapTaskColors = {};
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
  describe('quest colors (#920)', () => {
    const taskColors = new Map([
      ['task-a', '#e69f00'],
      ['task-b', '#0072b2'],
    ]);
    it('shows no legend or color pickers outside the quest color mode', () => {
      const wrapper = mountPanel([]);
      expect(wrapper.find('[data-testid="map-quest-legend"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="map-raid-plan-row-color"]').exists()).toBe(false);
    });
    it('lists shown quests in their colors and drops hidden ones from the legend', () => {
      const wrapper = mountPanel(['task-b'], { taskColors });
      const items = wrapper.findAll('[data-testid="map-quest-legend-item"]');
      expect(items.map((item) => item.text())).toEqual(['Task A']);
      expect(items[0]!.find('span').attributes('style')).toContain('background-color: #e69f00');
      // The hidden quest keeps its picker, so its color is ready when it is shown again.
      const pickers = wrapper.findAll('[data-testid="map-raid-plan-row-color"]');
      expect(pickers.map((picker) => (picker.element as HTMLInputElement).value)).toEqual([
        '#e69f00',
        '#0072b2',
      ]);
    });
    it('reports legend hover, focus and clicks for the map highlight', async () => {
      const wrapper = mountPanel([], {
        taskColors,
        highlightedTaskId: 'task-b',
        lockedTaskId: 'task-b',
      });
      const items = wrapper.findAll('[data-testid="map-quest-legend-item"]');
      expect(items.map((item) => item.attributes('aria-pressed'))).toEqual(['false', 'true']);
      expect(items[1]!.classes()).toContain('bg-white/10');
      await items[0]!.trigger('mouseenter');
      await items[0]!.trigger('mouseleave');
      await items[1]!.trigger('focus');
      await items[1]!.trigger('blur');
      await items[0]!.trigger('click');
      expect(wrapper.emitted('highlight')).toEqual([['task-a'], [null], ['task-b'], [null]]);
      expect(wrapper.emitted('toggle-highlight-lock')).toEqual([['task-a']]);
    });
    it('saves a picked color and resets one or every picked quest', async () => {
      mockPreferencesStore.getMapTaskColors = { 'task-b': '#0072b2', 'other-map-task': '#111111' };
      const wrapper = mountPanel([], { taskColors });
      const picker = wrapper.findAll('[data-testid="map-raid-plan-row-color"]')[0]!;
      await picker.setValue('#123456');
      await picker.trigger('change');
      expect(mockPreferencesStore.setMapTaskColor).toHaveBeenCalledWith('task-a', '#123456');
      const resets = wrapper.findAll('[data-testid="map-raid-plan-row-color-reset"]');
      expect(resets).toHaveLength(1);
      await resets[0]!.trigger('click');
      expect(mockPreferencesStore.clearMapTaskColors).toHaveBeenCalledWith(['task-b']);
      await wrapper.find('[data-testid="map-raid-plan-reset-colors"]').trigger('click');
      expect(mockPreferencesStore.clearMapTaskColors).toHaveBeenLastCalledWith(['task-b']);
    });
  });
});
