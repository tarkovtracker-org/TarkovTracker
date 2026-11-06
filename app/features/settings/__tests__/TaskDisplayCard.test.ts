import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import TaskDisplayCard from '@/features/settings/TaskDisplayCard.vue';
import type { PreferenceSettingGroup } from '@/types/filters';
const { mockState, setters } = vi.hoisted(() => ({
  mockState: {
    requireTraderLevels: true,
  },
  setters: {
    setTasksRequireTraderLevels: vi.fn(),
    setHideoutPrimaryView: vi.fn(),
  },
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    get getTasksRequireTraderLevels() {
      return mockState.requireTraderLevels;
    },
    get getHideoutPrimaryView() {
      return 'available';
    },
    setTasksRequireTraderLevels: setters.setTasksRequireTraderLevels,
    setHideoutPrimaryView: setters.setHideoutPrimaryView,
  }),
}));
vi.mock('@/features/tasks/composables/useTaskDisplaySettings', () => ({
  useTaskDisplaySettings: () => ({
    groups: computed(() => [
      { key: 'cards', title: 'cards', settings: [] },
      { key: 'status_tabs', title: 'status_tabs', settings: [] },
      { key: 'behavior', title: 'behavior', settings: [] },
    ]),
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const PreferenceSettingGroupsStub = {
  name: 'PreferenceSettingGroups',
  template: '<div data-testid="preference-groups" />',
  props: ['groups', 'testIdPrefix'],
};
const createWrapper = () =>
  mount(TaskDisplayCard, {
    global: {
      stubs: {
        GenericCard: { template: '<div><slot name="content" /></div>' },
        PreferenceSettingGroups: PreferenceSettingGroupsStub,
        SelectMenuFixed: true,
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
const renderedGroups = (wrapper: ReturnType<typeof createWrapper>) =>
  wrapper.findComponent(PreferenceSettingGroupsStub).props('groups') as PreferenceSettingGroup[];
describe('TaskDisplayCard', () => {
  beforeEach(() => {
    mockState.requireTraderLevels = true;
    vi.clearAllMocks();
  });
  it('renders the shared task display groups followed by task availability', () => {
    const groups = renderedGroups(createWrapper());
    expect(groups.map((group) => group.key)).toEqual([
      'cards',
      'status_tabs',
      'behavior',
      'availability',
    ]);
  });
  it('persists the trader level availability toggle', () => {
    const availability = renderedGroups(createWrapper()).find(
      (group) => group.key === 'availability'
    );
    const setting = availability?.settings[0];
    expect(setting?.get()).toBe(true);
    setting?.set(false);
    expect(setters.setTasksRequireTraderLevels).toHaveBeenCalledWith(false);
  });
  it('keeps the hideout default view selector', () => {
    const wrapper = createWrapper();
    expect(wrapper.findAll('select-menu-fixed-stub')).toHaveLength(1);
    expect(wrapper.text()).toContain('common.hideout');
  });
});
