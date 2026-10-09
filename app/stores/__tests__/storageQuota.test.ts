// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeGetItem, safeRemoveItem } from '@/stores/tarkov/localStorage';
import {
  findRedundantProgressBackups,
  relieveProgressStoragePressure,
} from '@/stores/tarkov/storageQuota';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/stores/tarkov/localStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/tarkov/localStorage')>();
  return {
    ...actual,
    safeGetItem: vi.fn(actual.safeGetItem),
    safeRemoveItem: vi.fn(actual.safeRemoveItem),
  };
});
describe('progress storage quota relief', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it('treats malformed legacy backup dates as oldest and keeps unique copies', () => {
    const olderKey = 'progress_backup_not-a-date';
    const newerKey = `${STORAGE_KEYS.progressBackupPrefix}user-1_100`;
    expect(
      findRedundantProgressBackups([
        { key: olderKey, value: 'same' },
        { key: newerKey, value: 'same' },
        { key: 'progress_backup_invalid', value: 'unique' },
      ])
    ).toEqual([olderKey]);
  });
  it('prunes an older ISO-dated duplicate while retaining the newer backup', () => {
    const olderKey = 'progress_backup_2026-01-01T00:00:00.000Z';
    const newerKey = 'progress_backup_2026-01-02T00:00:00.000Z';
    expect(
      findRedundantProgressBackups([
        { key: olderKey, value: 'same-progress' },
        { key: newerKey, value: 'same-progress' },
      ])
    ).toEqual([olderKey]);
  });
  it('logs storage enumeration failures and leaves stored copies untouched', () => {
    const backupKey = `${STORAGE_KEYS.progressBackupPrefix}user-1_100`;
    localStorage.setItem(backupKey, 'backup');
    const key = vi.spyOn(localStorage, 'key').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    relieveProgressStoragePressure(100);
    expect(localStorage.getItem(backupKey)).toBe('backup');
    expect(logger.error).toHaveBeenCalledWith(
      '[TarkovStore] Error managing localStorage quota:',
      expect.any(Error)
    );
    key.mockRestore();
  });
  it('never prunes a backup when both it and active progress cannot be read', () => {
    const activeKey = STORAGE_KEYS.progress;
    const backupKey = `${STORAGE_KEYS.progressBackupPrefix}user-1_100`;
    localStorage.setItem(activeKey, 'active-progress');
    localStorage.setItem(backupKey, 'only-backup-copy');
    vi.mocked(safeGetItem).mockReturnValue(null);
    relieveProgressStoragePressure(5 * 1024 * 1024);
    expect(safeGetItem).toHaveBeenCalledWith(activeKey);
    expect(safeGetItem).toHaveBeenCalledWith(backupKey);
    expect(safeRemoveItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(backupKey)).toBe('only-backup-copy');
  });
  it('never prunes opaque progress quarantine during quota relief', () => {
    const quarantineKey = `${STORAGE_KEYS.progressQuarantinePrefix}opaque_0`;
    const raw = '{unparseable active bytes';
    localStorage.setItem(quarantineKey, raw);
    relieveProgressStoragePressure(5 * 1024 * 1024);
    expect(localStorage.getItem(quarantineKey)).toBe(raw);
    expect(safeRemoveItem).not.toHaveBeenCalledWith(quarantineKey);
  });
});
vi.mock('@/stores/tarkov/progressAuthority', async () => {
  const { createProgressPolicyAuthority } = await import('#tests/test-helpers/progressAuthority');
  return createProgressPolicyAuthority();
});
