import { describe, expect, it } from 'vitest';
import { ACTIVE_SEASON, getActiveSeasonTimeRemaining } from '@/utils/constants';
describe('active season metadata', () => {
  it('tracks the announced Season 1 boundaries', () => {
    expect(ACTIVE_SEASON).toEqual({
      number: 1,
      startsOn: '2026-08-03',
      endsAt: '2026-12-07T10:00:00.000Z',
    });
  });
  it('calculates the published countdown example', () => {
    expect(getActiveSeasonTimeRemaining(Date.parse('2026-08-05T13:44:00.000Z'))).toEqual({
      days: 123,
      hours: 20,
      minutes: 16,
      expired: false,
    });
  });
  it('marks the season expired at its exact end timestamp', () => {
    expect(getActiveSeasonTimeRemaining(Date.parse(ACTIVE_SEASON.endsAt))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      expired: true,
    });
  });
});
