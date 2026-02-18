import { describe, expect, it } from 'vitest';
import { getters, type UserState } from '@/stores/progressState';
const createStateWithTaskCompletion = (completion: unknown): UserState =>
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
      taskCompletions: { 'task-1': completion },
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
