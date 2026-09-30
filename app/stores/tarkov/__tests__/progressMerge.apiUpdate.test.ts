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
});
