import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import TaskSettingsDrawer from '@/features/tasks/TaskSettingsDrawer.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const failedTasksCount = ref(0);
const repairFailedTasks = vi.fn();
vi.mock('@/composables/useTaskRepair', () => ({
  useTaskRepair: () => ({ failedTasksCount, repairFailedTasks }),
}));
vi.mock('@/features/tasks/composables/useTaskDisplaySettings', () => ({
  useTaskDisplaySettings: () => ({
    groups: ref([
      { key: 'cards', title: 'Cards', settings: [] },
      { key: 'behavior', title: 'Behavior', settings: [] },
    ]),
  }),
}));
const mountDrawer = () =>
  mount(TaskSettingsDrawer, {
    global: {
      stubs: {
        SettingsDrawer: { template: '<aside><slot /></aside>' },
        UButton: {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
        UModal: true,
      },
    },
  });
describe('TaskSettingsDrawer', () => {
  beforeEach(() => {
    failedTasksCount.value = 0;
    repairFailedTasks.mockClear();
  });
  it('points filter seekers to the Filters menu', () => {
    expect(mountDrawer().find('[data-testid="task-settings-filters-note"]').exists()).toBe(true);
  });
  it('offers failed-task repair under Behavior only when failed tasks exist', async () => {
    const wrapper = mountDrawer();
    expect(wrapper.find('[data-testid="task-settings-repair"]').exists()).toBe(false);
    failedTasksCount.value = 2;
    await wrapper.vm.$nextTick();
    const repair = wrapper.get('[data-testid="task-setting-group-behavior"]');
    await repair.get('[data-testid="task-settings-repair"] button').trigger('click');
    expect(repairFailedTasks).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('[data-testid="task-settings-repair"]')).toHaveLength(1);
  });
});
