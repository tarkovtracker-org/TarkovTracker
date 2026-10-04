import { describe, expect, it } from 'vitest';
import { summarizeModeProgressData } from '@/utils/modeProgress';
describe('mode progress', () => {
  it('summarizes normalized progress without exposing the blob', () => {
    expect(
      summarizeModeProgressData({
        displayName: 'Player',
        level: 42,
        taskCompletions: {
          complete: { complete: true },
          failed: { complete: true, failed: true },
          pending: { complete: false },
        },
      })
    ).toEqual({
      display_name: 'Player',
      level: 42,
      tasks_completed: 2,
    });
  });
  it('counts legacy boolean task completions', () => {
    expect(
      summarizeModeProgressData({
        displayName: 'Boolean Legacy',
        level: 12,
        taskCompletions: { a: true, b: false, c: { complete: true }, d: 'nope' },
      })
    ).toEqual({ display_name: 'Boolean Legacy', level: 12, tasks_completed: 2 });
  });
});
