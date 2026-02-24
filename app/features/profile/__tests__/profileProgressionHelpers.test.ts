import { describe, expect, it } from 'vitest';
import {
  countDaysInclusive,
  normalizeMode,
  normalizeSharedProgressData,
  normalizeTimestamp,
  normalizeUserId,
} from '@/features/profile/profileProgressionHelpers';
import { GAME_MODES } from '@/utils/constants';
import type { UserProgressData } from '@/stores/progressState';
const defaultProgressData: UserProgressData = {
  displayName: null,
  hideoutModules: {},
  hideoutParts: {},
  level: 1,
  pmcFaction: 'USEC',
  prestigeLevel: 0,
  skillOffsets: {},
  skills: {},
  storyChapters: {},
  taskCompletions: {},
  taskObjectives: {},
  traders: {},
  xpOffset: 0,
};
describe('profileProgressionHelpers', () => {
  it('normalizes mode and user id values from route input', () => {
    expect(normalizeMode([GAME_MODES.PVE])).toBe(GAME_MODES.PVE);
    expect(normalizeMode('invalid')).toBeNull();
    expect(normalizeUserId(' 3fa85f64-5717-4562-b3fc-2c963f66afa6 ')).toBe(
      '3fa85f64-5717-4562-b3fc-2c963f66afa6'
    );
    expect(normalizeUserId('invalid')).toBeNull();
  });
  it('normalizes timestamps and inclusive day counts', () => {
    expect(normalizeTimestamp(1_700_000_000)).toBe(1_700_000_000_000);
    expect(normalizeTimestamp(1_700_000_000_999)).toBe(1_700_000_000_999);
    expect(normalizeTimestamp(undefined)).toBeNull();
    expect(countDaysInclusive(1000, 1000)).toBe(1);
    expect(countDaysInclusive(0, 172_800_000)).toBe(2);
  });
  it('normalizes shared progress payloads using fallback defaults', () => {
    const normalized = normalizeSharedProgressData(
      {
        displayName: 'Test User',
        level: 18,
        pmcFaction: 'BEAR',
        taskCompletions: { a: { complete: true } },
      },
      defaultProgressData
    );
    expect(normalized.displayName).toBe('Test User');
    expect(normalized.level).toBe(18);
    expect(normalized.pmcFaction).toBe('BEAR');
    expect(normalized.taskCompletions).toEqual({ a: { complete: true } });
    expect(normalized.hideoutModules).toEqual({});
  });
});
