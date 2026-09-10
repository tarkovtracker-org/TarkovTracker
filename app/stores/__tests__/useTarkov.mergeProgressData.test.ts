import { describe, expect, it } from 'vitest';
import { hasProgress, mergeProgressData } from '@/stores/tarkov/progressMerge';
import type { UserProgressData, UserState } from '@/stores/progressState';
const createProgressData = (
  storyChapters: UserProgressData['storyChapters']
): UserProgressData => ({
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
  progressEpoch: 0,
  skillOffsets: {},
  storyChapters,
});
describe('mergeProgressData story chapters', () => {
  it('merges chapter objectives by key without dropping existing objective progress', () => {
    const local = createProgressData({
      'chapter-1': {
        complete: true,
        timestamp: 5000,
        objectives: {
          'objective-a': { complete: true, timestamp: 1000 },
        },
      },
    });
    const remote = createProgressData({
      'chapter-1': {
        objectives: {
          'objective-b': { complete: true, timestamp: 2000 },
        },
      },
    });
    const merged = mergeProgressData(local, remote);
    expect(merged.storyChapters['chapter-1']).toMatchObject({
      complete: true,
      timestamp: 5000,
      objectives: {
        'objective-a': { complete: true, timestamp: 1000 },
        'objective-b': { complete: true, timestamp: 2000 },
      },
    });
  });
  it('uses newer objective timestamp when both clients update the same objective', () => {
    const local = createProgressData({
      'chapter-1': {
        objectives: {
          'objective-a': { complete: true, timestamp: 1000 },
        },
      },
    });
    const remote = createProgressData({
      'chapter-1': {
        objectives: {
          'objective-a': { complete: false, timestamp: 2000 },
        },
      },
    });
    const merged = mergeProgressData(local, remote);
    expect(merged.storyChapters['chapter-1']?.objectives?.['objective-a']).toEqual({
      complete: false,
      timestamp: 2000,
    });
  });
  it('keeps timestamped completion when conflicting uncomplete update has no timestamp', () => {
    const local = createProgressData({
      'chapter-1': {
        objectives: {
          'objective-a': { complete: true, timestamp: 2000 },
        },
      },
    });
    const remote = createProgressData({
      'chapter-1': {
        objectives: {
          'objective-a': { complete: false },
        },
      },
    });
    const merged = mergeProgressData(local, remote);
    expect(merged.storyChapters['chapter-1']?.objectives?.['objective-a']).toEqual({
      complete: true,
      timestamp: 2000,
    });
  });
});
describe('mergeProgressData task active state', () => {
  it('round-trips explicit active and preserves legacy unknown', () => {
    const local = createProgressData({});
    local.taskCompletions = {
      active: { active: true, complete: false, failed: false, timestamp: 2000 },
      legacy: { complete: false, failed: false, timestamp: 2000 },
    };
    const merged = mergeProgressData(local, createProgressData({}));
    expect(merged.taskCompletions.active).toMatchObject({ active: true });
    expect(merged.taskCompletions.legacy).not.toHaveProperty('active');
  });
  it('lets a newer explicit neutral state clear active', () => {
    const local = createProgressData({});
    local.taskCompletions = {
      task: { active: true, complete: false, failed: false, timestamp: 1000 },
    };
    const remote = createProgressData({});
    remote.taskCompletions = {
      task: { active: false, complete: false, failed: false, timestamp: 2000 },
    };
    expect(mergeProgressData(local, remote).taskCompletions.task).toMatchObject({
      active: false,
      complete: false,
      failed: false,
      timestamp: 2000,
    });
  });
  it.each([
    ['completed', { complete: true, failed: false, timestamp: 2000 }],
    ['failed', { complete: true, failed: true, timestamp: 2000 }],
  ])('clears older active for a newer legacy %s state', (_state, completion) => {
    const local = createProgressData({});
    local.taskCompletions = {
      task: { active: true, complete: false, failed: false, timestamp: 1000 },
    };
    const remote = createProgressData({});
    remote.taskCompletions = { task: completion };
    expect(mergeProgressData(local, remote).taskCompletions.task).toMatchObject({
      active: false,
      ...completion,
    });
  });
  it('keeps a newer ambiguous legacy incomplete state unknown', () => {
    const local = createProgressData({});
    local.taskCompletions = {
      task: { active: true, complete: false, failed: false, timestamp: 1000 },
    };
    const remote = createProgressData({});
    remote.taskCompletions = {
      task: { complete: false, failed: false, timestamp: 2000 },
    };
    expect(mergeProgressData(local, remote).taskCompletions.task).not.toHaveProperty('active');
  });
});
describe('hasProgress metadata state', () => {
  it('treats prestige and reset epochs as progress', () => {
    const empty = createProgressData({});
    const state = {
      currentGameMode: 'seasonal',
      gameEdition: 1,
      tarkovUid: null,
      pvp: empty,
      pve: empty,
      seasonal: { ...empty, prestigeLevel: 1, progressEpoch: 0 },
    } as UserState;
    expect(hasProgress(state)).toBe(true);
    expect(hasProgress({ ...state, seasonal: { ...empty, progressEpoch: 1 } })).toBe(true);
  });
});
describe('mergeProgressData progress epoch', () => {
  it('prefers remote data when remote epoch is newer', () => {
    const local = createProgressData({});
    local.level = 35;
    local.progressEpoch = 3;
    const remote = createProgressData({});
    remote.level = 1;
    remote.progressEpoch = 4;
    const merged = mergeProgressData(local, remote);
    expect(merged.level).toBe(1);
    expect(merged.progressEpoch).toBe(4);
  });
  it('prefers local data when local epoch is newer', () => {
    const local = createProgressData({});
    local.level = 35;
    local.progressEpoch = 5;
    const remote = createProgressData({});
    remote.level = 1;
    remote.progressEpoch = 4;
    const merged = mergeProgressData(local, remote);
    expect(merged.level).toBe(35);
    expect(merged.progressEpoch).toBe(5);
  });
  it('keeps a newer lower prestige level when its epoch is newer', () => {
    const local = createProgressData({});
    local.prestigeLevel = 4;
    local.progressEpoch = 2;
    const remote = createProgressData({});
    remote.prestigeLevel = 2;
    remote.progressEpoch = 3;
    const merged = mergeProgressData(local, remote);
    expect(merged.prestigeLevel).toBe(2);
    expect(merged.progressEpoch).toBe(3);
  });
  it('keeps an older higher prestige level from overwriting a newer correction', () => {
    const local = createProgressData({});
    local.prestigeLevel = 2;
    local.progressEpoch = 5;
    const remote = createProgressData({});
    remote.prestigeLevel = 4;
    remote.progressEpoch = 4;
    const merged = mergeProgressData(local, remote);
    expect(merged.prestigeLevel).toBe(2);
    expect(merged.progressEpoch).toBe(5);
  });
  it('wipes storyChapters when a higher-epoch reset wins (prestige/reset contract)', () => {
    const local = createProgressData({
      'chapter-1': { complete: true, timestamp: 1000 },
    });
    local.progressEpoch = 2;
    const remote = createProgressData({});
    remote.progressEpoch = 3;
    const merged = mergeProgressData(local, remote);
    expect(merged.progressEpoch).toBe(3);
    expect(merged.storyChapters).toEqual({});
  });
  it('merges storyChapters when epochs are equal and only prestigeLevel differs', () => {
    const local = createProgressData({
      'chapter-1': { complete: true, timestamp: 1000 },
    });
    local.prestigeLevel = 1;
    local.progressEpoch = 2;
    const remote = createProgressData({
      'chapter-2': { complete: true, timestamp: 2000 },
    });
    remote.prestigeLevel = 2;
    remote.progressEpoch = 2;
    const merged = mergeProgressData(local, remote);
    expect(merged.progressEpoch).toBe(2);
    expect(merged.storyChapters).toMatchObject({
      'chapter-1': { complete: true, timestamp: 1000 },
      'chapter-2': { complete: true, timestamp: 2000 },
    });
  });
});
