// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRestorableSupersededCopy,
  listSupersededProgressCopies,
  removeSupersededProgressCopies,
  removeSupersededProgressCopy,
  saveSupersededProgressCopies,
  saveSupersededProgressCopy,
} from '@/stores/tarkov/supersededProgress';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { createDefaultOwnedProgressData } from '@/utils/progressSanitizers';
import { STORAGE_KEYS } from '@/utils/storageKeys';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const progress = {
  ...createDefaultOwnedProgressData(),
  level: 12,
  taskCompletions: { task: { complete: true, failed: false, timestamp: 100 } },
};
describe('superseded progress copies', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  beforeEach(() => localStorage.clear());
  it('retains reset progress for its owner only', () => {
    const copy = saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100);
    expect(copy).toMatchObject({ ownerId: 'owner-1', mode: 'pvp', seasonNumber: null });
    expect(listSupersededProgressCopies('owner-1')).toEqual([copy]);
    expect(listSupersededProgressCopies('owner-2')).toEqual([]);
  });
  it('treats copies that differ only in reset clocks as the same progress', () => {
    const first = saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100);
    const restoredAgain = saveSupersededProgressCopy(
      'owner-1',
      'pvp',
      null,
      { ...progress, progressEpoch: 9, manualActivityEpoch: 4 },
      200
    );
    expect(restoredAgain).toEqual(first);
    expect(listSupersededProgressCopies('owner-1')).toHaveLength(1);
  });
  it('saves a batch with one stored-list read and one change notice', () => {
    const existing = saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100)!;
    const changed = vi.fn();
    const reads = vi.spyOn(localStorage, 'getItem');
    window.addEventListener('tt:superseded-progress-change', changed);
    try {
      const failed = saveSupersededProgressCopies('owner-1', [
        { mode: 'pvp', seasonNumber: null, progress, supersededAt: 300, copyId: 'same-progress' },
        { mode: 'pve', seasonNumber: null, progress, supersededAt: 400, copyId: 'kept-id' },
        { mode: 'pve', seasonNumber: null, progress, supersededAt: 500 },
      ]);
      expect(failed).toBe(0);
      // The one stored copy is read once, however many inputs are checked against it.
      const copyReads = reads.mock.calls.filter(([key]) =>
        String(key).startsWith(STORAGE_KEYS.progressSupersededPrefix)
      );
      expect(copyReads).toHaveLength(1);
    } finally {
      reads.mockRestore();
      window.removeEventListener('tt:superseded-progress-change', changed);
    }
    expect(changed).toHaveBeenCalledOnce();
    expect(listSupersededProgressCopies('owner-1').map((copy) => copy.id)).toEqual([
      existing.id,
      'kept-id',
    ]);
  });
  it('does not announce a batch that only repeats stored progress', () => {
    saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100);
    const changed = vi.fn();
    window.addEventListener('tt:superseded-progress-change', changed);
    try {
      expect(
        saveSupersededProgressCopies('owner-1', [
          { mode: 'pvp', seasonNumber: null, progress, supersededAt: 300 },
        ])
      ).toBe(0);
      expect(saveSupersededProgressCopies('owner-1', [])).toBe(0);
    } finally {
      window.removeEventListener('tt:superseded-progress-change', changed);
    }
    expect(changed).not.toHaveBeenCalled();
  });
  it('discards one copy for its owner and announces the change', () => {
    const kept = saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100)!;
    const discarded = saveSupersededProgressCopy('owner-1', 'pve', null, progress, 200)!;
    const foreign = saveSupersededProgressCopy('owner-2', 'pve', null, progress, 200)!;
    const changed = vi.fn();
    window.addEventListener('tt:superseded-progress-change', changed);
    try {
      expect(removeSupersededProgressCopy('owner-1', discarded.id)).toBe(true);
      expect(removeSupersededProgressCopy('owner-1', foreign.id)).toBe(true);
    } finally {
      window.removeEventListener('tt:superseded-progress-change', changed);
    }
    expect(changed).toHaveBeenCalledTimes(2);
    expect(listSupersededProgressCopies('owner-1')).toEqual([kept]);
    expect(listSupersededProgressCopies('owner-2')).toEqual([foreign]);
  });
  it('restores Seasonal copies only into the season they came from', () => {
    expect(isRestorableSupersededCopy({ mode: 'pvp', seasonNumber: null })).toBe(true);
    expect(isRestorableSupersededCopy({ mode: 'pve', seasonNumber: null })).toBe(true);
    expect(
      isRestorableSupersededCopy({ mode: 'seasonal', seasonNumber: ACTIVE_SEASON_NUMBER })
    ).toBe(true);
    expect(
      isRestorableSupersededCopy({ mode: 'seasonal', seasonNumber: ACTIVE_SEASON_NUMBER - 1 })
    ).toBe(false);
    expect(isRestorableSupersededCopy({ mode: 'seasonal', seasonNumber: null })).toBe(false);
  });
  it('keeps the original season and avoids duplicate copies on repeated hydration', () => {
    const first = saveSupersededProgressCopy('owner-1', 'seasonal', 4, progress, 100);
    const duplicate = saveSupersededProgressCopy('owner-1', 'seasonal', 4, progress, 200);
    expect(duplicate).toEqual(first);
    expect(listSupersededProgressCopies('owner-1')).toHaveLength(1);
    expect(listSupersededProgressCopies('owner-1')[0]).toMatchObject({
      mode: 'seasonal',
      seasonNumber: 4,
    });
  });
  it('lists superseded copies in creation order', () => {
    const older = saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100);
    const newer = saveSupersededProgressCopy(
      'owner-1',
      'pve',
      null,
      { ...progress, level: 13 },
      200
    );
    expect(listSupersededProgressCopies('owner-1')).toEqual([older, newer]);
  });
  it('removes only the requested owner copies', () => {
    saveSupersededProgressCopy('owner-1', 'pve', null, progress, 100);
    saveSupersededProgressCopy('owner-2', 'pve', null, progress, 100);
    removeSupersededProgressCopies('owner-1');
    expect(listSupersededProgressCopies('owner-1')).toEqual([]);
    expect(listSupersededProgressCopies('owner-2')).toHaveLength(1);
  });
  it('ignores malformed copies and records with a mismatched owner', () => {
    const prefix = `${STORAGE_KEYS.progressSupersededPrefix}owner-1_`;
    localStorage.setItem(`${prefix}bad-json`, '{');
    localStorage.setItem(
      `${prefix}wrong-owner`,
      JSON.stringify({
        id: 'wrong-owner',
        ownerId: 'owner-2',
        mode: 'pvp',
        seasonNumber: null,
        supersededAt: 100,
        progress,
      })
    );
    localStorage.setItem(
      `${prefix}bad-mode`,
      JSON.stringify({
        id: 'bad-mode',
        ownerId: 'owner-1',
        mode: 'unknown',
        seasonNumber: null,
        supersededAt: 100,
        progress,
      })
    );
    expect(listSupersededProgressCopies('owner-1')).toEqual([]);
  });
  it('fails closed when storage cannot be listed or removed', () => {
    saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100);
    const key = vi.spyOn(localStorage, 'key').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(listSupersededProgressCopies('owner-1')).toEqual([]);
    expect(removeSupersededProgressCopies('owner-1')).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(2);
    key.mockRestore();
  });
  it('skips copies whose values disappear after key enumeration', () => {
    const copy = saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100);
    expect(copy).not.toBeNull();
    const key = `${STORAGE_KEYS.progressSupersededPrefix}owner-1_${copy?.id}`;
    vi.spyOn(localStorage, 'getItem').mockImplementation((storedKey: string) =>
      storedKey === key ? null : Storage.prototype.getItem.call(localStorage, storedKey)
    );
    expect(listSupersededProgressCopies('owner-1')).toEqual([]);
  });
  it('handles server-side listing and saving without dispatching a browser event', () => {
    vi.stubGlobal('window', undefined);
    expect(saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100)).toBeNull();
    expect(listSupersededProgressCopies('owner-1')).toEqual([]);
    expect(removeSupersededProgressCopies('owner-1')).toBe(false);
  });
});
