import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useTaskRepair } from '@/composables/useTaskRepair';
import { MANUAL_FAIL_TASK_IDS } from '@/utils/constants';
import type { Task } from '@/types/tarkov';
const { notify, confirm, reset } = vi.hoisted(() => ({
  notify: vi.fn(),
  confirm: vi.fn(),
  reset: vi.fn(),
}));
const state = reactive({
  tasks: [] as Task[],
  completions: {} as Record<string, { complete?: boolean; failed?: boolean; manual?: boolean }>,
});
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => state }));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    isTaskComplete: (id: string) => state.completions[id]?.complete === true,
    isTaskFailed: (id: string) => state.completions[id]?.failed === true,
    getCurrentProgressData: () => ({ taskCompletions: state.completions }),
    setTasksAndObjectivesUncompleted: reset,
  }),
}));
mockNuxtImport('useToast', () => () => ({ add: notify }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, name: id, ...extra });
describe('failed task repair', () => {
  beforeEach(() => {
    state.tasks = [];
    state.completions = {};
    confirm.mockReset().mockResolvedValue(true);
    reset.mockReset();
  });
  it('does not request confirmation when no tasks need repair', async () => {
    state.tasks = [task('healthy')];
    const repair = useTaskRepair({ requestRepairConfirm: confirm });
    expect(repair.failedTasksCount.value).toBe(0);
    await repair.repairFailedTasks();
    expect(confirm).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
  it('preserves manual failures and failures caused by successful prerequisite tasks', () => {
    const protectedId = MANUAL_FAIL_TASK_IDS[0]!;
    state.tasks = [
      task('manual'),
      task(protectedId),
      task('condition', {
        failConditions: [
          { id: 'failure', type: 'taskStatus', task: { id: 'source' }, status: ['Completed'] },
        ],
      }),
      task('repair'),
    ];
    state.completions = {
      manual: { failed: true, manual: true },
      [protectedId]: { failed: true },
      condition: { failed: true },
      source: { complete: true },
      repair: { failed: true },
    };
    const repair = useTaskRepair({ requestRepairConfirm: confirm });
    expect(repair.getRepairableFailedTasks().map(({ id }) => id)).toEqual(['repair']);
    state.completions.source!.failed = true;
    expect(repair.getRepairableFailedTasks().map(({ id }) => id)).toEqual(['condition', 'repair']);
  });
  it('ignores unrelated or unresolved failure conditions', () => {
    state.tasks = [
      task('repair', {
        failConditions: [
          { id: 'missing-ref', type: 'taskStatus', status: ['complete'] },
          { id: 'other-status', type: 'taskStatus', task: { id: 'source' }, status: ['active'] },
          { id: 'missing-status', type: 'taskStatus', task: { id: 'source' } },
        ],
      }),
    ];
    state.completions = { repair: { failed: true }, source: { complete: true } };
    expect(useTaskRepair({ requestRepairConfirm: confirm }).failedTasksCount.value).toBe(1);
  });
  it('resets only repairable tasks and their objectives after confirmation', async () => {
    state.tasks = [
      task('repair', { objectives: [{ id: 'objective', type: 'visit' }] }),
      task('manual'),
    ];
    state.completions = { repair: { failed: true }, manual: { failed: true, manual: true } };
    await useTaskRepair({ requestRepairConfirm: confirm }).repairFailedTasks();
    expect(reset).toHaveBeenCalledExactlyOnceWith(['repair'], ['objective']);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }));
  });
  it('makes no changes when the user cancels', async () => {
    state.tasks = [task('repair')];
    state.completions = { repair: { failed: true } };
    confirm.mockResolvedValue(false);
    await useTaskRepair({ requestRepairConfirm: confirm }).repairFailedTasks();
    expect(reset).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
  it('rechecks progress after confirmation instead of applying an obsolete repair list', async () => {
    state.tasks = [task('repair')];
    state.completions = { repair: { failed: true } };
    confirm.mockImplementation(async () => {
      state.completions.repair = { complete: true };
      return true;
    });
    await useTaskRepair({ requestRepairConfirm: confirm }).repairFailedTasks();
    expect(reset).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
  it.each(['confirmation', 'mutation'])(
    'reports a failed %s without claiming success',
    async (step) => {
      state.tasks = [task('repair')];
      state.completions = { repair: { failed: true } };
      if (step === 'confirmation') confirm.mockRejectedValue(new Error('unavailable'));
      else
        reset.mockImplementation(() => {
          throw new Error('unavailable');
        });
      await useTaskRepair({ requestRepairConfirm: confirm }).repairFailedTasks();
      expect(notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ color: 'error' }));
    }
  );
});
