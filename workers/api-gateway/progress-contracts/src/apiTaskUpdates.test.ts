import { describe, expect, it } from 'vitest';
import { API_UPDATE_TASK_LIMIT, capApiTaskUpdates, countApiTaskUpdates } from './apiTaskUpdates';
const updates = (length: number) =>
  Array.from({ length }, (_, index) => ({ id: `task-${index}`, state: 'completed' as const }));
describe('capApiTaskUpdates', () => {
  it('keeps short lists unchanged without a count', () => {
    expect(capApiTaskUpdates(updates(3))).toEqual({ tasks: updates(3) });
  });
  it('keeps the first entries in order and records the total when truncating', () => {
    expect(capApiTaskUpdates(updates(30))).toEqual({
      tasks: updates(API_UPDATE_TASK_LIMIT),
      taskCount: 30,
    });
  });
  it('is idempotent and keeps a larger stored count', () => {
    const capped = capApiTaskUpdates(updates(30));
    expect(capApiTaskUpdates(capped.tasks, capped.taskCount)).toEqual(capped);
    expect(capApiTaskUpdates(updates(2), 50.9)).toEqual({ tasks: updates(2), taskCount: 50 });
  });
  it('drops invalid entries, extra fields, and counts that do not exceed the stored list', () => {
    expect(
      capApiTaskUpdates(
        [
          { id: 'a', state: 'active', extra: true },
          { id: '', state: 'completed' },
          { id: 'b', state: 'pending' },
          'bad',
        ],
        1
      )
    ).toEqual({ tasks: [{ id: 'a', state: 'active' }] });
    expect(capApiTaskUpdates('bad', Number.NaN)).toEqual({ tasks: [] });
    expect(capApiTaskUpdates([], 1e12)).toEqual({ tasks: [], taskCount: 1_000_000 });
  });
});
describe('countApiTaskUpdates', () => {
  it('prefers the recorded total when present', () => {
    expect(countApiTaskUpdates({ tasks: updates(20), taskCount: 45 })).toBe(45);
    expect(countApiTaskUpdates({ tasks: updates(4) })).toBe(4);
    expect(countApiTaskUpdates({})).toBe(0);
  });
});
