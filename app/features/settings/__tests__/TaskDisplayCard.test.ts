import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskDisplayCard from '@/features/settings/TaskDisplayCard.vue';
const { mockState, setters } = vi.hoisted(() => ({
  mockState: {
    taskCollapseDefault: false,
    hideTaskRewards: false,
  },
  setters: {
    setTaskCollapseDefault: vi.fn(),
    setHideTaskRewards: vi.fn(),
  },
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    get getShowRequiredLabels() {
      return true;
    },
    get getShowExperienceRewards() {
      return true;
    },
    get getShowNextQuests() {
      return true;
    },
    get getShowPreviousQuests() {
      return true;
    },
    get getTasksRequireTraderLevels() {
      return true;
    },
    get getTaskCollapseDefault() {
      return mockState.taskCollapseDefault;
    },
    get getHideTaskRewards() {
      return mockState.hideTaskRewards;
    },
    get getTaskPrimaryView() {
      return 'all';
    },
    get getHideoutPrimaryView() {
      return 'available';
    },
    setTaskCollapseDefault: setters.setTaskCollapseDefault,
    setHideTaskRewards: setters.setHideTaskRewards,
    setShowRequiredLabels: vi.fn(),
    setShowExperienceRewards: vi.fn(),
    setShowNextQuests: vi.fn(),
    setShowPreviousQuests: vi.fn(),
    setTasksRequireTraderLevels: vi.fn(),
    setTaskPrimaryView: vi.fn(),
    setHideoutPrimaryView: vi.fn(),
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const UCheckboxStub = {
  template:
    '<button type="button" role="checkbox" :aria-label="label" :aria-checked="modelValue" @click="$emit(\'update:modelValue\', !modelValue)" />',
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
};
const createWrapper = () =>
  mount(TaskDisplayCard, {
    global: {
      stubs: {
        GenericCard: { template: '<div><slot name="content" /></div>' },
        USeparator: true,
        UCheckbox: UCheckboxStub,
        SelectMenuFixed: true,
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
describe('TaskDisplayCard compact options', () => {
  beforeEach(() => {
    mockState.taskCollapseDefault = false;
    mockState.hideTaskRewards = false;
    vi.clearAllMocks();
  });
  it('removes the density selector while keeping default views', () => {
    const wrapper = createWrapper();
    expect(wrapper.text()).not.toContain('settings.interface.tasks.density');
    expect(wrapper.findAll('select-menu-fixed-stub')).toHaveLength(2);
  });
  it('always shows collapse and reward controls and persists toggles', async () => {
    const wrapper = createWrapper();
    const collapseToggle = wrapper.find(
      '[aria-label="settings.interface.tasks.collapse_by_default"]'
    );
    const rewardsToggle = wrapper.find('[aria-label="settings.interface.tasks.hide_rewards"]');
    expect(collapseToggle.exists()).toBe(true);
    expect(rewardsToggle.exists()).toBe(true);
    await collapseToggle.trigger('click');
    expect(setters.setTaskCollapseDefault).toHaveBeenCalledWith(true);
    await rewardsToggle.trigger('click');
    expect(setters.setHideTaskRewards).toHaveBeenCalledWith(true);
  });
});
