import { describe, expect, it } from 'vitest';
import { ACTIVE_SEASON_NUMBER, MAX_SKILL_LEVEL } from '@/utils/constants';
import {
  hasDeprecatedTarkovDevProfileData,
  MANUAL_ACTIVITY_HISTORY_LIMIT,
  sanitizeManualActivityHistory,
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
      manualActivityHistory: [],
      manualActivityEpoch: 0,
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
  it('preserves millisecond apiUpdate timestamps without int32 clamping', () => {
    const millisecondAt = 1780660259335;
    const result = sanitizeOwnedProgressData({
      apiUpdateHistory: [{ at: millisecondAt, id: 'sync-1', source: 'api' }],
      lastApiUpdate: { at: millisecondAt, id: 'sync-1', source: 'api' },
    });
    expect(result.apiUpdateHistory).toEqual([{ at: millisecondAt, id: 'sync-1', source: 'api' }]);
    expect(result.lastApiUpdate).toEqual({ at: millisecondAt, id: 'sync-1', source: 'api' });
  });
  it('returns the default sanitized state for nullish input', () => {
    const nullResult = sanitizeOwnedProgressData(null);
    const undefinedResult = sanitizeOwnedProgressData(undefined);
    expect(nullResult).toMatchObject({
      apiUpdateHistory: [],
      displayName: null,
      level: 1,
      manualActivityHistory: [],
      manualActivityEpoch: 0,
      pmcFaction: 'USEC',
      skills: {},
      taskCompletions: {},
      xpOffset: 0,
    });
    expect(undefinedResult).toMatchObject({
      apiUpdateHistory: [],
      displayName: null,
      level: 1,
      manualActivityHistory: [],
      manualActivityEpoch: 0,
      pmcFaction: 'USEC',
      skills: {},
      taskCompletions: {},
      xpOffset: 0,
    });
  });
  it('preserves valid manual activity history entries', () => {
    const result = sanitizeOwnedProgressData({
      manualActivityHistory: [
        {
          action: 'complete',
          details: 'PvP',
          id: 'manual-1',
          timestamp: 1780660259335,
          title: 'Completed Task: Debut',
          type: 'task',
        },
      ],
    });
    expect(result.manualActivityHistory).toEqual([
      {
        action: 'complete',
        details: 'PvP',
        id: 'manual-1',
        timestamp: 1780660259335,
        title: 'Completed Task: Debut',
        type: 'task',
      },
    ]);
  });
  it('normalizes a non-array manual activity history to an empty array', () => {
    expect(
      sanitizeOwnedProgressData({ manualActivityHistory: 'nope' }).manualActivityHistory
    ).toEqual([]);
  });
});
describe('sanitizeManualActivityHistory', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({
    action: 'complete',
    id: 'manual-1',
    timestamp: 1000,
    title: 'Completed Task: Debut',
    type: 'task',
    ...overrides,
  });
  it('drops entries missing a required field or carrying an unknown enum value', () => {
    expect(
      sanitizeManualActivityHistory([
        entry({ id: '   ' }),
        entry({ id: 'no-title', title: '  ' }),
        entry({ id: 'bad-type', type: 'quest' }),
        entry({ id: 'bad-action', action: 'deleted' }),
        entry({ id: 'no-timestamp', timestamp: 'later' }),
        entry({ id: 'infinite', timestamp: Number.POSITIVE_INFINITY }),
        'nonsense',
        null,
        undefined,
      ])
    ).toEqual([]);
  });
  it('collapses duplicate ids to the newest entry and sorts newest first', () => {
    expect(
      sanitizeManualActivityHistory([
        entry({ id: 'dup', timestamp: 100, title: 'Older' }),
        entry({ id: 'dup', timestamp: 900, title: 'Newer' }),
        entry({ id: 'other', timestamp: 500, title: 'Middle' }),
      ])
    ).toEqual([
      entry({ id: 'dup', timestamp: 900, title: 'Newer' }),
      entry({ id: 'other', timestamp: 500, title: 'Middle' }),
    ]);
  });
  it('caps the history at the shared limit, retaining the newest entries', () => {
    const result = sanitizeManualActivityHistory(
      Array.from({ length: MANUAL_ACTIVITY_HISTORY_LIMIT + 20 }, (_unused, index) =>
        entry({ id: `manual-${index}`, timestamp: 1000 + index })
      )
    );
    expect(result).toHaveLength(MANUAL_ACTIVITY_HISTORY_LIMIT);
    expect(result[0]?.id).toBe(`manual-${MANUAL_ACTIVITY_HISTORY_LIMIT + 19}`);
  });
  it('clamps oversized strings and normalizes negative timestamps', () => {
    const [result] = sanitizeManualActivityHistory([
      entry({
        details: 'd'.repeat(600),
        id: 'i'.repeat(200),
        timestamp: -50,
        title: 't'.repeat(400),
      }),
    ]);
    expect(result?.id).toHaveLength(128);
    expect(result?.title).toHaveLength(200);
    expect(result?.details).toHaveLength(300);
    expect(result?.timestamp).toBe(0);
  });
  it('clamps oversized strings by code point so no surrogate pair is split', () => {
    const unpairedSurrogate =
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const [result] = sanitizeManualActivityHistory([
      entry({
        details: `${'d'.repeat(299)}😀x`,
        id: `${'i'.repeat(127)}😀x`,
        timestamp: 10,
        title: `${'t'.repeat(199)}😀x`,
      }),
    ]);
    expect(Array.from(result?.id ?? '')).toHaveLength(128);
    expect(Array.from(result?.title ?? '')).toHaveLength(200);
    expect(Array.from(result?.details ?? '')).toHaveLength(300);
    for (const value of [result?.id, result?.title, result?.details]) {
      expect(value?.endsWith('😀')).toBe(true);
      expect(unpairedSurrogate.test(value ?? '')).toBe(false);
    }
    const displayName = sanitizeOwnedProgressData({
      displayName: `${'n'.repeat(63)}😀x`,
    }).displayName;
    expect(Array.from(displayName ?? '')).toHaveLength(64);
    expect(displayName?.endsWith('😀')).toBe(true);
    expect(unpairedSurrogate.test(displayName ?? '')).toBe(false);
  });
  it('omits details when absent or blank', () => {
    expect(sanitizeManualActivityHistory([entry({ details: '   ' })])[0]).not.toHaveProperty(
      'details'
    );
    expect(sanitizeManualActivityHistory([entry()])[0]).not.toHaveProperty('details');
  });
  it('drops lone surrogates so jsonb accepts the serialized payload', () => {
    const unpairedSurrogate =
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const [survivor] = sanitizeManualActivityHistory([
      entry({
        details: `kept \uD83D\uDE00 dropped \uD800 tail`,
        id: `manual-\uD800-1`,
        timestamp: 10,
        title: `kept \uD83D\uDE00 dropped \uDBFF`,
      }),
    ]);
    expect(survivor?.id).toBe('manual--1');
    expect(survivor?.title).toBe('kept 😀 dropped ');
    expect(survivor?.details).toBe('kept 😀 dropped  tail');
    for (const value of [survivor?.id, survivor?.title, survivor?.details]) {
      expect(unpairedSurrogate.test(value ?? '')).toBe(false);
    }
    const [surrogateOnly] = sanitizeManualActivityHistory([
      entry({ id: '\uD800', title: '\uDBFF\uDFFF' }),
    ]);
    expect(surrogateOnly).toBeUndefined();
    expect(sanitizeOwnedProgressData({ displayName: 'name \uDC00' }).displayName).toBe('name ');
    expect(
      unpairedSurrogate.test(
        sanitizeOwnedProgressData({ displayName: 'name \uDC00' }).displayName ?? ''
      )
    ).toBe(false);
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
describe('sanitizeOwnedUserState seasonal season reconciliation', () => {
  it('stamps the active season and keeps seasonal progress for the active season', () => {
    const result = sanitizeOwnedUserState({
      currentGameMode: 'seasonal',
      seasonal: { level: 14 },
      seasonalSeasonNumber: ACTIVE_SEASON_NUMBER,
    });
    expect(result.seasonal.level).toBe(14);
    expect(result.seasonalSeasonNumber).toBe(ACTIVE_SEASON_NUMBER);
  });
  it('drops seasonal progress stamped with a previous season', () => {
    const result = sanitizeOwnedUserState({
      currentGameMode: 'seasonal',
      pvp: { level: 42 },
      seasonal: { level: 14 },
      seasonalSeasonNumber: ACTIVE_SEASON_NUMBER - 1,
    });
    expect(result.seasonal.level).toBe(1);
    expect(result.pvp.level).toBe(42);
    expect(result.seasonalSeasonNumber).toBe(ACTIVE_SEASON_NUMBER);
  });
});
