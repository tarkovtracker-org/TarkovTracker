import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import { isTaskSuccessful, useTaskState } from '@/composables/useTaskState';
const progress = reactive({
  complete: {} as Record<string, boolean>,
  failed: {} as Record<string, boolean>,
  unlockedTasks: {} as Record<string, { self?: boolean }>,
  invalidTasks: {} as Record<string, { self?: boolean }>,
});
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    isTaskComplete: (id: string) => progress.complete[id] === true,
    isTaskFailed: (id: string) => progress.failed[id] === true,
  }),
}));
vi.mock('@/stores/useProgress', () => ({ useProgressStore: () => progress }));
describe('task state decisions', () => {
  beforeEach(() => {
    progress.complete = {};
    progress.failed = {};
    progress.unlockedTasks = {};
    progress.invalidTasks = {};
  });
  it.each([
    [false, false, false],
    [true, false, true],
    [true, true, false],
    [false, true, false],
  ])('distinguishes complete=%s failed=%s from successful=%s', (complete, failed, successful) => {
    progress.complete.task = complete;
    progress.failed.task = failed;
    const state = useTaskState('task');
    expect(state.isComplete.value).toBe(complete);
    expect(state.isFailed.value).toBe(failed);
    expect(state.isSuccessful.value).toBe(successful);
    expect(isTaskSuccessful('task')).toBe(successful);
  });
  it('treats missing availability conservatively and follows unlock/invalidation changes', () => {
    const state = useTaskState('task');
    expect(state.isLocked.value).toBe(true);
    expect(state.isInvalid.value).toBe(false);
    progress.unlockedTasks.task = { self: true };
    progress.invalidTasks.task = { self: true };
    expect(state.isLocked.value).toBe(false);
    expect(state.isInvalid.value).toBe(true);
    progress.complete.task = true;
    progress.unlockedTasks.task.self = false;
    expect(state.isLocked.value).toBe(false);
    expect(state.isInvalid.value).toBe(false);
  });
  it.each(['ref', 'getter'])('follows a changing task ID supplied as a %s', (input) => {
    const id = ref('first');
    progress.complete.first = true;
    progress.failed.second = true;
    const state = useTaskState(input === 'ref' ? id : () => id.value);
    expect(state.isSuccessful.value).toBe(true);
    id.value = 'second';
    expect(state.isSuccessful.value).toBe(false);
    expect(state.isFailed.value).toBe(true);
    expect(state.isLocked.value).toBe(true);
    progress.complete = { second: true };
    progress.failed = {};
    expect(state.isSuccessful.value).toBe(true);
  });
});
