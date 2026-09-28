// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
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
import {
  progressPersistStorage,
  setActiveProgressWritesBlocked,
} from '@/stores/tarkov/localStorage';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const owned = (userId: string | null) =>
  JSON.stringify({ _userId: userId, data: structuredClone(defaultState) });
describe('device data removal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
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
  it('reports incomplete backup cleanup while allowing guest saves after active removal', () => {
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
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    expect(localStorage.getItem(activeKey)).toBe(owned(null));
  });
  it('keeps writes blocked when the owned active envelope cannot be removed', () => {
    localStorage.setItem(STORAGE_KEYS.progress, owned('user-1'));
    const removeItemSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.progress) throw new Error('storage unavailable');
      return Storage.prototype.removeItem.call(localStorage, key);
    });
    const setItemSpy = vi
      .spyOn(localStorage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key.startsWith(STORAGE_KEYS.progressRecoveryPrefix)) throw new Error('storage full');
        return Storage.prototype.setItem.call(localStorage, key, value);
      });
    expect(removeAccountDeviceData('user-1')).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned('user-1'));
    removeItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
  it('keeps active copies that belong to another account or a guest', () => {
    localStorage.setItem(STORAGE_KEYS.progress, owned(null));
    localStorage.setItem(STORAGE_KEYS.preferences, owned('user-2'));
    removeAccountDeviceData('user-1');
    expect(localStorage.getItem(STORAGE_KEYS.progress)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).not.toBeNull();
  });
  it('leaves an unreadable active envelope owned by another account untouched', () => {
    const raw = JSON.stringify({ _userId: 'user-2', data: null });
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    expect(removeAccountDeviceData('user-1')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(
      Object.keys(localStorage).some((key) => key.startsWith(STORAGE_KEYS.progressQuarantinePrefix))
    ).toBe(false);
  });
  it.each([
    { kind: 'malformed JSON', raw: '{malformed' },
    { kind: 'obsolete scoped envelope', raw: JSON.stringify({ _userId: 'user-1', _timestamp: 7 }) },
    {
      kind: 'scoped envelope with null data',
      raw: JSON.stringify({ _userId: 'user-1', data: null }),
    },
    {
      kind: 'scoped envelope with invalid data type',
      raw: JSON.stringify({ _userId: 'user-1', data: 'bad' }),
    },
    {
      kind: 'scoped envelope with only unknown data fields',
      raw: JSON.stringify({ _userId: 'user-1', data: { futureOnlyField: true } }),
    },
  ])('quarantines $kind before replacement without assigning an owner', ({ raw }) => {
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned(null));
    const quarantineKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
    );
    expect(quarantineKeys).toHaveLength(1);
    expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
    expect(Object.keys(localStorage)).not.toContain(`${STORAGE_KEYS.progressRecoveryPrefix}null`);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned(null));
  });
  const quarantinedValueKeys = () =>
    Object.keys(localStorage).filter(
      (key) =>
        key.startsWith(STORAGE_KEYS.progressQuarantinePrefix) &&
        !key.startsWith(STORAGE_KEYS.progressQuarantineRemovalMarkerPrefix)
    );
  it.each(['{malformed', JSON.stringify({ _userId: '', data: null })])(
    'releases unattributable active bytes only after quarantine and stays incomplete on retry',
    (raw) => {
      localStorage.setItem(STORAGE_KEYS.progress, raw);
      expect(removeAccountDeviceData('user-1')).toBe(false);
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
      const quarantineKeys = quarantinedValueKeys();
      expect(quarantineKeys).toHaveLength(1);
      expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
      expect(isAccountRecoveryRetentionBlocked()).toBe(false);
      progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned(null));
      // The quarantine has no provable owner, so a retry must not report completion.
      expect(removeAccountDeviceData('user-1')).toBe(false);
      expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
      // Other accounts are not held back by this owner's unattributable bytes.
      expect(removeAccountDeviceData('user-2')).toBe(true);
      localStorage.removeItem(quarantineKeys[0]!);
      expect(removeAccountDeviceData('user-1')).toBe(true);
      expect(
        localStorage.getItem(`${STORAGE_KEYS.progressQuarantineRemovalMarkerPrefix}user-1`)
      ).toBeNull();
    }
  );
  it('deletes malformed active bytes that name the removing owner without quarantine', () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: 'user-1', data: null }));
    expect(removeAccountDeviceData('user-1')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
    expect(quarantinedValueKeys()).toHaveLength(0);
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
  });
  it('treats an unreadable quarantine marker as incomplete', () => {
    localStorage.setItem(
      `${STORAGE_KEYS.progressQuarantineRemovalMarkerPrefix}user-1`,
      `${STORAGE_KEYS.progressQuarantinePrefix}missing`
    );
    const getItem = localStorage.getItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => {
      if (key.startsWith(STORAGE_KEYS.progressQuarantineRemovalMarkerPrefix)) {
        throw new Error('read blocked');
      }
      return getItem(key);
    });
    expect(removeAccountDeviceData('user-1')).toBe(false);
    spy.mockRestore();
    expect(removeAccountDeviceData('user-1')).toBe(true);
  });
  it('retries an incomplete removal for the captured owner only', async () => {
    const {
      clearIncompleteDeviceDataRemoval,
      incompleteDeviceDataRemovalOwner,
      markDeviceDataRemovalIncomplete,
      retryIncompleteDeviceDataRemoval,
    } = await import('@/stores/tarkov/deviceData');
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`, owned('user-1'));
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-2`, owned('user-2'));
    markDeviceDataRemovalIncomplete('user-1');
    clearIncompleteDeviceDataRemoval('user-2');
    expect(incompleteDeviceDataRemovalOwner.value).toBe('user-1');
    expect(retryIncompleteDeviceDataRemoval()).toBe(true);
    expect(incompleteDeviceDataRemovalOwner.value).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-2`)).toBe(
      owned('user-2')
    );
    markDeviceDataRemovalIncomplete('user-1');
    clearIncompleteDeviceDataRemoval('user-1');
    expect(incompleteDeviceDataRemovalOwner.value).toBeNull();
  });
  it('fails closed when opaque active bytes cannot be quarantined', () => {
    const raw = '{malformed';
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    const setItemSpy = vi
      .spyOn(localStorage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)) {
          throw new Error('storage full');
        }
        return Storage.prototype.setItem.call(localStorage, key, value);
      });
    expect(removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(
      Object.keys(localStorage).some((key) => key.startsWith(STORAGE_KEYS.progressQuarantinePrefix))
    ).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    setItemSpy.mockRestore();
  });
  it('fails closed when quarantine readback differs from the opaque active bytes', () => {
    const raw = '{malformed';
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    let quarantineReads = 0;
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => {
      if (key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)) {
        quarantineReads += 1;
        return quarantineReads === 1 ? null : 'readback mismatch';
      }
      return Storage.prototype.getItem.call(localStorage, key);
    });
    expect(removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    getItemSpy.mockRestore();
  });
  it('reuses an exact quarantine copy when an active write fails and is retried', () => {
    const raw = '{malformed';
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    let failedActiveWrite = false;
    const setItemSpy = vi
      .spyOn(localStorage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key === STORAGE_KEYS.progress && !failedActiveWrite) {
          failedActiveWrite = true;
          throw new Error('storage full');
        }
        return Storage.prototype.setItem.call(localStorage, key, value);
      });
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    const quarantineKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
    );
    expect(quarantineKeys).toHaveLength(1);
    expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned(null));
    expect(
      Object.keys(localStorage).filter((key) =>
        key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
      )
    ).toHaveLength(1);
    setItemSpy.mockRestore();
  });
  it('does not overwrite a colliding quarantine slot', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-token' });
    const occupiedKey = `${STORAGE_KEYS.progressQuarantinePrefix}fixed-token_0`;
    localStorage.setItem(occupiedKey, 'previous opaque value');
    const raw = '{malformed';
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    expect(localStorage.getItem(occupiedKey)).toBe('previous opaque value');
    expect(localStorage.getItem(`${STORAGE_KEYS.progressQuarantinePrefix}fixed-token_1`)).toBe(raw);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned(null));
  });
  it('keeps active bytes when every candidate quarantine slot is occupied', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-token' });
    const raw = '{malformed';
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      localStorage.setItem(
        `${STORAGE_KEYS.progressQuarantinePrefix}fixed-token_${attempt}`,
        `other-${attempt}`
      );
    }
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(localStorage.getItem(`${STORAGE_KEYS.progressQuarantinePrefix}fixed-token_15`)).toBe(
      'other-15'
    );
  });
  it('retains the quarantined bytes when removal of the active key throws', () => {
    const raw = '{malformed';
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    vi.spyOn(localStorage, 'removeItem').mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.progress) throw new Error('storage unavailable');
      return Storage.prototype.removeItem.call(localStorage, key);
    });
    expect(removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(
      Object.keys(localStorage).some((key) => key.startsWith(STORAGE_KEYS.progressQuarantinePrefix))
    ).toBe(true);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
  });
  it('reports incomplete removal and leaves backups when storage keys cannot be listed', () => {
    const backupKey = `${STORAGE_KEYS.progressBackupPrefix}user-1_10`;
    localStorage.setItem(backupKey, owned('user-1'));
    vi.spyOn(localStorage, 'key').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(backupKey)).toBe(owned('user-1'));
  });
  it('blocks active writes when the active envelope cannot be read during removal', () => {
    const original = owned('user-1');
    localStorage.setItem(STORAGE_KEYS.progress, original);
    vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.progress) throw new Error('storage unavailable');
      return Storage.prototype.getItem.call(localStorage, key);
    });
    expect(removeAccountDeviceData('user-1')).toBe(false);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    expect(Storage.prototype.getItem.call(localStorage, STORAGE_KEYS.progress)).toBe(original);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
  });
  it('does not attempt device removal outside the browser', () => {
    localStorage.setItem(STORAGE_KEYS.progress, owned('user-1'));
    vi.stubGlobal('window', undefined);
    expect(removeAccountDeviceData('user-1')).toBe(false);
    expect(Storage.prototype.getItem.call(localStorage, STORAGE_KEYS.progress)).toBe(
      owned('user-1')
    );
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
