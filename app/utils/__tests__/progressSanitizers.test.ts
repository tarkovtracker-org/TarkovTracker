import { describe, expect, it } from 'vitest';
import { MAX_SKILL_LEVEL } from '@/utils/constants';
import {
  hasDeprecatedTarkovDevProfileData,
  sanitizeOwnedProgressData,
  sanitizeOwnedUserState,
} from '@/utils/progressSanitizers';
describe('sanitizeOwnedProgressData', () => {
  it('drops legacy tarkov.dev payloads while preserving canonical fields', () => {
    const result = sanitizeOwnedProgressData({
      apiUpdateHistory: [{ at: 100, id: 'update-1', source: 'api' }],
      displayName: '  Test Player  ',
      level: 24,
      pmcFaction: 'USEC',
      prestigeLevel: 2,
      progressEpoch: 5,
      skillOffsets: { Endurance: 3 },
      skills: { Endurance: 10 },
      tarkovDevProfile: {
        achievements: { foo: 1 },
        importedAt: 123,
      },
      taskCompletions: {
        task: { complete: true, timestamp: 1000 },
      },
      xpOffset: 321,
    });
    expect(result).toEqual({
      apiUpdateHistory: [{ at: 100, id: 'update-1', source: 'api' }],
      displayName: 'Test Player',
      hideoutModules: {},
      hideoutParts: {},
      level: 24,
      pmcFaction: 'USEC',
      prestigeLevel: 2,
      progressEpoch: 5,
      skillOffsets: { Endurance: 3 },
      skills: { Endurance: 10 },
      storyChapters: {},
      taskCompletions: {
        task: { complete: true, timestamp: 1000 },
      },
      taskObjectives: {},
      traders: {},
      xpOffset: 321,
    });
  });
  it('clamps skill values to the allowed range', () => {
    const result = sanitizeOwnedProgressData({
      skills: { Endurance: 100, Strength: -5 },
    });
    expect(result.skills).toEqual({
      Endurance: MAX_SKILL_LEVEL,
      Strength: 0,
    });
  });
  it('returns the default sanitized state for nullish input', () => {
    const nullResult = sanitizeOwnedProgressData(null);
    const undefinedResult = sanitizeOwnedProgressData(undefined);
    expect(nullResult).toMatchObject({
      apiUpdateHistory: [],
      displayName: null,
      level: 1,
      pmcFaction: 'USEC',
      skills: {},
      taskCompletions: {},
      xpOffset: 0,
    });
    expect(undefinedResult).toMatchObject({
      apiUpdateHistory: [],
      displayName: null,
      level: 1,
      pmcFaction: 'USEC',
      skills: {},
      taskCompletions: {},
      xpOffset: 0,
    });
  });
});
describe('sanitizeOwnedUserState', () => {
  it('normalizes top-level user state and per-mode payloads', () => {
    const result = sanitizeOwnedUserState({
      currentGameMode: 'pve',
      gameEdition: '5',
      pvp: {
        level: 0,
        pmcFaction: 'BEAR',
      },
      pve: {
        displayName: ' Runner ',
        level: 15,
        pmcFaction: 'USEC',
      },
      tarkovUid: 12345,
    });
    expect(result.currentGameMode).toBe('pve');
    expect(result.gameEdition).toBe(5);
    expect(result.tarkovUid).toBe(12345);
    expect(result.pvp.level).toBe(1);
    expect(result.pvp.pmcFaction).toBe('BEAR');
    expect(result.pve.displayName).toBe('Runner');
    expect(result.pve.level).toBe(15);
  });
  it('preserves linked uid while stripping legacy tarkov.dev payloads', () => {
    const result = sanitizeOwnedUserState({
      currentGameMode: 'pvp',
      tarkovUid: 67890,
      pvp: {
        level: 20,
        pmcFaction: 'USEC',
        tarkovDevProfile: {
          aid: 12345,
          importedAt: 111,
        },
      },
      pve: {
        level: 12,
        pmcFaction: 'BEAR',
        tarkovDevProfile: {
          aid: 67890,
          importedAt: 222,
        },
      },
    });
    expect(result.tarkovUid).toBe(67890);
    expect(result.pvp).not.toHaveProperty('tarkovDevProfile');
    expect(result.pve).not.toHaveProperty('tarkovDevProfile');
  });
});
describe('hasDeprecatedTarkovDevProfileData', () => {
  it('detects deprecated tarkov.dev payloads in both legacy and per-mode shapes', () => {
    expect(
      hasDeprecatedTarkovDevProfileData({
        tarkovDevProfile: {
          aid: 12345,
        },
      })
    ).toBe(true);
    expect(
      hasDeprecatedTarkovDevProfileData({
        pvp: {
          tarkovDevProfile: {
            aid: 12345,
          },
        },
        pve: {},
      })
    ).toBe(true);
    expect(
      hasDeprecatedTarkovDevProfileData({
        pvp: {
          level: 12,
        },
        pve: {
          level: 8,
        },
      })
    ).toBe(false);
  });
});
