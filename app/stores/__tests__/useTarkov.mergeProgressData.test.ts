import { describe, expect, it } from 'vitest';
import { hasProgress, mergeProgressData } from '@/stores/tarkov/progressMerge';
import type { ManualActivityEntry, UserProgressData, UserState } from '@/stores/progressState';
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
describe('mergeProgressData manual activity history', () => {
  const entry = (overrides: Partial<ManualActivityEntry> = {}): ManualActivityEntry => ({
    id: 'manual-1',
    timestamp: 1000,
    type: 'task',
    action: 'complete',
    title: 'Completed Task: Debut',
    ...overrides,
  });
  const withHistory = (history: ManualActivityEntry[], progressEpoch = 0): UserProgressData => ({
    ...createProgressData({}),
    manualActivityHistory: history,
    progressEpoch,
  });
  it('unions both sides on the equal-epoch branch, newest first', () => {
    const merged = mergeProgressData(
      withHistory([entry({ id: 'local-1', timestamp: 3000, title: 'Local' })]),
      withHistory([entry({ id: 'remote-1', timestamp: 5000, title: 'Remote' })])
    );
    expect(merged.manualActivityHistory?.map((item) => item.id)).toEqual(['remote-1', 'local-1']);
  });
  it('keeps the newest entry when both sides share an id', () => {
    const merged = mergeProgressData(
      withHistory([entry({ id: 'shared', timestamp: 9000, title: 'Local newer' })]),
      withHistory([entry({ id: 'shared', timestamp: 1000, title: 'Remote older' })])
    );
    expect(merged.manualActivityHistory).toEqual([
      entry({ id: 'shared', timestamp: 9000, title: 'Local newer' }),
    ]);
  });
  it('drops malformed entries from either side', () => {
    const merged = mergeProgressData(
      withHistory([
        entry({ id: 'good', timestamp: 4000 }),
        { id: 'bad', title: 'no type or action' } as unknown as ManualActivityEntry,
      ]),
      withHistory(['nonsense' as unknown as ManualActivityEntry])
    );
    expect(merged.manualActivityHistory?.map((item) => item.id)).toEqual(['good']);
  });
  it('caps the merged history at the shared limit', () => {
    const merged = mergeProgressData(
      withHistory(
        Array.from({ length: 40 }, (_unused, index) =>
          entry({ id: `local-${index}`, timestamp: 1000 + index })
        )
      ),
      withHistory(
        Array.from({ length: 40 }, (_unused, index) =>
          entry({ id: `remote-${index}`, timestamp: 5000 + index })
        )
      )
    );
    expect(merged.manualActivityHistory).toHaveLength(50);
    expect(merged.manualActivityHistory?.[0]?.id).toBe('remote-39');
  });
  it('treats a missing history as empty rather than dropping the other side', () => {
    const merged = mergeProgressData(
      createProgressData({}),
      withHistory([entry({ id: 'remote' })])
    );
    expect(merged.manualActivityHistory?.map((item) => item.id)).toEqual(['remote']);
  });
  it('discards the losing side when a reset epoch wins', () => {
    const local = withHistory([entry({ id: 'local-only', timestamp: 9000 })], 1);
    const remote = withHistory([entry({ id: 'remote-only', timestamp: 1000 })], 2);
    const remoteWins = mergeProgressData(local, remote);
    expect(remoteWins.progressEpoch).toBe(2);
    expect(remoteWins.manualActivityHistory?.map((item) => item.id)).toEqual(['remote-only']);
    const localWins = mergeProgressData(remote, local);
    expect(localWins.progressEpoch).toBe(2);
    expect(localWins.manualActivityHistory?.map((item) => item.id)).toEqual(['remote-only']);
  });
});
