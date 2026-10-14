import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import TaskFiltersPopover from '@/features/tasks/TaskFiltersPopover.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const hasSavedFilters = ref(false);
const resetAll = vi.fn();
vi.mock('@/features/tasks/composables/useTaskContentFilters', () => ({
  useTaskContentFilters: () => ({
    activeCount: computed(() => 0),
    hasSavedFilters,
    hasTeammates: computed(() => false),
    hideCompletedMapObjectives: ref(false),
    isMapsView: computed(() => false),
    isTypeLocked: () => false,
    isTypeSelected: () => true,
    onlyTasksWithRequiredKeys: ref(false),
    resetAll,
    sharedByAllOnly: ref(false),
    showGlobalTasks: ref(true),
    toggleType: vi.fn(),
  }),
}));
const mountPopover = () =>
  mount(TaskFiltersPopover, {
    global: {
      stubs: {
        UButton: {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
        USwitch: true,
        UPopover: { template: '<div><slot /><slot name="content" /></div>' },
      },
    },
  });
describe('TaskFiltersPopover', () => {
  beforeEach(() => {
    hasSavedFilters.value = false;
    resetAll.mockClear();
  });
  it('resets saved filters even when none is active in the current view', async () => {
    const wrapper = mountPopover();
    const reset = () => wrapper.get('[data-testid="task-filters-reset"]');
    expect(reset().attributes('disabled')).toBeDefined();
    hasSavedFilters.value = true;
    await wrapper.vm.$nextTick();
    expect(reset().attributes('disabled')).toBeUndefined();
    await reset().trigger('click');
    expect(resetAll).toHaveBeenCalledTimes(1);
  });
});
