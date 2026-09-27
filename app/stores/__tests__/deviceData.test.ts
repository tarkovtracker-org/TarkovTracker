// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isAccountRecoveryRetentionBlocked,
  resetAccountRecoveryRetentionBlock,
} from '@/stores/tarkov/accountRecovery';
import {
  clearDeviceDataRemoval,
  isDeviceDataRemovalPending,
  removeAccountDeviceData,
  requestDeviceDataRemoval,
} from '@/stores/tarkov/deviceData';
import { setActiveProgressWritesBlocked } from '@/stores/tarkov/localStorage';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const owned = (userId: string | null) => JSON.stringify({ _userId: userId, data: {} });
describe('device data removal', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    localStorage.clear();
    clearDeviceDataRemoval();
    resetAccountRecoveryRetentionBlock();
    setActiveProgressWritesBlocked(false);
  });
  it('removes every copy owned by the account and nothing else', () => {
    localStorage.setItem(STORAGE_KEYS.progress, owned('user-1'));
    localStorage.setItem(STORAGE_KEYS.preferences, owned('user-1'));
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`, owned('user-1'));
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-2`, owned('user-2'));
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-1_10`, owned('user-1'));
    localStorage.setItem(`${LEGACY_STORAGE_KEYS.progressBackupPrefix}user-1_11`, owned('user-1'));
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-10_12`, owned('user-10'));
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}anonymous_13`, owned(null));
    expect(removeAccountDeviceData('user-1')).toBe(true);
    expect(Object.keys(localStorage).sort()).toEqual(
      [
        `${STORAGE_KEYS.progressRecoveryPrefix}user-2`,
        `${STORAGE_KEYS.progressBackupPrefix}user-10_12`,
        `${STORAGE_KEYS.progressBackupPrefix}anonymous_13`,
      ].sort()
    );
  });
  it('removes legacy timestamp-named backups by their stored owner', () => {
    const legacyTimestampBackup = `${LEGACY_STORAGE_KEYS.progressBackupPrefix}2026-01-01T00:00:00.000Z`;
    localStorage.setItem(legacyTimestampBackup, owned('user-1'));
    localStorage.setItem(
      `${LEGACY_STORAGE_KEYS.progressBackupPrefix}2026-01-02T00:00:00.000Z`,
      owned('user-2')
    );
    expect(removeAccountDeviceData('user-1')).toBe(true);
    expect(localStorage.getItem(legacyTimestampBackup)).toBeNull();
    expect(
      localStorage.getItem(`${LEGACY_STORAGE_KEYS.progressBackupPrefix}2026-01-02T00:00:00.000Z`)
    ).not.toBeNull();
  });
  it('reports incomplete cleanup and keeps retention blocked when any owned delete fails', () => {
    const activeKey = STORAGE_KEYS.progress;
    const recoveryKey = `${STORAGE_KEYS.progressRecoveryPrefix}user-1`;
    localStorage.setItem(activeKey, owned('user-1'));
    localStorage.setItem(recoveryKey, owned('user-1'));
    const originalRemove = localStorage.removeItem.bind(localStorage);
    vi.spyOn(localStorage, 'removeItem').mockImplementation((key: string) => {
      if (key === recoveryKey) throw new Error('storage unavailable');
      return originalRemove(key);
    });
    expect(removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(activeKey)).toBeNull();
    expect(localStorage.getItem(recoveryKey)).not.toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
  });
  it('keeps active copies that belong to another account or a guest', () => {
    localStorage.setItem(STORAGE_KEYS.progress, owned(null));
    localStorage.setItem(STORAGE_KEYS.preferences, owned('user-2'));
    removeAccountDeviceData('user-1');
    expect(localStorage.getItem(STORAGE_KEYS.progress)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).not.toBeNull();
  });
  it('tracks a pending removal for one owner until cleared', () => {
    expect(isDeviceDataRemovalPending('user-1')).toBe(false);
    requestDeviceDataRemoval('user-1');
    expect(isDeviceDataRemovalPending('user-1')).toBe(true);
    expect(isDeviceDataRemovalPending('user-2')).toBe(false);
    expect(isDeviceDataRemovalPending(null)).toBe(false);
    clearDeviceDataRemoval();
    expect(isDeviceDataRemovalPending('user-1')).toBe(false);
  });
});
