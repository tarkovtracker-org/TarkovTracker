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
  persistActiveProgressValue,
  setActiveProgressWritesBlocked,
  flushActiveProgressWrites,
} from '@/stores/tarkov/localStorage';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const owned = (userId: string | null) =>
  JSON.stringify({ _userId: userId, data: structuredClone(defaultState) });
describe('device data removal', () => {
  afterEach(async () => {
    await flushActiveProgressWrites();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  beforeEach(async () => {
    await flushActiveProgressWrites();
    localStorage.clear();
    clearDeviceDataRemoval();
    resetAccountRecoveryRetentionBlock();
    setActiveProgressWritesBlocked(false);
  });
  it('rereads ownership when another tab replaces opaque bytes while cleanup waits', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, '{opaque');
    const replacement = owned('user-2');
    const write = persistActiveProgressValue(replacement);
    expect(await removeAccountDeviceData('user-1')).toBe(true);
    expect(await write).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(replacement);
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
    expect(await persistActiveProgressValue(replacement)).toBe(true);
  });
  it('removes every copy owned by the account and nothing else', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, owned('user-1'));
    localStorage.setItem(STORAGE_KEYS.preferences, owned('user-1'));
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`, owned('user-1'));
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-2`, owned('user-2'));
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-1_10`, owned('user-1'));
    localStorage.setItem(`${LEGACY_STORAGE_KEYS.progressBackupPrefix}user-1_11`, owned('user-1'));
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-10_12`, owned('user-10'));
    localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}anonymous_13`, owned(null));
    expect(await removeAccountDeviceData('user-1')).toBe(true);
    expect(Object.keys(localStorage).sort()).toEqual(
      [
        `${STORAGE_KEYS.progressRecoveryPrefix}user-2`,
        `${STORAGE_KEYS.progressBackupPrefix}user-10_12`,
        `${STORAGE_KEYS.progressBackupPrefix}anonymous_13`,
      ].sort()
    );
  });
  it('removes legacy timestamp-named backups by their stored owner', async () => {
    const legacyTimestampBackup = `${LEGACY_STORAGE_KEYS.progressBackupPrefix}2026-01-01T00:00:00.000Z`;
    localStorage.setItem(legacyTimestampBackup, owned('user-1'));
    localStorage.setItem(
      `${LEGACY_STORAGE_KEYS.progressBackupPrefix}2026-01-02T00:00:00.000Z`,
      owned('user-2')
    );
    expect(await removeAccountDeviceData('user-1')).toBe(true);
    expect(localStorage.getItem(legacyTimestampBackup)).toBeNull();
    expect(
      localStorage.getItem(`${LEGACY_STORAGE_KEYS.progressBackupPrefix}2026-01-02T00:00:00.000Z`)
    ).not.toBeNull();
  });
  it('keeps values without an owner envelope and still reports removal complete', async () => {
    const unscopedBackup = `${LEGACY_STORAGE_KEYS.progressBackupPrefix}2026-01-03T00:00:00.000Z`;
    const unscopedProgress = JSON.stringify(structuredClone(defaultState));
    localStorage.setItem(unscopedBackup, unscopedProgress);
    localStorage.setItem(STORAGE_KEYS.progress, owned('user-1'));
    expect(await removeAccountDeviceData('user-1')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
    expect(localStorage.getItem(unscopedBackup)).toBe(unscopedProgress);
  });
  it('reports incomplete backup cleanup while allowing guest saves after active removal', async () => {
    const activeKey = STORAGE_KEYS.progress;
    const recoveryKey = `${STORAGE_KEYS.progressRecoveryPrefix}user-1`;
    localStorage.setItem(activeKey, owned('user-1'));
    localStorage.setItem(recoveryKey, owned('user-1'));
    const originalRemove = localStorage.removeItem.bind(localStorage);
    vi.spyOn(localStorage, 'removeItem').mockImplementation((key: string) => {
      if (key === recoveryKey) throw new Error('storage unavailable');
      return originalRemove(key);
    });
    expect(await removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(activeKey)).toBeNull();
    expect(localStorage.getItem(recoveryKey)).not.toBeNull();
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    await flushActiveProgressWrites();
    expect(localStorage.getItem(activeKey)).toBe(owned(null));
  });
  it('keeps writes blocked when the owned active envelope cannot be removed', async () => {
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
    expect(await removeAccountDeviceData('user-1')).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    await flushActiveProgressWrites();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned('user-1'));
    removeItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
  it('keeps active copies that belong to another account or a guest', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, owned(null));
    localStorage.setItem(STORAGE_KEYS.preferences, owned('user-2'));
    await removeAccountDeviceData('user-1');
    expect(localStorage.getItem(STORAGE_KEYS.progress)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).not.toBeNull();
  });
  it('leaves an unreadable active envelope owned by another account untouched', async () => {
    const raw = JSON.stringify({ _userId: 'user-2', data: null });
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    expect(await removeAccountDeviceData('user-1')).toBe(true);
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
  ])('quarantines $kind before replacement without assigning an owner', async ({ raw }) => {
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    await flushActiveProgressWrites();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned(null));
    const quarantineKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
    );
    expect(quarantineKeys).toHaveLength(1);
    expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
    expect(Object.keys(localStorage)).not.toContain(`${STORAGE_KEYS.progressRecoveryPrefix}null`);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    await flushActiveProgressWrites();
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
    async (raw) => {
      localStorage.setItem(STORAGE_KEYS.progress, raw);
      expect(await removeAccountDeviceData('user-1')).toBe(false);
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
      const quarantineKeys = quarantinedValueKeys();
      expect(quarantineKeys).toHaveLength(1);
      expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
      expect(isAccountRecoveryRetentionBlocked()).toBe(false);
      progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
      await flushActiveProgressWrites();
      expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned(null));
      // The quarantine has no provable owner, so a retry must not report completion.
      expect(await removeAccountDeviceData('user-1')).toBe(false);
      expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
      // Other accounts are not held back by this owner's unattributable bytes.
      expect(await removeAccountDeviceData('user-2')).toBe(true);
      localStorage.removeItem(quarantineKeys[0]!);
      expect(await removeAccountDeviceData('user-1')).toBe(true);
      expect(
        localStorage.getItem(`${STORAGE_KEYS.progressQuarantineRemovalMarkerPrefix}user-1`)
      ).toBeNull();
    }
  );
  it('keeps the active slot when the durable quarantine marker cannot be written', async () => {
    const raw = '{malformed';
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    const setItem = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith(STORAGE_KEYS.progressQuarantineRemovalMarkerPrefix)) {
        throw new DOMException('full', 'QuotaExceededError');
      }
      setItem(key, value);
    });
    expect(await removeAccountDeviceData('user-1')).toBe(false);
    spy.mockRestore();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
  });
  it('removes the owner activity logs and keeps guest and other-account entries', async () => {
    localStorage.setItem(STORAGE_KEYS.activityLogManual, owned('user-1'));
    localStorage.setItem(LEGACY_STORAGE_KEYS.activityLogManual, owned(null));
    localStorage.setItem(STORAGE_KEYS.activityLogLastRead, owned('user-1'));
    localStorage.setItem(LEGACY_STORAGE_KEYS.activityLogLastRead, owned('user-2'));
    expect(await removeAccountDeviceData('user-1')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.activityLogManual)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.activityLogLastRead)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEYS.activityLogManual)).toBe(owned(null));
    expect(localStorage.getItem(LEGACY_STORAGE_KEYS.activityLogLastRead)).toBe(owned('user-2'));
  });
  it('re-reads ownership when another tab replaces a shared key before removal', async () => {
    localStorage.setItem(STORAGE_KEYS.preferences, owned('user-1'));
    const getItem = localStorage.getItem.bind(localStorage);
    let replaced = false;
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      const value = getItem(key);
      if (key === STORAGE_KEYS.preferences && !replaced) {
        replaced = true;
        localStorage.setItem(STORAGE_KEYS.preferences, owned('user-2'));
      }
      return value;
    });
    expect(await removeAccountDeviceData('user-1')).toBe(true);
    spy.mockRestore();
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).toBe(owned('user-2'));
  });
  it('deletes malformed active bytes that name the removing owner without quarantine', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: 'user-1', data: null }));
    expect(await removeAccountDeviceData('user-1')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull();
    expect(quarantinedValueKeys()).toHaveLength(0);
    expect(isAccountRecoveryRetentionBlocked()).toBe(false);
  });
  it('treats an unreadable quarantine marker as incomplete', async () => {
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
    expect(await removeAccountDeviceData('user-1')).toBe(false);
    spy.mockRestore();
    expect(await removeAccountDeviceData('user-1')).toBe(true);
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
    expect(await retryIncompleteDeviceDataRemoval()).toBe(true);
    expect(incompleteDeviceDataRemovalOwner.value).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-2`)).toBe(
      owned('user-2')
    );
    markDeviceDataRemovalIncomplete('user-1');
    clearIncompleteDeviceDataRemoval('user-1');
    expect(incompleteDeviceDataRemovalOwner.value).toBeNull();
  });
  it('keeps a removal incomplete until its durable marker is deleted', async () => {
    const {
      incompleteDeviceDataRemovalOwner,
      markDeviceDataRemovalIncomplete,
      retryIncompleteDeviceDataRemoval,
    } = await import('@/stores/tarkov/deviceData');
    markDeviceDataRemovalIncomplete('user-1');
    const markerKey = Object.keys(localStorage).find(
      (key) => localStorage.getItem(key) === 'user-1'
    )!;
    const removeItem = localStorage.removeItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation((key: string) => {
      if (key === markerKey) throw new DOMException('denied', 'SecurityError');
      removeItem(key);
    });
    expect(await retryIncompleteDeviceDataRemoval()).toBe(false);
    expect(incompleteDeviceDataRemovalOwner.value).toBe('user-1');
    expect(localStorage.getItem(markerKey)).toBe('user-1');
    spy.mockRestore();
    expect(await retryIncompleteDeviceDataRemoval()).toBe(true);
    expect(incompleteDeviceDataRemovalOwner.value).toBeNull();
  });
  it('warns when an incomplete removal cannot be stored for a reload', async () => {
    const { markDeviceDataRemovalIncomplete, incompleteDeviceDataRemovalOwner } =
      await import('@/stores/tarkov/deviceData');
    const { logger } = await import('@/utils/logger');
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    markDeviceDataRemovalIncomplete('user-1');
    spy.mockRestore();
    expect(incompleteDeviceDataRemovalOwner.value).toBe('user-1');
    expect(logger.warn).toHaveBeenCalledWith(
      '[DeviceData] Incomplete removal is retryable only until this page reloads'
    );
  });
  it('keeps every incomplete removal owner and retries all of them', async () => {
    const {
      incompleteDeviceDataRemovalOwner,
      markDeviceDataRemovalIncomplete,
      retryIncompleteDeviceDataRemoval,
    } = await import('@/stores/tarkov/deviceData');
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`, owned('user-1'));
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-2`, owned('user-2'));
    markDeviceDataRemovalIncomplete('user-1');
    markDeviceDataRemovalIncomplete('user-2');
    // Another tab records its own owner without replacing this tab's marker.
    localStorage.setItem(`${STORAGE_KEYS.deviceDataRemovalIncompletePrefix}user-3`, 'user-3');
    localStorage.setItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-3`, owned('user-3'));
    expect(incompleteDeviceDataRemovalOwner.value).toBe('user-1');
    expect(await retryIncompleteDeviceDataRemoval()).toBe(true);
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-1`)).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-2`)).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.progressRecoveryPrefix}user-3`)).toBeNull();
    expect(
      Object.keys(localStorage).filter((key) =>
        key.startsWith(STORAGE_KEYS.deviceDataRemovalIncompletePrefix)
      )
    ).toEqual([]);
    expect(incompleteDeviceDataRemovalOwner.value).toBeNull();
  });
  it('keeps an incomplete removal retryable after a reload', async () => {
    const { markDeviceDataRemovalIncomplete } = await import('@/stores/tarkov/deviceData');
    markDeviceDataRemovalIncomplete('user-1');
    expect(localStorage.getItem(`${STORAGE_KEYS.deviceDataRemovalIncompletePrefix}user-1`)).toBe(
      'user-1'
    );
    vi.resetModules();
    const reloaded = await import('@/stores/tarkov/deviceData');
    expect(reloaded.incompleteDeviceDataRemovalOwner.value).toBe('user-1');
    reloaded.recordDeviceDataRemovalOutcome('user-2', true);
    expect(reloaded.incompleteDeviceDataRemovalOwner.value).toBe('user-1');
    reloaded.recordDeviceDataRemovalOutcome('user-1', true);
    expect(reloaded.incompleteDeviceDataRemovalOwner.value).toBeNull();
    expect(
      localStorage.getItem(`${STORAGE_KEYS.deviceDataRemovalIncompletePrefix}user-1`)
    ).toBeNull();
    reloaded.recordDeviceDataRemovalOutcome('user-3', false);
    expect(localStorage.getItem(`${STORAGE_KEYS.deviceDataRemovalIncompletePrefix}user-3`)).toBe(
      'user-3'
    );
  });
  it('fails closed when opaque active bytes cannot be quarantined', async () => {
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
    expect(await removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(
      Object.keys(localStorage).some((key) => key.startsWith(STORAGE_KEYS.progressQuarantinePrefix))
    ).toBe(false);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    setItemSpy.mockRestore();
  });
  it('fails closed when quarantine readback differs from the opaque active bytes', async () => {
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
    expect(await removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
    getItemSpy.mockRestore();
  });
  it('reuses an exact quarantine copy when an active write fails and is retried', async () => {
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
    await flushActiveProgressWrites();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    const quarantineKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
    );
    expect(quarantineKeys).toHaveLength(1);
    expect(localStorage.getItem(quarantineKeys[0]!)).toBe(raw);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    await flushActiveProgressWrites();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned(null));
    expect(
      Object.keys(localStorage).filter((key) =>
        key.startsWith(STORAGE_KEYS.progressQuarantinePrefix)
      )
    ).toHaveLength(1);
    setItemSpy.mockRestore();
  });
  it('does not overwrite a colliding quarantine slot', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-token' });
    const occupiedKey = `${STORAGE_KEYS.progressQuarantinePrefix}fixed-token_0`;
    localStorage.setItem(occupiedKey, 'previous opaque value');
    const raw = '{malformed';
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    await flushActiveProgressWrites();
    expect(localStorage.getItem(occupiedKey)).toBe('previous opaque value');
    expect(localStorage.getItem(`${STORAGE_KEYS.progressQuarantinePrefix}fixed-token_1`)).toBe(raw);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(owned(null));
  });
  it('keeps active bytes when every candidate quarantine slot is occupied', async () => {
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
    await flushActiveProgressWrites();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(localStorage.getItem(`${STORAGE_KEYS.progressQuarantinePrefix}fixed-token_15`)).toBe(
      'other-15'
    );
  });
  it('retains the quarantined bytes when removal of the active key throws', async () => {
    const raw = '{malformed';
    localStorage.setItem(STORAGE_KEYS.progress, raw);
    vi.spyOn(localStorage, 'removeItem').mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.progress) throw new Error('storage unavailable');
      return Storage.prototype.removeItem.call(localStorage, key);
    });
    expect(await removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(raw);
    expect(
      Object.keys(localStorage).some((key) => key.startsWith(STORAGE_KEYS.progressQuarantinePrefix))
    ).toBe(true);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
  });
  it('reports incomplete removal and leaves backups when storage keys cannot be listed', async () => {
    const backupKey = `${STORAGE_KEYS.progressBackupPrefix}user-1_10`;
    localStorage.setItem(backupKey, owned('user-1'));
    vi.spyOn(localStorage, 'key').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(await removeAccountDeviceData('user-1')).toBe(false);
    expect(localStorage.getItem(backupKey)).toBe(owned('user-1'));
  });
  it('blocks active writes when the active envelope cannot be read during removal', async () => {
    const original = owned('user-1');
    localStorage.setItem(STORAGE_KEYS.progress, original);
    vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.progress) throw new Error('storage unavailable');
      return Storage.prototype.getItem.call(localStorage, key);
    });
    expect(await removeAccountDeviceData('user-1')).toBe(false);
    progressPersistStorage.setItem(STORAGE_KEYS.progress, owned(null));
    await flushActiveProgressWrites();
    expect(Storage.prototype.getItem.call(localStorage, STORAGE_KEYS.progress)).toBe(original);
    expect(isAccountRecoveryRetentionBlocked()).toBe(true);
  });
  it('does not attempt device removal outside the browser', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, owned('user-1'));
    vi.stubGlobal('window', undefined);
    expect(await removeAccountDeviceData('user-1')).toBe(false);
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
