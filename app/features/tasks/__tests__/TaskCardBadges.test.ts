import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskCardBadges from '@/features/tasks/TaskCardBadges.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));
const mountBadges = (props: Partial<InstanceType<typeof TaskCardBadges>['$props']> = {}) =>
  mount(TaskCardBadges, {
    props: {
      task: { id: 'task-1', name: 'Test task' },
      isPinned: false,
      isHidden: false,
      locationTooltip: 'Any map',
      isFailed: false,
      isInvalid: false,
      showRequiredLabels: false,
      progressCompleted: 0,
      progressTotal: 0,
      showProgress: true,
      ...props,
    },
    global: {
      stubs: {
        AppTooltip: { template: '<div><slot /></div>' },
        UBadge: { template: '<span><slot /></span>' },
        UButton: {
          inheritAttrs: false,
          emits: ['click'],
          template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
        },
        UIcon: true,
        TaskMapVisibilityToggles: true,
      },
    },
  });
describe('TaskCardBadges', () => {
  it('renders failed and blocked labels from the common namespace', () => {
    expect(mountBadges({ isFailed: true }).text()).toContain('common.failed');
    expect(mountBadges({ isInvalid: true }).text()).toContain('common.blocked');
  });
  it('exposes hide and copy link as inline buttons with no overflow menu', async () => {
    const wrapper = mountBadges();
    const hide = wrapper.get('[data-testid="task-card-hide"]');
    expect(hide.attributes('aria-label')).toBe('page.tasks.questcard.hide_task');
    expect(hide.attributes('aria-pressed')).toBeUndefined();
    expect(hide.attributes('icon')).toBe('i-mdi-eye-outline');
    await hide.trigger('click');
    await wrapper.get('[data-testid="task-card-copy-link"]').trigger('click');
    expect(wrapper.emitted('toggleHide')).toHaveLength(1);
    expect(wrapper.emitted('copyLink')).toHaveLength(1);
    expect(wrapper.find('[aria-label^="common.more"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('labels the hide button as unhide when the task is hidden', () => {
    const hide = mountBadges({ isHidden: true }).get('[data-testid="task-card-hide"]');
    expect(hide.attributes('aria-label')).toBe('page.tasks.questcard.unhide_task');
    expect(hide.attributes('aria-pressed')).toBeUndefined();
    expect(hide.attributes('icon')).toBe('i-mdi-eye-off-outline');
  });
  it('shows header progress only when asked to', () => {
    expect(
      mountBadges({ progressTotal: 3 }).find('[data-testid="task-card-progress"]').exists()
    ).toBe(true);
    expect(
      mountBadges({ progressTotal: 3, showProgress: false })
        .find('[data-testid="task-card-progress"]')
        .exists()
    ).toBe(false);
  });
});
it('leaves trader requirements to the requirements surface', () => {
  const wrapper = mountBadges({
    task: {
      id: 'task-1',
      name: 'Test task',
      normalizedTraderRequirements: [
        {
          id: 'prapor-requirement',
          trader: { id: 'prapor', name: 'Prapor' },
          requirementType: 'level',
          compareMethod: '>=',
          value: 2,
        },
      ],
    },
  });
  expect(wrapper.text()).not.toContain('Prapor');
  wrapper.unmount();
});
