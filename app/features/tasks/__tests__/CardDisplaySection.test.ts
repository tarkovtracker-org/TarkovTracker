import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import CardDisplaySection from '@/features/tasks/CardDisplaySection.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const UCheckboxStub = {
  template:
    '<button type="button" role="checkbox" :id="id" :aria-checked="modelValue" @click="$emit(\'update:modelValue\', !modelValue)" />',
  props: ['modelValue', 'id'],
  emits: ['update:modelValue'],
};
const defaultProps = {
  showRequiredLabels: true,
  showExperienceRewards: true,
  showNextQuests: true,
  showPreviousQuests: true,
  hideCompletedTaskObjectives: true,
  taskCollapseDefault: false,
  hideTaskRewards: false,
  isCompact: false,
};
const createWrapper = (props: Partial<typeof defaultProps> = {}) =>
  mount(CardDisplaySection, {
    props: { ...defaultProps, ...props },
    global: {
      stubs: {
        UCheckbox: UCheckboxStub,
        UIcon: true,
      },
    },
  });
describe('CardDisplaySection', () => {
  it('hides compact-only options when density is comfortable', () => {
    const wrapper = createWrapper();
    expect(wrapper.find('#task-settings-collapse-default').exists()).toBe(false);
    expect(wrapper.find('#task-settings-hide-rewards').exists()).toBe(false);
  });
  it('shows compact-only options when density is compact', () => {
    const wrapper = createWrapper({ isCompact: true });
    expect(wrapper.find('#task-settings-collapse-default').exists()).toBe(true);
    expect(wrapper.find('#task-settings-hide-rewards').exists()).toBe(true);
    expect(wrapper.text()).toContain('page.tasks.settings.appearance.collapse_by_default');
    expect(wrapper.text()).toContain('page.tasks.settings.appearance.hide_rewards');
  });
  it('associates compact option labels with their checkboxes', () => {
    const wrapper = createWrapper({ isCompact: true });
    const collapseLabel = wrapper.find('label[for="task-settings-collapse-default"]');
    const rewardsLabel = wrapper.find('label[for="task-settings-hide-rewards"]');
    expect(collapseLabel.exists()).toBe(true);
    expect(rewardsLabel.exists()).toBe(true);
  });
  it('emits updates when compact options are toggled', async () => {
    const wrapper = createWrapper({ isCompact: true });
    await wrapper.find('#task-settings-collapse-default').trigger('click');
    expect(wrapper.emitted('update:taskCollapseDefault')).toEqual([[true]]);
    await wrapper.find('#task-settings-hide-rewards').trigger('click');
    expect(wrapper.emitted('update:hideTaskRewards')).toEqual([[true]]);
  });
  it('emits updates for the standard appearance toggles', async () => {
    const wrapper = createWrapper();
    const checkboxes = wrapper.findAll('[role="checkbox"]');
    await checkboxes[0]!.trigger('click');
    expect(wrapper.emitted('update:showRequiredLabels')).toEqual([[false]]);
  });
});
