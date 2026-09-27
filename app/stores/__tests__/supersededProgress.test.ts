// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  listSupersededProgressCopies,
  removeSupersededProgressCopies,
  saveSupersededProgressCopy,
} from '@/stores/tarkov/supersededProgress';
import { createDefaultOwnedProgressData } from '@/utils/progressSanitizers';
const progress = {
  ...createDefaultOwnedProgressData(),
  level: 12,
  taskCompletions: { task: { complete: true, failed: false, timestamp: 100 } },
};
describe('superseded progress copies', () => {
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
  it('removes only the requested owner copies', () => {
    saveSupersededProgressCopy('owner-1', 'pve', null, progress, 100);
    saveSupersededProgressCopy('owner-2', 'pve', null, progress, 100);
    removeSupersededProgressCopies('owner-1');
    expect(listSupersededProgressCopies('owner-1')).toEqual([]);
    expect(listSupersededProgressCopies('owner-2')).toHaveLength(1);
  });
});
