import { describe, expect, it } from 'vitest';
import { formatDelayDuration, resolveTaskTimeGate } from '@/features/tasks/task-time-gate';
describe('resolveTaskTimeGate', () => {
  it('returns the stated range in ascending order', () => {
    expect(
      resolveTaskTimeGate({ availableDelaySecondsMin: 1800, availableDelaySecondsMax: 2100 })
    ).toEqual({ min: 1800, max: 2100 });
    expect(
      resolveTaskTimeGate({ availableDelaySecondsMin: 2100, availableDelaySecondsMax: 1800 })
    ).toEqual({ min: 1800, max: 2100 });
  });
  it('treats a one-sided delay as fixed', () => {
    expect(resolveTaskTimeGate({ availableDelaySecondsMax: 36000 })).toEqual({
      min: 36000,
      max: 36000,
    });
    expect(resolveTaskTimeGate({ availableDelaySecondsMin: 3600 })).toEqual({
      min: 3600,
      max: 3600,
    });
  });
  it('returns null when the task has no positive finite delay', () => {
    expect(resolveTaskTimeGate({})).toBeNull();
    expect(
      resolveTaskTimeGate({ availableDelaySecondsMin: 0, availableDelaySecondsMax: 0 })
    ).toBeNull();
    expect(
      resolveTaskTimeGate({
        availableDelaySecondsMin: Number.NaN,
        availableDelaySecondsMax: Number.POSITIVE_INFINITY,
      })
    ).toBeNull();
    expect(resolveTaskTimeGate({ availableDelaySecondsMin: -60 })).toBeNull();
  });
});
describe('formatDelayDuration', () => {
  it.each([
    [36000, 'page.tasks.questcard.duration_hours', { hours: 10 }],
    [3600, 'page.tasks.questcard.duration_hours', { hours: 1 }],
    [1800, 'page.tasks.questcard.duration_minutes', { minutes: 30 }],
    [2100, 'page.tasks.questcard.duration_minutes', { minutes: 35 }],
    [5400, 'page.tasks.questcard.duration_hours_minutes', { hours: 1, minutes: 30 }],
    [89, 'page.tasks.questcard.duration_minutes', { minutes: 1 }],
    [3599, 'page.tasks.questcard.duration_hours', { hours: 1 }],
    [5, 'page.tasks.questcard.duration_seconds', { seconds: 5 }],
    [0.4, 'page.tasks.questcard.duration_seconds', { seconds: 1 }],
    [59.5, 'page.tasks.questcard.duration_minutes', { minutes: 1 }],
    [59, 'page.tasks.questcard.duration_seconds', { seconds: 59 }],
  ])('formats %d seconds', (seconds, key, params) => {
    expect(formatDelayDuration(seconds)).toEqual({ key, params });
  });
});
