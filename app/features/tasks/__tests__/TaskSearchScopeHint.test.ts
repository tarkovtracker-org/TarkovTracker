import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskSearchScopeHint from '@/features/tasks/TaskSearchScopeHint.vue';
import type { TaskSecondaryView } from '@/types/taskFilter';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));
const mountHint = (pinnedStatus: TaskSecondaryView | null, returnStatus: TaskSecondaryView) =>
  mount(TaskSearchScopeHint, {
    props: { pinnedStatus, query: 'mole', returnStatus, visible: true },
    global: {
      stubs: {
        UButton: {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
      },
    },
  });
describe('TaskSearchScopeHint', () => {
  it('names the tab clearing returns to while searching all statuses', async () => {
    const wrapper = mountHint(null, 'available');
    expect(wrapper.text()).toContain('page.tasks.search_scope.all_statuses:{"query":"mole"}');
    expect(wrapper.find('button').text()).toBe(
      'page.tasks.search_scope.clear_and_return:{"status":"common.available"}'
    );
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });
  it('names the picked tab and returns to the saved one', () => {
    const wrapper = mountHint('locked', 'available');
    expect(wrapper.text()).toContain(
      'page.tasks.search_scope.pinned_status:{"query":"mole","status":"common.locked"}'
    );
    expect(wrapper.find('button').text()).toBe(
      'page.tasks.search_scope.clear_and_return:{"status":"common.available"}'
    );
  });
  it('uses a plain clear label when the shown tab is already the saved one', () => {
    expect(mountHint('available', 'available').find('button').text()).toBe('common.clear_search');
    expect(mountHint(null, 'all').find('button').text()).toBe('common.clear_search');
  });
});
