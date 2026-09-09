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
      isOurFaction: true,
      traderRequirements: [],
      locationTooltip: 'Any map',
      isFailed: false,
      isInvalid: false,
      showRequiredLabels: false,
      progressCompleted: 0,
      progressTotal: 0,
      ...props,
    },
    global: {
      stubs: {
        AppTooltip: { template: '<div><slot /></div>' },
        UBadge: { template: '<span><slot /></span>' },
        UButton: true,
        UIcon: true,
      },
    },
  });
describe('TaskCardBadges', () => {
  it('renders failed and blocked labels from the common namespace', () => {
    expect(mountBadges({ isFailed: true }).text()).toContain('common.failed');
    expect(mountBadges({ isInvalid: true }).text()).toContain('common.blocked');
  });
});
it.each(['level', 'reputation'] as const)(
  'renders the %s requirement details',
  (requirementType) => {
    const wrapper = mountBadges({
      traderRequirements: [
        {
          id: 'prapor-requirement',
          trader: { id: 'prapor', name: 'Prapor' },
          requirementType,
          compareMethod: '>=',
          value: 2,
          met: false,
        },
      ],
    });
    expect(wrapper.text()).toContain('page.tasks.questcard.trader_requirement_badge');
    expect(wrapper.text()).toContain('"trader":"Prapor"');
    expect(wrapper.text()).toContain('"value":2');
    expect(wrapper.text()).toContain(requirementType === 'level' ? 'loyalty_level' : 'reputation');
    wrapper.unmount();
  }
);
