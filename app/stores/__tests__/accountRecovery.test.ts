// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import {
  hasAccountRecoveryCopy,
  isAccountRecoveryRetentionBlocked,
  preserveForeignActiveCopy,
  readAccountRecoveryCopy,
  removeAccountRecoveryCopy,
  saveAccountRecoveryCopy,
  selectFreshestOwnerProgressSnapshot,
} from '@/stores/tarkov/accountRecovery';
import { progressPersistStorage } from '@/stores/tarkov/localStorage';
import {
  findRedundantProgressBackups,
  relieveProgressStoragePressure,
} from '@/stores/tarkov/storageQuota';
import { STORAGE_KEYS } from '@/utils/storageKeys';
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
const recoveryKey = (userId: string) => `${STORAGE_KEYS.progressRecoveryPrefix}${userId}`;
const snapshot = (timestamp: number | null): PersistedProgressSnapshot => ({
  hadDeprecatedProgressData: false,
  state: structuredClone(defaultState),
  storedUserId: 'user-1',
  timestamp,
});
describe('account recovery copies', () => {
  beforeEach(() => {
    localStorage.clear();
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
