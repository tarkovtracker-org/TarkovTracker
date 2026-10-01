// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import {
  createProgressStorageSerializer,
  parsePersistedProgressState,
  progressPersistStorage,
} from '@/stores/tarkov/localStorage';
import { resolveInitialSyncState } from '@/stores/tarkov/resetEngine';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
describe('local mode freshness', () => {
  it('retains the same-account baseline across repeated failures and isolates other accounts', () => {
    const state = structuredClone(defaultState);
    const readPrevious = vi.fn((userId: string | null) => ({
      state: structuredClone(state),
      storedUserId: userId,
      timestamp: 10,
      hadDeprecatedProgressData: false,
    }));
    const serializer = createProgressStorageSerializer(readPrevious);
    serializer.retainBaseline('user-1');
    state.pve.displayName = 'Other tab';
    serializer.retainBaseline('user-1');
    const local = structuredClone(defaultState);
    local.pvp.level = 42;
    const saved = parseUserScopedStorage<typeof local>(serializer.serialize(local, 'user-1', 30))!;
    expect(saved._modeTimestamps).toEqual({ pvp: 30, pve: 10, seasonal: 10 });
    expect(saved._metadataTimestamp).toBe(10);
    expect(readPrevious).toHaveBeenCalledTimes(1);
    serializer.retainBaseline('user-2');
    expect(readPrevious).toHaveBeenLastCalledWith('user-2');
    serializer.reset();
    serializer.retainBaseline('user-2');
    expect(readPrevious).toHaveBeenCalledTimes(3);
  });
  it('keeps the original seasonal source across migration and resets stale clocks to zero', () => {
    const staleSeasonal = {
      ...structuredClone(defaultState),
      seasonalSeasonNumber: 999,
      seasonal: { ...defaultState.seasonal, level: 17 },
    };
    const raw = JSON.stringify({
      _timestamp: 1_000,
      _modeTimestamps: { pvp: 1_000, pve: 1_000, seasonal: 1_000 },
      _userId: 'user-1',
      data: staleSeasonal,
    });
    const parsed = parsePersistedProgressState(raw, 'user-1')!;
    expect(parsed.seasonalSourceSeasonNumber).toBe(999);
    expect(parsed.state.seasonalSeasonNumber).toBe(ACTIVE_SEASON_NUMBER);
    expect(parsed.state.seasonal.level).toBe(defaultState.seasonal.level);
    const serializer = createProgressStorageSerializer(() => null);
    serializer.reset(parsed);
    const saved = parseUserScopedStorage(serializer.serialize(parsed.state, 'user-1', 1_001))!;
    expect(saved._modeTimestamps?.seasonal).toBe(0);
  });
  it('records legacy seasonal source provenance before sanitizing it', () => {
    const raw = JSON.stringify({
      ...structuredClone(defaultState),
      seasonalSeasonNumber: 999,
      seasonal: { ...defaultState.seasonal, level: 17 },
    });
    const parsed = parsePersistedProgressState(raw, null)!;
    expect(parsed.seasonalSourceSeasonNumber).toBe(999);
    expect(parsed.state.seasonalSeasonNumber).toBe(ACTIVE_SEASON_NUMBER);
    expect(parsed.state.seasonal.level).toBe(defaultState.seasonal.level);
  });
  it('defaults missing season metadata to the active season in snapshots and legacy data', () => {
    const stateWithoutSeason = structuredClone(defaultState);
    delete stateWithoutSeason.seasonalSeasonNumber;
    const serializer = createProgressStorageSerializer(() => null);
    const wrapped = serializer.serialize(stateWithoutSeason, 'user-1', 10);
    expect(parsePersistedProgressState(wrapped, 'user-1')?.seasonalSourceSeasonNumber).toBe(
      ACTIVE_SEASON_NUMBER
    );
    const legacy = JSON.stringify(stateWithoutSeason);
    expect(parsePersistedProgressState(legacy, null)?.seasonalSourceSeasonNumber).toBe(
      ACTIVE_SEASON_NUMBER
    );
  });
  it('does not write through the persistence adapter when window is unavailable', () => {
    vi.stubGlobal('window', undefined);
    try {
      progressPersistStorage.setItem('non-progress-key', 'value');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(localStorage.getItem('non-progress-key')).toBeNull();
  });
  it('timestamps only changed modes and ignores other tabs overwriting storage', () => {
    const stored = {
      state: structuredClone(defaultState),
      timestamp: 10,
      storedUserId: 'user-1',
      hadDeprecatedProgressData: false,
    };
    const read = vi.fn(() => stored);
    const serializer = createProgressStorageSerializer(read);
    const local = structuredClone(defaultState);
    serializer.serialize(local, 'user-1', 20);
    stored.state.pve.level = 25;
    local.pvp.level = 2;
    const parsed = parseUserScopedStorage(serializer.serialize(local, 'user-1', 30));
    expect(parsed?._modeTimestamps).toEqual({ pvp: 30, pve: 10, seasonal: 10 });
    local.gameEdition = 4;
    expect(
      parseUserScopedStorage(serializer.serialize(local, 'user-1', 40))?._modeTimestamps
    ).toEqual({ pvp: 30, pve: 10, seasonal: 10 });
    expect(read).toHaveBeenCalledOnce();
  });
  it('keeps remote hydration clocks so a later remote snapshot wins after reload', () => {
    const local = structuredClone(defaultState);
    const serializer = createProgressStorageSerializer(() => ({
      state: local,
      timestamp: 10,
      storedUserId: 'user-1',
      hadDeprecatedProgressData: false,
    }));
    serializer.serialize(local, 'user-1', 10);
    const remote = structuredClone(local);
    remote.pvp.displayName = 'snapshot at 20';
    serializer.acceptRemote({
      state: local,
      userId: 'user-1',
      remote,
      next: remote,
      updatedAtByMode: { pvp: 20, pve: 10, seasonal: 10 },
    });
    const persisted = parseUserScopedStorage<typeof local>(
      serializer.serialize(remote, 'user-1', 40)
    )!;
    expect(persisted._modeTimestamps).toEqual({ pvp: 20, pve: 10, seasonal: 10 });
    const newer = structuredClone(remote);
    newer.pvp.displayName = 'newer at 30';
    const resolved = resolveInitialSyncState(persisted.data, newer, 40, 10, 1, 1, {
      mergeModeSnapshots: true,
      localModeTimestamps: persisted._modeTimestamps,
      modeUpdatedAt: { pvp: 30, pve: 10, seasonal: 10 },
    });
    expect(resolved.pvp.displayName).toBe('newer at 30');
  });
  it('persists no-op acknowledgements before reload without another state mutation', () => {
    const local = structuredClone(defaultState);
    local.pvp.displayName = 'acknowledged';
    local.gameEdition = 2;
    let stored: string;
    const serializer = createProgressStorageSerializer(
      () => null,
      (value) => {
        stored = value;
      }
    );
    stored = serializer.serialize(local, 'user-1', 100);
    serializer.acceptRemote({
      state: local,
      userId: 'user-1',
      remote: local,
      next: local,
      updatedAtByMode: { pvp: 20, pve: 20, seasonal: 20 },
      metadataTimestamp: 20,
    });
    const persisted = parseUserScopedStorage<typeof local>(stored)!;
    expect(persisted._modeTimestamps?.pvp).toBe(20);
    expect(persisted._metadataTimestamp).toBe(20);
    const newer = structuredClone(local);
    newer.pvp.displayName = 'newer server edit';
    newer.gameEdition = 3;
    const resolved = resolveInitialSyncState(
      persisted.data,
      newer,
      persisted._metadataTimestamp!,
      30,
      1,
      1,
      {
        mergeModeSnapshots: true,
        localModeTimestamps: persisted._modeTimestamps,
        modeUpdatedAt: { pvp: 30, pve: 20, seasonal: 20 },
      }
    );
    expect(resolved.pvp.displayName).toBe('newer server edit');
    expect(resolved.gameEdition).toBe(3);
  });
  it('does not let a stale tab acknowledgement replace newer same-user storage', () => {
    const local = structuredClone(defaultState);
    let stored = {
      state: structuredClone(local),
      storedUserId: 'user-1',
      timestamp: 10,
      metadataTimestamp: 10,
      modeTimestamps: { pvp: 10, pve: 10, seasonal: 10 },
      hadDeprecatedProgressData: false,
    };
    const persist = vi.fn();
    const serializer = createProgressStorageSerializer(() => structuredClone(stored), persist);
    serializer.serialize(local, 'user-1', 10);
    stored.state.pvp.displayName = 'another tab pending edit';
    stored.modeTimestamps.pvp = 30;
    serializer.acceptRemote({
      state: local,
      userId: 'user-1',
      remote: { gameEdition: local.gameEdition },
      next: { gameEdition: local.gameEdition },
      updatedAtByMode: {},
      metadataTimestamp: 20,
    });
    expect(persist).not.toHaveBeenCalled();
    expect(stored.state.pvp.displayName).toBe('another tab pending edit');
    // Even equal data can carry an independently newer edit clock.
    stored = { ...stored, state: structuredClone(local), metadataTimestamp: 20 };
    serializer.acceptRemote({
      state: local,
      userId: 'user-1',
      remote: { gameEdition: local.gameEdition },
      next: { gameEdition: local.gameEdition },
      updatedAtByMode: {},
      metadataTimestamp: 25,
    });
    expect(persist).not.toHaveBeenCalled();
  });
  it('preserves local edit freshness when remote hydration keeps pending fields', () => {
    const local = structuredClone(defaultState);
    const serializer = createProgressStorageSerializer(() => null);
    serializer.serialize(local, 'user-1', 10);
    local.pvp.displayName = 'pending';
    serializer.serialize(local, 'user-1', 30);
    const remote = structuredClone(local);
    remote.pvp.displayName = 'remote';
    remote.pvp.level = 2;
    const next = structuredClone(remote);
    next.pvp.displayName = 'pending';
    serializer.acceptRemote({
      state: local,
      userId: 'user-1',
      remote,
      next,
      updatedAtByMode: { pvp: 20, pve: 10, seasonal: 10 },
    });
    expect(
      parseUserScopedStorage(serializer.serialize(next, 'user-1', 40))?._modeTimestamps?.pvp
    ).toBe(30);
  });
  it('keeps mixed pending fields newer than the snapshot that supplied unrelated changes', () => {
    const local = structuredClone(defaultState);
    const serializer = createProgressStorageSerializer(() => null);
    serializer.serialize(local, 'user-1', 10);
    local.pvp.displayName = 'pending name';
    local.gameEdition = 4;
    serializer.serialize(local, 'user-1', 20);
    const remote = structuredClone(defaultState);
    remote.pvp.level = 3;
    remote.currentGameMode = 'pve';
    const next = structuredClone(remote);
    next.pvp.displayName = 'pending name';
    next.gameEdition = 4;
    serializer.acceptRemote({
      state: local,
      userId: 'user-1',
      remote,
      next,
      updatedAtByMode: { pvp: 30, pve: 30, seasonal: 30 },
      metadataTimestamp: 30,
    });
    const persisted = parseUserScopedStorage<typeof local>(
      serializer.serialize(next, 'user-1', 40)
    )!;
    const restored = resolveInitialSyncState(
      persisted.data,
      remote,
      persisted._metadataTimestamp!,
      30,
      1,
      1,
      {
        mergeModeSnapshots: true,
        localModeTimestamps: persisted._modeTimestamps,
        modeUpdatedAt: { pvp: 30, pve: 30, seasonal: 30 },
      }
    );
    expect(restored.pvp.displayName).toBe('pending name');
    expect(restored.pvp.level).toBe(3);
    expect(restored.gameEdition).toBe(4);
    expect(restored.currentGameMode).toBe('pve');
  });
  it('does not let a recent PvP edit make stale PvE fields win at startup', () => {
    const local = structuredClone(defaultState);
    local.pve.displayName = 'stale';
    const storedState = structuredClone(local);
    const serializer = createProgressStorageSerializer(() => ({
      state: storedState,
      timestamp: 10,
      storedUserId: 'user-1',
      hadDeprecatedProgressData: false,
    }));
    local.pvp.displayName = 'local';
    const persisted = parseUserScopedStorage<typeof local>(
      serializer.serialize(local, 'user-1', 40)
    )!;
    const remote = structuredClone(defaultState);
    remote.pve.displayName = 'newer remote';
    const resolved = resolveInitialSyncState(local, remote, 40, 20, 1, 1, {
      mergeModeSnapshots: true,
      localModeTimestamps: persisted._modeTimestamps,
      modeUpdatedAt: { pvp: 20, pve: 30 },
    });
    expect(resolved.pvp.displayName).toBe('local');
    expect(resolved.pve.displayName).toBe('newer remote');
  });
  it('retains account freshness through hydration and unrelated mode edits', () => {
    const local = structuredClone(defaultState);
    const serializer = createProgressStorageSerializer(() => null);
    serializer.serialize(local, 'user-1', 10);
    const remote = structuredClone(local);
    remote.gameEdition = 2;
    serializer.acceptRemote({
      state: local,
      userId: 'user-1',
      remote,
      next: remote,
      updatedAtByMode: { pvp: 10, pve: 10, seasonal: 10 },
      metadataTimestamp: 20,
    });
    remote.pvp.level = 3;
    const persisted = parseUserScopedStorage<typeof local>(
      serializer.serialize(remote, 'user-1', 40)
    )!;
    expect(persisted._metadataTimestamp).toBe(20);
    expect(persisted._modeTimestamps?.pvp).toBe(40);
    const newer = structuredClone(remote);
    newer.gameEdition = 3;
    expect(
      resolveInitialSyncState(remote, newer, persisted._metadataTimestamp!, 30, 1, 1, {
        localModeTimestamps: persisted._modeTimestamps,
      }).gameEdition
    ).toBe(3);
    remote.gameEdition = 4;
    expect(
      parseUserScopedStorage(serializer.serialize(remote, 'user-1', 50))?._metadataTimestamp
    ).toBe(50);
  });
  it('restores preserved owner clocks after guest storage replaced the envelope', () => {
    const serializer = createProgressStorageSerializer(() => null);
    const owner = structuredClone(defaultState);
    owner.pvp.displayName = 'local pending';
    const preserved = {
      state: owner,
      storedUserId: 'user-1',
      timestamp: 30,
      metadataTimestamp: 10,
      modeTimestamps: { pvp: 30, pve: 10, seasonal: 10 },
      hadDeprecatedProgressData: false,
    };
    serializer.serialize(defaultState, null, 40);
    serializer.reset(preserved);
    const restored = parseUserScopedStorage(serializer.serialize(owner, 'user-1', 50));
    expect(restored?._modeTimestamps).toEqual(preserved.modeTimestamps);
    expect(restored?._metadataTimestamp).toBe(10);
  });
  it('does not reuse another user clocks and reloads persisted clocks after hydration', () => {
    const read = vi.fn(() => null);
    const serializer = createProgressStorageSerializer(read);
    serializer.serialize(defaultState, 'user-1', 10);
    expect(
      parseUserScopedStorage(serializer.serialize(defaultState, 'user-2', 20))?._modeTimestamps
    ).toEqual({ pvp: 20, pve: 20, seasonal: 20 });
    serializer.reset();
    serializer.serialize(defaultState, 'user-2', 30);
    expect(read).toHaveBeenCalledTimes(3);
  });
  it('retains only finite nonnegative clocks from persisted envelopes', () => {
    const parsed = parseUserScopedStorage(
      JSON.stringify({
        _userId: 'user-1',
        data: {},
        _modeTimestamps: { pvp: 20, pve: -1, seasonal: 'wrong' },
      })
    );
    expect(parsed?._modeTimestamps).toEqual({ pvp: 20 });
  });
});
