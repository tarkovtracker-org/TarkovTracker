// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import {
  hasAccountRecoveryCopy,
  isAccountRecoveryRetentionBlocked,
  blockAccountRecoveryRetentionForOwner,
  mayHoldAccountRecoveryCopy,
  preserveForeignActiveCopy,
  readAccountRecoveryCopy,
  removeAccountRecoveryCopy,
  retryBlockedAccountRecoveryRetention,
  resetAccountRecoveryRetentionBlock,
  saveAccountRecoveryCopy,
  selectFreshestOwnerProgressSnapshot,
} from '@/stores/tarkov/accountRecovery';
import {
  clearActiveProgressStorage,
  progressPersistStorage,
  parsePersistedProgressState,
  persistActiveProgressValue,
  setActiveProgressWritesBlocked,
} from '@/stores/tarkov/localStorage';
import {
  findRedundantProgressBackups,
  relieveProgressStoragePressure,
} from '@/stores/tarkov/storageQuota';
import { listSupersededProgressCopies } from '@/stores/tarkov/supersededProgress';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
import { sanitizeOwnedUserState } from '@/utils/progressSanitizers';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { mergeTaskAvailability } from '@/utils/taskAvailabilityConfirmation';
import type { PersistedProgressSnapshot } from '@/stores/tarkov/localStorage';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const envelope = (userId: string | null, timestamp: number, level = 1) =>
  JSON.stringify({
    _timestamp: timestamp,
    _userId: userId,
    data: { ...structuredClone(defaultState), pvp: { ...defaultState.pvp, level } },
  });
const progressEnvelope = (
  userId: string,
  timestamp: number,
  state: typeof defaultState,
  clocks: {
    metadataTimestamp?: number;
    modeTimestamps?: Partial<Record<'pvp' | 'pve' | 'seasonal', number>>;
  } = {}
) =>
  JSON.stringify({
    _timestamp: timestamp,
    ...(clocks.metadataTimestamp === undefined
      ? {}
      : { _metadataTimestamp: clocks.metadataTimestamp }),
    ...(clocks.modeTimestamps === undefined ? {} : { _modeTimestamps: clocks.modeTimestamps }),
    _userId: userId,
    data: state,
  });
const recoveryKey = (userId: string) => `${STORAGE_KEYS.progressRecoveryPrefix}${userId}`;
const historicalState = () => {
  const state = structuredClone(defaultState);
  state.pvp.taskAvailability = Object.fromEntries(
    Array.from({ length: 66 }, (_, index) => [
      `s${index + 1}`,
      { requirements: 'x'.repeat(4000), timestamp: 200 + index },
    ])
  );
  return state;
};
const snapshot = (
  timestamp: number | null,
  state = structuredClone(defaultState),
  clocks: {
    metadataTimestamp?: number;
    modeTimestamps?: Partial<Record<'pvp' | 'pve' | 'seasonal', number>>;
  } = {},
  storedUserId: string | null = 'user-1'
): PersistedProgressSnapshot => ({
  hadDeprecatedProgressData: false,
  state,
  storedUserId,
  timestamp,
  ...clocks,
});
describe('account recovery copies', () => {
  it('preserves unchanged historical bytes for every mode and rejects a different owner', () => {
    const state = historicalState();
    state.pve.taskAvailability = state.pvp.taskAvailability;
    state.seasonal.taskAvailability = state.pvp.taskAvailability;
    const raw = progressEnvelope('user-1', 500, state);
    expect(saveAccountRecoveryCopy(raw, 'user-1')).toBe(true);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe(raw);
    expect(saveAccountRecoveryCopy(raw, 'user-1')).toBe(true);
    const restored = readAccountRecoveryCopy('user-1')!;
    for (const mode of ['pvp', 'pve', 'seasonal'] as const) {
      expect(Object.keys(restored.state[mode].taskAvailability!)).toHaveLength(65);
      expect(Object.keys(restored.confirmationCandidates![mode]!)).toHaveLength(66);
    }
    expect(readAccountRecoveryCopy('user-2')).toBeNull();
    expect(saveAccountRecoveryCopy(raw, 'user-2')).toBe(false);
    expect(localStorage.getItem(recoveryKey('user-2'))).toBeNull();
  });
  it('retains original evidence before a bounded same-owner write and after a reload', () => {
    const state = historicalState();
    const raw = progressEnvelope('user-1', 500, state);
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    const bounded = progressEnvelope('user-1', 600, sanitizeOwnedUserState(state));
    expect(persistActiveProgressValue(bounded)).toBe(true);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe(raw);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(bounded);
    resetAccountRecoveryRetentionBlock();
    const snapshot = selectFreshestOwnerProgressSnapshot(
      readAccountRecoveryCopy('user-1'),
      parsePersistedProgressState(localStorage.getItem(STORAGE_KEYS.progress), 'user-1'),
      null
    )!;
    expect(
      mergeTaskAvailability(snapshot.confirmationCandidates?.pvp, {
        s1: { requirements: 'old', timestamp: 0 },
      })
    ).not.toHaveProperty('s1');
  });
  it('blocks replacement on historical quota failure without losing either owner identity or bytes', () => {
    const state = historicalState();
    const raw = progressEnvelope('user-1', 500, state);
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    const originalSet = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === recoveryKey('user-1')) throw new DOMException('full', 'QuotaExceededError');
      originalSet(key, value);
    });
    expect(
      persistActiveProgressValue(progressEnvelope('user-1', 600, sanitizeOwnedUserState(state)))
    ).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
    expect(retryBlockedAccountRecoveryRetention('user-2')).toBe(false);
    spy.mockRestore();
    expect(retryBlockedAccountRecoveryRetention('user-1')).toBe(true);
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
  });
  it('leaves divergent originals untouched and permits only their owner to reconcile', () => {
    const recoveryState = historicalState();
    recoveryState.pve.level = 7;
    const activeState = historicalState();
    activeState.pvp.level = 9;
    const recovery = progressEnvelope('user-1', 500, recoveryState);
    const active = progressEnvelope('user-1', 600, activeState);
    localStorage.setItem(recoveryKey('user-1'), recovery);
    localStorage.setItem(STORAGE_KEYS.progress, active);
    expect(saveAccountRecoveryCopy(active, 'user-1')).toBe(false);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe(recovery);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(active);
    expect(retryBlockedAccountRecoveryRetention('user-2')).toBe(false);
    expect(retryBlockedAccountRecoveryRetention('user-1')).toBe(true);
    const composed = selectFreshestOwnerProgressSnapshot(
      readAccountRecoveryCopy('user-1'),
      parsePersistedProgressState(active, 'user-1'),
      null
    )!;
    expect(composed.state.pvp.level).toBe(9);
    expect(composed.state.pve.level).toBe(7);
    expect(Object.keys(composed.confirmationCandidates!.pvp!)).toHaveLength(66);
  });
  it('persists a bounded equal-clock clear instead of retaining unnecessary historical overflow', () => {
    const state = historicalState();
    expect(saveAccountRecoveryCopy(progressEnvelope('user-1', 500, state), 'user-1')).toBe(true);
    const cleared = structuredClone(defaultState);
    cleared.pvp.taskAvailability = { s1: { requirements: '', timestamp: 200 } };
    expect(saveAccountRecoveryCopy(progressEnvelope('user-1', 600, cleared), 'user-1')).toBe(true);
    const persisted = JSON.parse(localStorage.getItem(recoveryKey('user-1'))!);
    expect(persisted.data.pvp.taskAvailability.s1).toEqual({ requirements: '', timestamp: 200 });
    expect(Object.keys(persisted.data.pvp.taskAvailability)).toHaveLength(66);
    expect(persisted).not.toHaveProperty('confirmationCandidates');
  });
  it('retains historical winner evidence through recovery serialization before reconciliation', () => {
    const state = structuredClone(defaultState);
    state.pvp.taskAvailability = Object.fromEntries(
      Array.from({ length: 66 }, (_, index) => [
        `s${index + 1}`,
        { requirements: 'x'.repeat(4000), timestamp: 200 + index },
      ])
    );
    const original = state.pvp.taskAvailability;
    const remote = { s1: { requirements: 'old', timestamp: 0 } };
    const expected = mergeTaskAvailability(original, remote);
    expect(expected.s1).toBeUndefined();
    expect(saveAccountRecoveryCopy(progressEnvelope('user-1', 500, state), 'user-1')).toBe(true);
    // Read only persisted JSON, as after an owner change or a page reload: no transient context.
    const persisted = JSON.parse(localStorage.getItem(recoveryKey('user-1'))!);
    expect(mergeTaskAvailability(persisted.data.pvp.taskAvailability, remote)).toEqual(expected);
  });
  beforeEach(() => {
    localStorage.clear();
    resetAccountRecoveryRetentionBlock();
    setActiveProgressWritesBlocked(false);
  });
  it('retains only copies owned by the named account', () => {
    expect(saveAccountRecoveryCopy(envelope('user-2', 10), 'user-1')).toBe(false);
    expect(saveAccountRecoveryCopy(envelope(null, 10), 'user-1')).toBe(false);
    expect(saveAccountRecoveryCopy(null, 'user-1')).toBe(false);
    expect(hasAccountRecoveryCopy('user-1')).toBe(false);
    expect(saveAccountRecoveryCopy(envelope('user-1', 10, 7), 'user-1')).toBe(true);
    expect(readAccountRecoveryCopy('user-1')?.state.pvp.level).toBe(7);
    // Never readable as another account's progress.
    expect(readAccountRecoveryCopy('user-2')).toBeNull();
  });
  it('never replaces a newer copy with older changes', () => {
    saveAccountRecoveryCopy(envelope('user-1', 20, 9), 'user-1');
    expect(saveAccountRecoveryCopy(envelope('user-1', 10, 3), 'user-1')).toBe(true);
    expect(readAccountRecoveryCopy('user-1')?.state.pvp.level).toBe(9);
    saveAccountRecoveryCopy(envelope('user-1', 30, 12), 'user-1');
    expect(readAccountRecoveryCopy('user-1')?.state.pvp.level).toBe(12);
  });
  it('composes the newest metadata and each mode using their own clocks', () => {
    const recoveryState = {
      ...structuredClone(defaultState),
      gameEdition: 2,
      pvp: { ...defaultState.pvp, level: 20 },
    };
    const activeState = {
      ...structuredClone(defaultState),
      currentGameMode: 'pve' as const,
      gameEdition: 3,
      pvp: { ...defaultState.pvp, level: 3 },
      pve: { ...defaultState.pve, level: 30 },
    };
    const selected = selectFreshestOwnerProgressSnapshot(
      snapshot(1_000, recoveryState, {
        metadataTimestamp: 10,
        modeTimestamps: { pvp: 200, pve: 100 },
      }),
      snapshot(20, activeState, {
        metadataTimestamp: 300,
        modeTimestamps: { pvp: 50, pve: 150 },
      })
    );
    expect(selected?.state.gameEdition).toBe(3);
    expect(selected?.state.currentGameMode).toBe('pve');
    expect(selected?.state.pvp.level).toBe(20);
    expect(selected?.state.pve.level).toBe(30);
    expect(selected?.metadataTimestamp).toBe(300);
    expect(selected?.modeTimestamps).toMatchObject({ pvp: 200, pve: 150 });
  });
  it('rereads a two-tab recovery copy and retains independently newer fields', () => {
    const original = {
      ...structuredClone(defaultState),
      pvp: { ...defaultState.pvp, level: 8 },
    };
    const otherTab = {
      ...structuredClone(defaultState),
      currentGameMode: 'pve' as const,
      gameEdition: 3,
      pve: { ...defaultState.pve, level: 12 },
    };
    const staleInput = progressEnvelope('user-1', 100, original, {
      metadataTimestamp: 100,
      modeTimestamps: { pvp: 100 },
    });
    saveAccountRecoveryCopy(staleInput, 'user-1');
    localStorage.setItem(
      recoveryKey('user-1'),
      progressEnvelope('user-1', 101, otherTab, {
        metadataTimestamp: 250,
        modeTimestamps: { pvp: 50, pve: 250 },
      })
    );
    expect(saveAccountRecoveryCopy(staleInput, 'user-1')).toBe(true);
    const retained = readAccountRecoveryCopy('user-1');
    expect(retained?.state.pvp.level).toBe(8);
    expect(retained?.state.pve.level).toBe(12);
    expect(retained?.state.gameEdition).toBe(3);
    expect(retained?.state.currentGameMode).toBe('pve');
  });
  it('uses the outer timestamp as the fallback clock for legacy wrappers', () => {
    const legacy = JSON.stringify({
      _timestamp: 100,
      _userId: 'user-1',
      data: { ...structuredClone(defaultState), pvp: { ...defaultState.pvp, level: 9 } },
    });
    const newerClockInput = progressEnvelope(
      'user-1',
      90,
      { ...structuredClone(defaultState), pvp: { ...defaultState.pvp, level: 3 } },
      { metadataTimestamp: 90, modeTimestamps: { pvp: 90 } }
    );
    localStorage.setItem(recoveryKey('user-1'), legacy);
    expect(saveAccountRecoveryCopy(newerClockInput, 'user-1')).toBe(true);
    expect(readAccountRecoveryCopy('user-1')?.state.pvp.level).toBe(9);
    expect(readAccountRecoveryCopy('user-1')?.modeTimestamps?.pvp).toBe(100);
  });
  it('excludes stale-season recovery progress when composing with current active progress', () => {
    const staleSeason = 999;
    const staleRaw = progressEnvelope(
      'user-1',
      1_000,
      {
        ...structuredClone(defaultState),
        seasonalSeasonNumber: staleSeason,
        seasonal: { ...defaultState.seasonal, level: 70 },
      },
      { modeTimestamps: { seasonal: 1_000 } }
    );
    const activeRaw = progressEnvelope(
      'user-1',
      100,
      { ...structuredClone(defaultState), seasonal: { ...defaultState.seasonal, level: 20 } },
      { modeTimestamps: { seasonal: 100 } }
    );
    localStorage.setItem(recoveryKey('user-1'), staleRaw);
    const oldRecovery = readAccountRecoveryCopy('user-1');
    const active = parsePersistedProgressState(activeRaw, 'user-1');
    expect(oldRecovery?.seasonalSourceSeasonNumber).toBe(staleSeason);
    expect(active?.seasonalSourceSeasonNumber).toBe(ACTIVE_SEASON_NUMBER);
    const selected = selectFreshestOwnerProgressSnapshot(oldRecovery, active);
    expect(selected?.state.seasonal.level).toBe(20);
    expect(selected?.modeTimestamps?.seasonal).toBe(100);
    expect(listSupersededProgressCopies('user-1')).toHaveLength(1);
  });
  it('keeps no recovery copy when the owner deliberately resets their own active copy', () => {
    localStorage.setItem(STORAGE_KEYS.progress, envelope('user-1', 10, 9));
    clearActiveProgressStorage('user-1');
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
    expect(localStorage.getItem(recoveryKey('user-1'))).toBeNull();
  });
  it('still retains the active owner copy when cleanup is not that owner reset', () => {
    localStorage.setItem(STORAGE_KEYS.progress, envelope('user-1', 10, 9));
    clearActiveProgressStorage('user-2');
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
    expect(readAccountRecoveryCopy('user-1')?.state.pvp.level).toBe(9);
  });
  it('honors the write barrier during an owner reset cleanup', () => {
    localStorage.setItem(STORAGE_KEYS.progress, envelope('user-1', 10, 9));
    setActiveProgressWritesBlocked(true);
    clearActiveProgressStorage('user-1');
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(envelope('user-1', 10, 9));
  });
  it('merges divergent equal-epoch edits instead of dropping the older copy', () => {
    const withTask = (taskId: string, timestamp: number, displayName: string) => ({
      ...structuredClone(defaultState),
      pvp: {
        ...structuredClone(defaultState.pvp),
        displayName,
        taskCompletions: { [taskId]: { complete: true, timestamp } },
      },
    });
    const recovery = snapshot(100, withTask('task-a', 100, 'older'), {
      modeTimestamps: { pvp: 100 },
    });
    const active = snapshot(200, withTask('task-b', 200, 'newer'), {
      modeTimestamps: { pvp: 200 },
    });
    const selected = selectFreshestOwnerProgressSnapshot(recovery, active);
    expect(Object.keys(selected!.state.pvp.taskCompletions).sort()).toEqual(['task-a', 'task-b']);
    // The newer copy wins single-value fields and the mode clock.
    expect(selected?.state.pvp.displayName).toBe('newer');
    expect(selected?.modeTimestamps?.pvp).toBe(200);
    expect(listSupersededProgressCopies('user-1')).toHaveLength(0);
  });
  it('keeps the older mode clock when a newer equal-epoch copy contributes nothing', () => {
    const progressed = {
      ...structuredClone(defaultState),
      pvp: {
        ...structuredClone(defaultState.pvp),
        level: 9,
        taskCompletions: { 'task-a': { complete: true, timestamp: 100 } },
      },
    };
    const handoff = snapshot(100, progressed, { modeTimestamps: { pvp: 100 } });
    const placeholder = snapshot(200);
    const selected = selectFreshestOwnerProgressSnapshot(null, placeholder, handoff);
    expect(selected?.state.pvp.level).toBe(9);
    expect(selected?.modeTimestamps?.pvp).toBe(100);
  });
  it('orders an unknown mode clock by its copy write time without inventing a clock', () => {
    const named = (displayName: string) => ({
      ...structuredClone(defaultState),
      pvp: { ...structuredClone(defaultState.pvp), displayName },
    });
    const staleRecovery = snapshot(100, named('stale'), { modeTimestamps: { pvp: 100 } });
    const cloudResolved = snapshot(200, named('cloud'), { modeTimestamps: { pvp: 0 } });
    const selected = selectFreshestOwnerProgressSnapshot(staleRecovery, cloudResolved);
    expect(selected?.state.pvp.displayName).toBe('cloud');
    expect(selected?.modeTimestamps?.pvp).toBe(0);
  });
  it('keeps deletions of single-value fields from the newer equal-epoch copy', () => {
    const withFields = (displayName: string | null, skillOffsets: Record<string, number>) => ({
      ...structuredClone(defaultState),
      pvp: { ...structuredClone(defaultState.pvp), displayName, skillOffsets },
    });
    const recovery = snapshot(100, withFields('older', { Endurance: 5 }), {
      modeTimestamps: { pvp: 100 },
    });
    const active = snapshot(200, withFields(null, {}), { modeTimestamps: { pvp: 200 } });
    const selected = selectFreshestOwnerProgressSnapshot(recovery, active);
    expect(selected?.state.pvp.displayName).toBeNull();
    expect(selected?.state.pvp.skillOffsets).toEqual({});
  });
  it('archives an unknown numeric season before allowing current-season progress to win', () => {
    const unknownSeason = 0;
    const staleRaw = progressEnvelope(
      'user-1',
      1_000,
      {
        ...structuredClone(defaultState),
        seasonalSeasonNumber: unknownSeason,
        seasonal: { ...defaultState.seasonal, level: 70 },
      },
      { modeTimestamps: { seasonal: 1_000 } }
    );
    const active = parsePersistedProgressState(
      progressEnvelope(
        'user-1',
        100,
        { ...structuredClone(defaultState), seasonal: { ...defaultState.seasonal, level: 20 } },
        { modeTimestamps: { seasonal: 100 } }
      ),
      'user-1'
    );
    localStorage.setItem(recoveryKey('user-1'), staleRaw);
    const recovery = readAccountRecoveryCopy('user-1');
    const selected = selectFreshestOwnerProgressSnapshot(recovery, active);
    expect(selected?.state.seasonal.level).toBe(20);
    expect(listSupersededProgressCopies('user-1').map((copy) => copy.seasonNumber)).toContain(
      unknownSeason
    );
  });
  it('does not export stale seasonal data when the raw seasonal payload has no progress', () => {
    const raw = JSON.stringify({
      _timestamp: 1_000,
      _userId: 'user-1',
      data: {
        ...structuredClone(defaultState),
        seasonalSeasonNumber: 999,
        seasonal: null,
      },
    });
    localStorage.setItem(recoveryKey('user-1'), raw);
    expect(readAccountRecoveryCopy('user-1')?.state.seasonal).toEqual(defaultState.seasonal);
    expect(listSupersededProgressCopies('user-1')).toHaveLength(0);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe(raw);
  });
  it('excludes stale active and handoff seasonal progress when current recovery exists', () => {
    const staleSeason = 999;
    const staleRaw = progressEnvelope(
      'user-1',
      1_000,
      {
        ...structuredClone(defaultState),
        seasonalSeasonNumber: staleSeason,
        seasonal: { ...defaultState.seasonal, level: 70 },
      },
      { modeTimestamps: { seasonal: 1_000 } }
    );
    const currentRecoveryRaw = progressEnvelope(
      'user-1',
      100,
      { ...structuredClone(defaultState), seasonal: { ...defaultState.seasonal, level: 20 } },
      { modeTimestamps: { seasonal: 100 } }
    );
    const stale = parsePersistedProgressState(staleRaw, 'user-1')!;
    localStorage.setItem(recoveryKey('user-1'), currentRecoveryRaw);
    const currentRecovery = readAccountRecoveryCopy('user-1');
    expect(stale.seasonalSourceSeasonNumber).toBe(staleSeason);
    expect(
      selectFreshestOwnerProgressSnapshot(currentRecovery, stale, stale)?.state.seasonal.level
    ).toBe(20);
  });
  it('keeps unscoped legacy reset conflicts unresolved when owner export is impossible', () => {
    const legacySnapshot = (epoch: number) =>
      parsePersistedProgressState(
        JSON.stringify({
          ...structuredClone(defaultState),
          pvp: { ...defaultState.pvp, level: epoch + 1, progressEpoch: epoch },
        }),
        null
      );
    expect(selectFreshestOwnerProgressSnapshot(legacySnapshot(1), legacySnapshot(2))).toBeNull();
    expect(listSupersededProgressCopies('user-1')).toHaveLength(0);
  });
  it('blocks composition of snapshots from different owners', () => {
    const selected = selectFreshestOwnerProgressSnapshot(
      snapshot(10, structuredClone(defaultState), {}, 'user-1'),
      snapshot(20, structuredClone(defaultState), {}, 'user-2')
    );
    expect(selected).toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
  });
  it('clears only a matching owner retention block after rereading its copy', () => {
    localStorage.setItem(recoveryKey('user-1'), envelope('user-1', 10, 7));
    blockAccountRecoveryRetentionForOwner('user-1');
    setActiveProgressWritesBlocked(true);
    expect(readAccountRecoveryCopy('user-1')?.state.pvp.level).toBe(7);
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
  });
  it('retries retention from the matching recovery copy after active storage is absent', () => {
    localStorage.setItem(recoveryKey('user-1'), envelope('user-1', 10, 7));
    blockAccountRecoveryRetentionForOwner('user-1');
    setActiveProgressWritesBlocked(true);
    expect(retryBlockedAccountRecoveryRetention()).toBe(true);
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
    expect(readAccountRecoveryCopy('user-1')?.state.pvp.level).toBe(7);
  });
  it('keeps retention blocked when retry cannot read the recovery copy', () => {
    blockAccountRecoveryRetentionForOwner('user-1');
    const key = recoveryKey('user-1');
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation((requestedKey) => {
      if (requestedKey === key) throw new Error('storage denied');
      return Storage.prototype.getItem.call(localStorage, requestedKey);
    });
    expect(retryBlockedAccountRecoveryRetention()).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    getItem.mockRestore();
  });
  it('does not block sign-in when the browser refuses all storage access', () => {
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const storageAccess = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(readAccountRecoveryCopy('user-1')).toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
    storageAccess.mockRestore();
    getItem.mockRestore();
  });
  it('still fails closed when only the recovery copy read fails', () => {
    const key = recoveryKey('user-1');
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation((requestedKey) => {
      if (requestedKey === key) throw new Error('storage denied');
      return Storage.prototype.getItem.call(localStorage, requestedKey);
    });
    expect(readAccountRecoveryCopy('user-1')).toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    getItem.mockRestore();
  });
  it('treats an unreadable or blocked recovery slot as possibly holding owner changes', () => {
    expect(mayHoldAccountRecoveryCopy('user-1')).toBe(false);
    const key = recoveryKey('user-1');
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation((requestedKey) => {
      if (requestedKey === key) throw new Error('storage denied');
      return Storage.prototype.getItem.call(localStorage, requestedKey);
    });
    expect(hasAccountRecoveryCopy('user-1')).toBe(false);
    expect(mayHoldAccountRecoveryCopy('user-1')).toBe(true);
    getItem.mockRestore();
    blockAccountRecoveryRetentionForOwner('user-2');
    expect(mayHoldAccountRecoveryCopy('user-1')).toBe(true);
  });
  it('lifts the write barrier once opaque active bytes are preserved on a retry', () => {
    setActiveProgressWritesBlocked(true);
    localStorage.setItem(STORAGE_KEYS.progress, '{not json');
    expect(preserveForeignActiveCopy('user-1')).toBe(true);
    const envelope = JSON.stringify({ _userId: 'user-1', data: structuredClone(defaultState) });
    expect(persistActiveProgressValue(envelope)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(envelope);
  });
  it('keeps retention blocked when retry finds no recovery copy', () => {
    blockAccountRecoveryRetentionForOwner('user-1');
    setActiveProgressWritesBlocked(true);
    expect(retryBlockedAccountRecoveryRetention()).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
  });
  it('uses a zero seasonal clock when every available snapshot is from an old season', () => {
    const stale = snapshot(
      1_000,
      {
        ...structuredClone(defaultState),
        seasonal: { ...defaultState.seasonal, level: 1 },
      },
      { modeTimestamps: { seasonal: 1_000 } }
    );
    stale.seasonalSourceSeasonNumber = 999;
    const selected = selectFreshestOwnerProgressSnapshot(stale, null);
    expect(selected?.state.seasonal).toEqual(defaultState.seasonal);
    expect(selected?.modeTimestamps?.seasonal).toBe(0);
  });
  it('archives a displaced current-season reset epoch with its season identity', () => {
    const lowerEpoch = {
      ...structuredClone(defaultState),
      seasonal: { ...defaultState.seasonal, level: 18, progressEpoch: 1 },
    };
    const raw = progressEnvelope('user-1', 10, lowerEpoch, {
      modeTimestamps: { seasonal: 10 },
    });
    localStorage.setItem(recoveryKey('user-1'), raw);
    const higherEpoch = {
      ...structuredClone(defaultState),
      seasonal: { ...defaultState.seasonal, level: 3, progressEpoch: 2 },
    };
    expect(
      saveAccountRecoveryCopy(
        progressEnvelope('user-1', 20, higherEpoch, { modeTimestamps: { seasonal: 20 } }),
        'user-1'
      )
    ).toBe(true);
    expect(
      listSupersededProgressCopies('user-1').some(
        (copy) => copy.mode === 'seasonal' && copy.seasonNumber === ACTIVE_SEASON_NUMBER
      )
    ).toBe(true);
  });
  it.each([
    {
      existingEpoch: 1,
      existingLevel: 9,
      existingClock: 999,
      incomingEpoch: 2,
      incomingLevel: 3,
      incomingClock: 10,
      retainedLevel: 3,
      supersededLevel: 9,
    },
    {
      existingEpoch: 2,
      existingLevel: 9,
      existingClock: 10,
      incomingEpoch: 1,
      incomingLevel: 3,
      incomingClock: 999,
      retainedLevel: 9,
      supersededLevel: 3,
    },
  ])(
    'gives the higher reset epoch precedence and archives the lower-epoch copy',
    ({
      existingEpoch,
      existingLevel,
      existingClock,
      incomingEpoch,
      incomingLevel,
      incomingClock,
      retainedLevel,
      supersededLevel,
    }) => {
      const current = {
        ...structuredClone(defaultState),
        pvp: { ...defaultState.pvp, level: existingLevel, progressEpoch: existingEpoch },
      };
      const displaced = {
        ...structuredClone(defaultState),
        pvp: { ...defaultState.pvp, level: incomingLevel, progressEpoch: incomingEpoch },
      };
      localStorage.setItem(
        recoveryKey('user-1'),
        progressEnvelope('user-1', existingClock, current, {
          modeTimestamps: { pvp: existingClock },
        })
      );
      expect(
        saveAccountRecoveryCopy(
          progressEnvelope('user-1', incomingClock, displaced, {
            modeTimestamps: { pvp: incomingClock },
          }),
          'user-1'
        )
      ).toBe(true);
      const retained = readAccountRecoveryCopy('user-1');
      expect(retained?.state.pvp.progressEpoch).toBe(2);
      expect(retained?.state.pvp.level).toBe(retainedLevel);
      expect(
        listSupersededProgressCopies('user-1').some(
          (copy) => copy.mode === 'pvp' && copy.progress.level === supersededLevel
        )
      ).toBe(true);
    }
  );
  it('allows supported unscoped legacy progress to migrate to an owned envelope', () => {
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({ ...structuredClone(defaultState), pvp: { ...defaultState.pvp, level: 9 } })
    );
    const migrated = JSON.stringify({
      _userId: 'user-1',
      data: { ...structuredClone(defaultState), pvp: { ...defaultState.pvp, level: 9 } },
    });
    progressPersistStorage.setItem(STORAGE_KEYS.progress, migrated);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(migrated);
  });
  it('reports a copy that could not be written', () => {
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    expect(saveAccountRecoveryCopy(envelope('user-1', 10), 'user-1')).toBe(false);
    setItem.mockRestore();
  });
  it('fails closed when the recovery copy cannot be read', () => {
    const key = recoveryKey('user-1');
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation((requestedKey) => {
      if (requestedKey === key) throw new Error('storage denied');
      return Storage.prototype.getItem.call(localStorage, requestedKey);
    });
    expect(readAccountRecoveryCopy('user-1')).toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    getItem.mockRestore();
  });
  it('fails closed when recovery is requested without a browser window', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(readAccountRecoveryCopy('user-1')).toBeNull();
      expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('rejects corrupt recovery envelopes without treating them as owner progress', () => {
    localStorage.setItem(recoveryKey('user-1'), '{broken');
    expect(readAccountRecoveryCopy('user-1')).toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe('{broken');
  });
  it('rejects recovery envelopes scoped to a different account', () => {
    const foreign = envelope('user-1', 10, 7);
    localStorage.setItem(recoveryKey('user-2'), foreign);
    expect(readAccountRecoveryCopy('user-2')).toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    expect(localStorage.getItem(recoveryKey('user-2'))).toBe(foreign);
  });
  it('fails retention closed when reading the existing recovery slot throws', () => {
    const raw = envelope('user-1', 10, 7);
    const key = recoveryKey('user-1');
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation((requestedKey) => {
      if (requestedKey === key) throw new Error('storage denied');
      return Storage.prototype.getItem.call(localStorage, requestedKey);
    });
    expect(saveAccountRecoveryCopy(raw, 'user-1')).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    getItem.mockRestore();
  });
  it('fails closed when the owner recovery write hits quota', () => {
    const key = recoveryKey('user-1');
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((requestedKey, value) => {
      if (requestedKey === key)
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      return Storage.prototype.setItem.call(localStorage, requestedKey, value);
    });
    expect(saveAccountRecoveryCopy(envelope('user-1', 10, 7), 'user-1')).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    setItem.mockRestore();
  });
  it('retains raw stale-season progress before sanitizing a recovery envelope', () => {
    const staleSeason = 999;
    const raw = JSON.stringify({
      _timestamp: 10,
      _userId: 'user-1',
      data: {
        ...structuredClone(defaultState),
        seasonalSeasonNumber: staleSeason,
        seasonal: { ...defaultState.seasonal, level: 17, active: true },
      },
    });
    localStorage.setItem(recoveryKey('user-1'), raw);
    const recovered = readAccountRecoveryCopy('user-1');
    expect(recovered?.state.seasonal.level).toBe(defaultState.seasonal.level);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe(raw);
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
  });
  it('reads a default stale-season recovery envelope without an export copy', () => {
    const raw = JSON.stringify({
      _timestamp: 10,
      _userId: 'user-1',
      data: { ...structuredClone(defaultState), seasonalSeasonNumber: 999 },
    });
    localStorage.setItem(recoveryKey('user-1'), raw);
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) throw new Error('full');
      return Storage.prototype.setItem.call(localStorage, key, value);
    });
    expect(readAccountRecoveryCopy('user-1')).not.toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
    setItem.mockRestore();
  });
  it('keeps a stale-season recovery envelope when its export copy cannot be written', () => {
    const staleSeason = 999;
    const raw = JSON.stringify({
      _timestamp: 10,
      _userId: 'user-1',
      data: {
        ...structuredClone(defaultState),
        seasonalSeasonNumber: staleSeason,
        seasonal: { ...defaultState.seasonal, level: 17 },
      },
    });
    localStorage.setItem(recoveryKey('user-1'), raw);
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) throw new Error('full');
      return Storage.prototype.setItem.call(localStorage, key, value);
    });
    expect(readAccountRecoveryCopy('user-1')).toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe(raw);
    setItem.mockRestore();
  });
  it('does not replace a stale-season recovery copy when superseded export fails', () => {
    const staleSeason = 999;
    const raw = JSON.stringify({
      _timestamp: 10,
      _userId: 'user-1',
      data: {
        ...structuredClone(defaultState),
        seasonalSeasonNumber: staleSeason,
        seasonal: { ...defaultState.seasonal, level: 17 },
      },
    });
    localStorage.setItem(recoveryKey('user-1'), raw);
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) throw new Error('full');
      return Storage.prototype.setItem.call(localStorage, key, value);
    });
    expect(saveAccountRecoveryCopy(envelope('user-1', 20, 12), 'user-1')).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe(raw);
    setItem.mockRestore();
  });
  it('does not replace lower-epoch recovery progress when reset export fails', () => {
    const lowerEpoch = {
      ...structuredClone(defaultState),
      pvp: { ...defaultState.pvp, level: 18, progressEpoch: 1 },
    };
    const raw = progressEnvelope('user-1', 10, lowerEpoch, {
      modeTimestamps: { pvp: 10 },
    });
    localStorage.setItem(recoveryKey('user-1'), raw);
    const higherEpoch = {
      ...structuredClone(defaultState),
      pvp: { ...defaultState.pvp, level: 3, progressEpoch: 2 },
    };
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) throw new Error('full');
      return Storage.prototype.setItem.call(localStorage, key, value);
    });
    expect(
      saveAccountRecoveryCopy(
        progressEnvelope('user-1', 20, higherEpoch, { modeTimestamps: { pvp: 20 } }),
        'user-1'
      )
    ).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe(raw);
    setItem.mockRestore();
  });
  it('does not discard incoming lower-epoch progress when its export fails', () => {
    const higherEpoch = {
      ...structuredClone(defaultState),
      pvp: { ...defaultState.pvp, level: 18, progressEpoch: 2 },
    };
    const raw = progressEnvelope('user-1', 10, higherEpoch, {
      modeTimestamps: { pvp: 10 },
    });
    localStorage.setItem(recoveryKey('user-1'), raw);
    const lowerEpoch = {
      ...structuredClone(defaultState),
      pvp: { ...defaultState.pvp, level: 3, progressEpoch: 1 },
    };
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) throw new Error('full');
      return Storage.prototype.setItem.call(localStorage, key, value);
    });
    expect(
      saveAccountRecoveryCopy(
        progressEnvelope('user-1', 20, lowerEpoch, { modeTimestamps: { pvp: 20 } }),
        'user-1'
      )
    ).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    expect(localStorage.getItem(recoveryKey('user-1'))).toBe(raw);
    setItem.mockRestore();
  });
  it('removes a recovery copy for its owner only', () => {
    saveAccountRecoveryCopy(envelope('user-1', 10), 'user-1');
    saveAccountRecoveryCopy(envelope('user-2', 10), 'user-2');
    removeAccountRecoveryCopy('user-1');
    expect(hasAccountRecoveryCopy('user-1')).toBe(false);
    expect(hasAccountRecoveryCopy('user-2')).toBe(true);
  });
  it('preserves a foreign active copy but not the current or guest copy', () => {
    localStorage.setItem(STORAGE_KEYS.progress, envelope('user-1', 10));
    preserveForeignActiveCopy('user-1');
    expect(hasAccountRecoveryCopy('user-1')).toBe(false);
    preserveForeignActiveCopy('user-2');
    expect(hasAccountRecoveryCopy('user-1')).toBe(true);
    localStorage.setItem(STORAGE_KEYS.progress, envelope(null, 10));
    preserveForeignActiveCopy('user-2');
    expect(Object.keys(localStorage)).toHaveLength(2);
  });
  it('quarantines malformed foreign data instead of creating a normalized recovery copy', () => {
    const raw = JSON.stringify({
      _userId: 'user-2',
      _timestamp: Date.now() + 60_000_000,
      data: null,
    });
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    expect(preserveForeignActiveCopy('user-1')).toBe(true);
    expect(hasAccountRecoveryCopy('user-2')).toBe(false);
    const quarantineKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
    );
    expect(quarantineKeys).toHaveLength(1);
    expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
  });
  it('quarantines an envelope whose raw owner id has an invalid type', () => {
    const raw = JSON.stringify({
      _userId: 123,
      _timestamp: 10,
      data: structuredClone(defaultState),
    });
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    expect(preserveForeignActiveCopy('user-1')).toBe(true);
    expect(hasAccountRecoveryCopy('user-1')).toBe(false);
    expect(hasAccountRecoveryCopy('123')).toBe(false);
    const quarantineKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
    );
    expect(quarantineKeys).toHaveLength(1);
    expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
  });
  it('quarantines a scoped envelope that omits its owner id', () => {
    const raw = JSON.stringify({ data: structuredClone(defaultState) });
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    expect(preserveForeignActiveCopy('user-1')).toBe(true);
    expect(hasAccountRecoveryCopy('user-1')).toBe(false);
    const quarantineKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
    );
    expect(quarantineKeys).toHaveLength(1);
    expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
  });
  it('quarantines a scoped envelope with an empty owner id', () => {
    const raw = JSON.stringify({ _userId: '', data: structuredClone(defaultState) });
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    expect(preserveForeignActiveCopy('user-1')).toBe(true);
    expect(hasAccountRecoveryCopy('user-1')).toBe(false);
    const quarantineKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
    );
    expect(quarantineKeys).toHaveLength(1);
    expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
  });
  it.each([
    [null, null, null],
    [10, null, 10],
    [20, 10, 20],
    [10, 20, 20],
    [10, 10, 10],
  ])(
    'selects the freshest recovery %s or active %s snapshot -> %s',
    (recovery, active, expected) => {
      const selected = selectFreshestOwnerProgressSnapshot(
        recovery === null ? null : snapshot(recovery),
        active === null ? null : snapshot(active)
      );
      expect(selected?.timestamp ?? null).toBe(expected);
    }
  );
  it.each([
    [30, 20, 10, 30],
    [30, 20, 40, 40],
    [30, 50, 40, 50],
  ])(
    'selects the newest recovery, active, or handoff snapshot (%s, %s, %s)',
    (recovery, active, handoff, expected) => {
      const selected = selectFreshestOwnerProgressSnapshot(
        snapshot(recovery),
        snapshot(active),
        snapshot(handoff)
      );
      expect(selected?.timestamp ?? null).toBe(expected);
    }
  );
});
describe('storage pressure relief', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('selects only backups identical to a retained copy or to a newer backup', () => {
    const backup = (owner: string, createdAt: number) =>
      `${STORAGE_KEYS.progressBackupPrefix}${owner}_${createdAt}`;
    const redundant = findRedundantProgressBackups([
      { key: STORAGE_KEYS.progress, value: 'active' },
      { key: recoveryKey('user-1'), value: 'recovery' },
      { key: backup('user-1', 1), value: 'active' },
      { key: backup('user-1', 2), value: 'recovery' },
      { key: backup('user-2', 3), value: 'unique-old' },
      { key: backup('user-2', 5), value: 'dup' },
      { key: backup('user-2', 4), value: 'dup' },
      { key: `progress_backup_2026-01-01T00:00:00.000Z`, value: 'legacy-unique' },
      { key: 'unrelated', value: 'dup' },
    ]);
    expect(redundant.sort()).toEqual(
      [backup('user-1', 1), backup('user-1', 2), backup('user-2', 4)].sort()
    );
  });
  it('never removes recovery copies or unique backups under quota pressure', () => {
    const big = 'x'.repeat(4.7 * 1024 * 1024);
    localStorage.setItem(recoveryKey('user-1'), big);
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-1_1`, big.slice(0, 10));
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-1_2`, big.slice(0, 10));
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-2_3`, 'unique');
    relieveProgressStoragePressure(100_000);
    expect(localStorage.getItem(recoveryKey('user-1'))).not.toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.progressBackupPrefix}user-1_2`)).not.toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.progressBackupPrefix}user-1_1`)).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.progressBackupPrefix}user-2_3`)).toBe('unique');
  });
  it('leaves storage untouched when there is room', () => {
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-1_1`, 'same');
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-1_2`, 'same');
    relieveProgressStoragePressure(100);
    expect(Object.keys(localStorage)).toHaveLength(2);
  });
});
