// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listSupersededProgressCopies,
  removeSupersededProgressCopies,
  saveSupersededProgressCopy,
} from '@/stores/tarkov/supersededProgress';
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
  it('retains reset progress for its owner as export-only data', () => {
    const copy = saveSupersededProgressCopy('owner-1', 'pvp', null, progress, 100);
    expect(copy).toMatchObject({ ownerId: 'owner-1', mode: 'pvp', seasonNumber: null });
    expect(listSupersededProgressCopies('owner-1')).toEqual([copy]);
    expect(listSupersededProgressCopies('owner-2')).toEqual([]);
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
