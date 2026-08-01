import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ProfileTasksTab from '@/features/profile/ProfileTasksTab.vue';
import type { Task } from '@/types/tarkov';
const messages: Record<string, string> = {
  'common.available': 'Available',
  'common.completed': 'Completed',
  'common.locked': 'Locked',
};
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => messages[key] ?? key }),
}));
const tasks: Task[] = [
  { id: 'available', name: 'Alpha' },
  { id: 'locked', name: 'Beta' },
  { id: 'completed', name: 'Gamma' },
];
describe('ProfileTasksTab', () => {
  it('renders title-cased common section labels', () => {
    const wrapper = mount(ProfileTasksTab, {
      props: {
        countedTasks: tasks,
        isTaskSuccessful: (id: string) => id === 'completed',
        isTaskFailed: () => false,
        isTaskLocked: (id: string) => id === 'locked',
        objectiveCompletions: {},
      },
      global: {
        stubs: {
          UAlert: true,
          UBadge: { template: '<span><slot /></span>' },
          UIcon: true,
        },
      },
    });
    expect(wrapper.text()).toContain('Available');
    expect(wrapper.text()).toContain('Locked');
    expect(wrapper.text()).toContain('Completed');
    expect(wrapper.text()).not.toContain('common.completed');
  });
});
