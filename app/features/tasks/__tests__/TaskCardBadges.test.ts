import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskCardBadges from '@/features/tasks/TaskCardBadges.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const mountBadges = (props: Partial<InstanceType<typeof TaskCardBadges>['$props']> = {}) =>
  mount(TaskCardBadges, {
    props: {
      task: { id: 'task-1', name: 'Test task' },
      isPinned: false,
      isOurFaction: true,
      fenceRepRequirement: null,
      meetsFenceRepRequirement: true,
      traderLevelReqs: [],
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
