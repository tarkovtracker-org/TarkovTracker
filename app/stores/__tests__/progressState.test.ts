import { describe, expect, it, vi } from 'vitest';
import {
  actions,
  getters,
  migrateToGameModeStructure,
  type UserState,
} from '@/stores/progressState';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
const createBaseState = (): UserState =>
  ({
    currentGameMode: 'pvp',
    gameEdition: 1,
    tarkovUid: null,
    pvp: {
      level: 1,
      pmcFaction: 'USEC',
      displayName: null,
      xpOffset: 0,
      taskObjectives: {},
      taskCompletions: {},
      hideoutParts: {},
      hideoutModules: {},
      traders: {},
      skills: {},
      prestigeLevel: 0,
      skillOffsets: {},
      storyChapters: {},
    },
    pve: {
      level: 1,
      pmcFaction: 'USEC',
      displayName: null,
      xpOffset: 0,
      taskObjectives: {},
      taskCompletions: {},
      hideoutParts: {},
      hideoutModules: {},
      traders: {},
      skills: {},
      prestigeLevel: 0,
      skillOffsets: {},
      storyChapters: {},
    },
  }) as UserState;
const createStateWithTaskCompletion = (completion: unknown): UserState =>
  ({
    ...createBaseState(),
    pvp: {
      ...createBaseState().pvp,
      taskCompletions: { 'task-1': completion },
    },
  }) as UserState;
describe('progressState getters task completion compatibility', () => {
  it('treats legacy boolean completions as complete', () => {
    const state = createStateWithTaskCompletion(true);
    expect(getters.isTaskComplete(state)('task-1')).toBe(true);
    expect(getters.isTaskFailed(state)('task-1')).toBe(false);
  });
  it('treats complete+failed as failed precedence', () => {
    const state = createStateWithTaskCompletion({ complete: true, failed: true });
    expect(getters.isTaskComplete(state)('task-1')).toBe(false);
    expect(getters.isTaskFailed(state)('task-1')).toBe(true);
  });
});
describe('progressState storyline timestamps', () => {
  it('records timestamps for storyline uncomplete actions', () => {
    const state = createBaseState();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(5000);
    try {
      actions.setStoryChapterUncomplete.call(state, 'chapter-1');
      actions.setStoryObjectiveUncomplete.call(state, 'chapter-1', 'objective-1');
      expect(state.pvp.storyChapters['chapter-1']).toMatchObject({
        complete: false,
        timestamp: 5000,
        objectives: {
          'objective-1': {
            complete: false,
            timestamp: 5000,
          },
        },
      });
    } finally {
      nowSpy.mockRestore();
    }
  });
});
describe('migrateToGameModeStructure', () => {
  it('preserves linked uid while stripping legacy tarkov.dev payloads', () => {
    const migrated = migrateToGameModeStructure({
      currentGameMode: 'pvp',
      gameEdition: 4,
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
    expect(migrated.tarkovUid).toBe(67890);
    expect(migrated.pvp).not.toHaveProperty('tarkovDevProfile');
    expect(migrated.pve).not.toHaveProperty('tarkovDevProfile');
  });
  it('keeps seasonal progress when the stored season matches the active season', () => {
    const migrated = migrateToGameModeStructure({
      currentGameMode: 'seasonal',
      pvp: { level: 5 },
      pve: { level: 3 },
      seasonal: { level: 20 },
      seasonalSeasonNumber: ACTIVE_SEASON_NUMBER,
    });
    expect(migrated.seasonal.level).toBe(20);
    expect(migrated.seasonalSeasonNumber).toBe(ACTIVE_SEASON_NUMBER);
  });
  it('keeps seasonal progress when no stored season number is present', () => {
    const migrated = migrateToGameModeStructure({
      currentGameMode: 'seasonal',
      pvp: { level: 5 },
      pve: { level: 3 },
      seasonal: { level: 20 },
    });
    expect(migrated.seasonal.level).toBe(20);
    expect(migrated.seasonalSeasonNumber).toBe(ACTIVE_SEASON_NUMBER);
  });
  it('does not reuse a seasonal legacy payload as PvP compatibility data', () => {
    const migrated = migrateToGameModeStructure({
      currentGameMode: 'seasonal',
      level: 27,
      taskCompletions: { 'task-1': { complete: true } },
    });
    expect(migrated.seasonal.level).toBe(27);
    expect(migrated.pvp.level).toBe(1);
    expect(migrated.pvp.taskCompletions).toEqual({});
    expect(migrated.pve.level).toBe(1);
  });
  it('discards seasonal progress carried over from a previous season', () => {
    const migrated = migrateToGameModeStructure({
      currentGameMode: 'seasonal',
      pvp: { level: 5 },
      pve: { level: 3 },
      seasonal: { level: 20, taskCompletions: { 'task-1': { complete: true } } },
      seasonalSeasonNumber: ACTIVE_SEASON_NUMBER - 1,
    });
    expect(migrated.seasonal.level).toBe(1);
    expect(migrated.seasonal.taskCompletions).toEqual({});
    expect(migrated.seasonalSeasonNumber).toBe(ACTIVE_SEASON_NUMBER);
    expect(migrated.pvp.level).toBe(5);
    expect(migrated.pve.level).toBe(3);
  });
});
