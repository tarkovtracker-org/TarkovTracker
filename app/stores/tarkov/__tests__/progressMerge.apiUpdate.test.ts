import { describe, expect, it } from 'vitest';
import { mergeProgressData } from '@/stores/tarkov/progressMerge';
import type { UserProgressData } from '@/stores/progressState';
const tasks = Array.from({ length: 25 }, (_, index) => ({
  id: `task-${index}`,
  state: 'completed' as const,
}));
describe('mergeProgressData API update history', () => {
  it('caps merged entries and keeps the recorded total', () => {
    const merged = mergeProgressData(
      {
        apiUpdateHistory: [{ at: 2, id: 'local', source: 'api', tasks }],
      } as UserProgressData,
      {
        apiUpdateHistory: [
          { at: 1, id: 'remote', source: 'api', taskCount: 40, tasks: tasks.slice(0, 20) },
        ],
      } as UserProgressData
    );
    expect(merged.apiUpdateHistory).toEqual([
      { at: 2, id: 'local', source: 'api', tasks: tasks.slice(0, 20), taskCount: 25 },
      { at: 1, id: 'remote', source: 'api', tasks: tasks.slice(0, 20), taskCount: 40 },
    ]);
  });
  it('keeps the largest taskCount when both sides hold the same entry', () => {
    const capped = { at: 5, id: 'entry', source: 'api' as const, tasks: tasks.slice(0, 20) };
    const merged = mergeProgressData(
      {
        lastApiUpdate: { ...capped, taskCount: 30 },
        apiUpdateHistory: [{ ...capped, taskCount: 30 }],
      } as UserProgressData,
      { lastApiUpdate: capped, apiUpdateHistory: [capped] } as UserProgressData
    );
    expect(merged.lastApiUpdate).toEqual({ ...capped, taskCount: 30 });
    expect(merged.apiUpdateHistory).toEqual([{ ...capped, taskCount: 30 }]);
  });
  it('prefers the newer entry over a larger taskCount', () => {
    const merged = mergeProgressData(
      {
        lastApiUpdate: { at: 1, id: 'entry', source: 'api', taskCount: 30, tasks },
      } as UserProgressData,
      {
        lastApiUpdate: { at: 2, id: 'entry', source: 'api', tasks: tasks.slice(0, 2) },
      } as UserProgressData
    );
    expect(merged.lastApiUpdate).toEqual({
      at: 2,
      id: 'entry',
      source: 'api',
      tasks: tasks.slice(0, 2),
    });
  });
});
