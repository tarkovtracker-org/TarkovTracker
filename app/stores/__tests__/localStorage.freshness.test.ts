// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import { createProgressStorageSerializer } from '@/stores/tarkov/localStorage';
import { resolveInitialSyncState } from '@/stores/tarkov/resetEngine';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
describe('local mode freshness', () => {
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
