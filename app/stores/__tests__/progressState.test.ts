import { describe, expect, it, vi } from 'vitest';
import {
  actions,
  getters,
  migrateToGameModeStructure,
  type ManualActivityEntry,
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
describe('manual activity history actions', () => {
  const entry = (overrides: Partial<ManualActivityEntry> = {}): ManualActivityEntry => ({
    id: 'manual-1',
    timestamp: 1000,
    type: 'task',
    action: 'complete',
    title: 'Completed Task: Debut',
    ...overrides,
  });
  it('writes entries into the selected mode only', () => {
    const state = createBaseState();
    actions.addManualActivityEntries.call(state, [entry({ id: 'pvp-1' })]);
    expect(
      getters
        .getManualActivityHistory(state)()
        .map((item) => item.id)
    ).toEqual(['pvp-1']);
    expect(state.pve.manualActivityHistory ?? []).toEqual([]);
    actions.switchGameMode.call(state, 'pve');
    expect(getters.getManualActivityHistory(state)()).toEqual([]);
    actions.addManualActivityEntries.call(state, [entry({ id: 'pve-1' })]);
    expect(
      getters
        .getManualActivityHistory(state)()
        .map((item) => item.id)
    ).toEqual(['pve-1']);
    expect(state.pvp.manualActivityHistory?.map((item) => item.id)).toEqual(['pvp-1']);
  });
  it('orders entries newest first and collapses duplicate ids', () => {
    const state = createBaseState();
    actions.addManualActivityEntries.call(state, [entry({ id: 'dup', timestamp: 100 })]);
    actions.addManualActivityEntries.call(state, [entry({ id: 'other', timestamp: 500 })]);
    actions.addManualActivityEntries.call(state, [
      entry({ id: 'dup', timestamp: 900, title: 'Newer' }),
    ]);
    const history = getters.getManualActivityHistory(state)();
    expect(history.map((item) => item.id)).toEqual(['dup', 'other']);
    expect(history[0]?.title).toBe('Newer');
  });
  it('caps the history at 50 entries, retaining the newest', () => {
    const state = createBaseState();
    actions.addManualActivityEntries.call(
      state,
      Array.from({ length: 70 }, (_unused, index) =>
        entry({ id: `manual-${index}`, timestamp: 1000 + index })
      )
    );
    const history = getters.getManualActivityHistory(state)();
    expect(history).toHaveLength(50);
    expect(history[0]?.id).toBe('manual-69');
    expect(history.at(-1)?.id).toBe('manual-20');
  });
  it('drops malformed entries', () => {
    const state = createBaseState();
    actions.addManualActivityEntries.call(state, [
      { id: '', timestamp: 1, type: 'task', action: 'complete', title: 'no id' },
      { id: 'no-title', timestamp: 1, type: 'task', action: 'complete', title: '   ' },
      { id: 'bad-type', timestamp: 1, type: 'quest', action: 'complete', title: 'x' },
      { id: 'bad-action', timestamp: 1, type: 'task', action: 'deleted', title: 'x' },
      { id: 'no-timestamp', timestamp: Number.NaN, type: 'task', action: 'complete', title: 'x' },
    ] as unknown as ManualActivityEntry[]);
    expect(getters.getManualActivityHistory(state)()).toEqual([]);
  });
  it('ignores an empty batch and clears only the selected mode', () => {
    const state = createBaseState();
    actions.addManualActivityEntries.call(state, [entry({ id: 'pvp-1' })]);
    actions.addManualActivityEntries.call(state, []);
    expect(getters.getManualActivityHistory(state)()).toHaveLength(1);
    actions.switchGameMode.call(state, 'pve');
    actions.addManualActivityEntries.call(state, [entry({ id: 'pve-1' })]);
    actions.clearManualActivityHistory.call(state);
    expect(state.pve.manualActivityHistory).toEqual([]);
    expect(state.pvp.manualActivityHistory?.map((item) => item.id)).toEqual(['pvp-1']);
  });
});
describe('manual activity clearing', () => {
  it('advances the history generation without changing gameplay or another mode', () => {
    const state = createBaseState();
    state.pvp.level = 42;
    state.pvp.progressEpoch = 3;
    actions.clearManualActivityHistory.call(state);
    expect(state.pvp.manualActivityEpoch).toBe(1);
    expect(state.pvp.level).toBe(42);
    expect(state.pvp.progressEpoch).toBe(3);
    expect(state.pve.manualActivityEpoch).toBeUndefined();
    actions.clearManualActivityHistory.call(state);
    expect(state.pvp.manualActivityEpoch).toBe(2);
  });
});
