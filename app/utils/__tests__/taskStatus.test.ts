import { describe, it, expect } from 'vitest';
import {
  getCompletionFlags,
  isTaskComplete,
  isTaskFailed,
  isTaskActive,
  getTaskStatusFromFlags,
  isTaskRelevant,
  isTaskCounted,
} from '@/utils/taskStatus';
import type { GameEdition, Task } from '@/types/tarkov';
describe('taskStatus', () => {
  describe('getCompletionFlags', () => {
    it('handles boolean true -> {complete: true, failed: false}', () => {
      expect(getCompletionFlags(true)).toEqual({ complete: true, failed: false });
    });
    it('handles boolean false -> {complete: false, failed: false}', () => {
      expect(getCompletionFlags(false)).toEqual({ complete: false, failed: false });
    });
    it('handles object {complete: true} -> {complete: true, failed: false}', () => {
      expect(getCompletionFlags({ complete: true })).toEqual({ complete: true, failed: false });
    });
    it('handles object {failed: true} -> {complete: false, failed: true}', () => {
      expect(getCompletionFlags({ failed: true })).toEqual({ complete: false, failed: true });
    });
    it('handles object {complete: true, failed: true} -> {complete: true, failed: true}', () => {
      expect(getCompletionFlags({ complete: true, failed: true })).toEqual({
        complete: true,
        failed: true,
      });
    });
    it('handles null -> {complete: false, failed: false}', () => {
      expect(getCompletionFlags(null)).toEqual({ complete: false, failed: false });
    });
    it('handles undefined -> {complete: false, failed: false}', () => {
      expect(getCompletionFlags(undefined)).toEqual({ complete: false, failed: false });
    });
  });
  describe('isTaskComplete', () => {
    it('returns true only when complete && !failed', () => {
      expect(isTaskComplete({ complete: true })).toBe(true);
      expect(isTaskComplete(true)).toBe(true);
    });
    it('returns false when complete && failed', () => {
      expect(isTaskComplete({ complete: true, failed: true })).toBe(false);
    });
    it('returns false when not complete', () => {
      expect(isTaskComplete({ complete: false })).toBe(false);
      expect(isTaskComplete(false)).toBe(false);
      expect(isTaskComplete(null)).toBe(false);
      expect(isTaskComplete(undefined)).toBe(false);
    });
  });
  describe('isTaskFailed', () => {
    it('returns true when failed', () => {
      expect(isTaskFailed({ failed: true })).toBe(true);
      expect(isTaskFailed({ complete: false, failed: true })).toBe(true);
      expect(isTaskFailed({ complete: true, failed: true })).toBe(true);
    });
    it('returns false when not failed', () => {
      expect(isTaskFailed({ failed: false })).toBe(false);
      expect(isTaskFailed({ complete: true })).toBe(false);
      expect(isTaskFailed(true)).toBe(false);
      expect(isTaskFailed(false)).toBe(false);
      expect(isTaskFailed(null)).toBe(false);
      expect(isTaskFailed(undefined)).toBe(false);
    });
  });
  describe('isTaskActive', () => {
    it('returns false for null/undefined', () => {
      expect(isTaskActive(null)).toBe(false);
      expect(isTaskActive(undefined)).toBe(false);
    });
    it('returns false for completed tasks', () => {
      expect(isTaskActive({ complete: true })).toBe(false);
      expect(isTaskActive(true)).toBe(false);
    });
    it('returns false for failed tasks', () => {
      expect(isTaskActive({ failed: true })).toBe(false);
    });
    it('returns true for active tasks (started but not completed/failed)', () => {
      expect(isTaskActive({ complete: false, failed: false })).toBe(true);
    });
    it('returns false for boolean false (treated as no completion record)', () => {
      expect(isTaskActive(false)).toBe(false);
    });
  });
  describe('getTaskStatusFromFlags', () => {
    it('returns "completed" when complete && !failed', () => {
      expect(getTaskStatusFromFlags({ complete: true })).toBe('completed');
      expect(getTaskStatusFromFlags(true)).toBe('completed');
    });
    it('returns "failed" when failed (regardless of complete)', () => {
      expect(getTaskStatusFromFlags({ failed: true })).toBe('failed');
      expect(getTaskStatusFromFlags({ complete: true, failed: true })).toBe('failed');
    });
    it('returns "incomplete" otherwise', () => {
      expect(getTaskStatusFromFlags({ complete: false })).toBe('incomplete');
      expect(getTaskStatusFromFlags(false)).toBe('incomplete');
      expect(getTaskStatusFromFlags(null)).toBe('incomplete');
      expect(getTaskStatusFromFlags(undefined)).toBe('incomplete');
    });
  });
  describe('isTaskCounted', () => {
    it('returns true for completed tasks that did not fail', () => {
      expect(isTaskCounted({ complete: true }, false)).toBe(true);
      expect(isTaskCounted(true, false)).toBe(true);
    });
    it('returns false for failed tasks', () => {
      expect(isTaskCounted({ failed: true }, false)).toBe(false);
      expect(isTaskCounted({ complete: true, failed: true }, false)).toBe(false);
    });
    it('returns false for invalid incomplete tasks', () => {
      expect(isTaskCounted({ complete: false }, true)).toBe(false);
      expect(isTaskCounted(undefined, true)).toBe(false);
    });
    it('returns true for valid incomplete tasks', () => {
      expect(isTaskCounted({ complete: false }, false)).toBe(true);
      expect(isTaskCounted(undefined, false)).toBe(true);
    });
  });
  describe('isTaskRelevant', () => {
    const mockEditions = [
      {
        id: 'standard',
        value: 1,
        excludedTaskIds: ['task-excluded-standard'],
        exclusiveTaskIds: [],
      },
      { id: 'eod', value: 2, excludedTaskIds: [], exclusiveTaskIds: ['task-exclusive-eod'] },
    ] as unknown as GameEdition[];
    it('returns true if faction is Any and edition is compatible', () => {
      const task = { id: 'task-1', factionName: 'Any' } as unknown as Task;
      expect(
        isTaskRelevant(task, {
          faction: 'Usec',
          gameEditionValue: 1,
          editions: mockEditions,
        })
      ).toBe(true);
    });
    it('returns false if faction does not match', () => {
      const task = { id: 'task-1', factionName: 'Bear' } as unknown as Task;
      expect(
        isTaskRelevant(task, {
          faction: 'Usec',
          gameEditionValue: 1,
          editions: mockEditions,
        })
      ).toBe(false);
    });
    it('returns true if faction matches Usec', () => {
      const task = { id: 'task-1', factionName: 'Usec' } as unknown as Task;
      expect(
        isTaskRelevant(task, {
          faction: 'Usec',
          gameEditionValue: 1,
          editions: mockEditions,
        })
      ).toBe(true);
    });
    it('returns false if task is excluded from edition', () => {
      const task = { id: 'task-excluded-standard', factionName: 'Any' } as unknown as Task;
      expect(
        isTaskRelevant(task, {
          faction: 'Usec',
          gameEditionValue: 1,
          editions: mockEditions,
        })
      ).toBe(false);
    });
    it('returns false if task is exclusive to another edition', () => {
      const task = { id: 'task-exclusive-eod', factionName: 'Any' } as unknown as Task;
      expect(
        isTaskRelevant(task, {
          faction: 'Usec',
          gameEditionValue: 1,
          editions: mockEditions,
        })
      ).toBe(false);
    });
    it('returns false if prestige level does not match', () => {
      const task = { id: 'task-prestige-1', factionName: 'Any' } as unknown as Task;
      const prestigeTaskMap = new Map([['task-prestige-1', 2]]);
      expect(
        isTaskRelevant(task, {
          faction: 'Usec',
          gameEditionValue: 1,
          editions: mockEditions,
          prestigeLevel: 1,
          prestigeTaskMap,
        })
      ).toBe(false);
    });
    it('returns true if prestige level matches', () => {
      const task = { id: 'task-prestige-1', factionName: 'Any' } as unknown as Task;
      const prestigeTaskMap = new Map([['task-prestige-1', 2]]);
      expect(
        isTaskRelevant(task, {
          faction: 'Usec',
          gameEditionValue: 1,
          editions: mockEditions,
          prestigeLevel: 2,
          prestigeTaskMap,
        })
      ).toBe(true);
    });
  });
});
