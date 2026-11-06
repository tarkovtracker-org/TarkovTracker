import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskCardActions from '@/features/tasks/TaskCardActions.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const mountActions = (props: Partial<InstanceType<typeof TaskCardActions>['$props']> = {}) =>
  mount(TaskCardActions, {
    props: { state: 'available', size: 'xs', ...props },
    global: {
      stubs: {
        UButton: {
          inheritAttrs: false,
          emits: ['click'],
          template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
        },
      },
    },
  });
describe('TaskCardActions', () => {
  it('hides the inline fail action unless it is enabled', () => {
    expect(mountActions().find('[data-testid="task-card-fail"]').exists()).toBe(false);
  });
  it('emits markFailed from the inline fail action', async () => {
    const wrapper = mountActions({ showFail: true });
    await wrapper.get('[data-testid="task-card-fail"]').trigger('click');
    expect(wrapper.emitted('markFailed')).toHaveLength(1);
  });
  it('keeps the fail action when no other action applies', () => {
    const wrapper = mountActions({ state: 'none', showFail: true });
    expect(wrapper.find('[data-testid="task-card-fail"]').exists()).toBe(true);
  });
  it('leaves hot-wheels tasks with their own fail button only', () => {
    const wrapper = mountActions({ state: 'hotwheels', showFail: true });
    expect(wrapper.find('[data-testid="task-card-fail"]').exists()).toBe(false);
    expect(wrapper.findAll('button')).toHaveLength(2);
  });
});
