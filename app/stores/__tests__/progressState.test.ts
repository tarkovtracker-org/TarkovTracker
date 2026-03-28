import { describe, expect, it, vi } from 'vitest';
import { actions, getters, type UserState } from '@/stores/progressState';
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
