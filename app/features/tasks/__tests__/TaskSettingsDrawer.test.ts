import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import TaskSettingsDrawer from '@/features/tasks/TaskSettingsDrawer.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const failedTasksCount = ref(0);
const repaired = vi.fn();
// Keeps the composable's contract: repair only runs once the drawer's confirm dialog says yes.
vi.mock('@/composables/useTaskRepair', () => ({
  useTaskRepair: ({ requestRepairConfirm }: { requestRepairConfirm: () => Promise<boolean> }) => ({
    failedTasksCount,
    repairFailedTasks: async () => {
      if (await requestRepairConfirm()) repaired();
    },
  }),
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
        UModal: {
          props: ['open'],
          emits: ['close'],
          template: '<div v-if="open" data-testid="repair-confirm"><slot name="content" /></div>',
        },
      },
    },
  });
describe('TaskSettingsDrawer', () => {
  beforeEach(() => {
    failedTasksCount.value = 0;
    repaired.mockClear();
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
    expect(wrapper.find('[data-testid="repair-confirm"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="task-settings-repair"]')).toHaveLength(1);
  });
  it.each([
    ['repairs after confirming', 1, 1],
    ['leaves tasks alone after cancelling', 0, 0],
  ])('%s', async (_name, buttonIndex, expectedRepairs) => {
    failedTasksCount.value = 2;
    const wrapper = mountDrawer();
    await wrapper.get('[data-testid="task-settings-repair"] button').trigger('click');
    const buttons = wrapper.get('[data-testid="repair-confirm"]').findAll('button');
    await buttons[buttonIndex]!.trigger('click');
    await flushPromises();
    expect(repaired).toHaveBeenCalledTimes(expectedRepairs);
    expect(wrapper.find('[data-testid="repair-confirm"]').exists()).toBe(false);
  });
});
