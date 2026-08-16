import { describe, expect, it } from 'vitest';
import { getMarksHash, type MapMark } from '@/features/maps/utils/marksHash';
describe('getMarksHash', () => {
  const baseMark: MapMark = {
    id: 'objective-1',
    zones: [],
    users: ['self'],
  };
  it('produces different hashes when only mark.pinned differs', () => {
    const unpinned: MapMark[] = [{ ...baseMark, pinned: false }];
    const pinned: MapMark[] = [{ ...baseMark, pinned: true }];
    const unpinnedHash = getMarksHash(unpinned, 'customs');
    const pinnedHash = getMarksHash(pinned, 'customs');
    expect(pinnedHash).not.toBe(unpinnedHash);
  });
  it('produces the same hash for identical mark arrays', () => {
    const marksA: MapMark[] = [{ ...baseMark, pinned: true }];
    const marksB: MapMark[] = [{ ...baseMark, pinned: true }];
    expect(getMarksHash(marksA, 'customs')).toBe(getMarksHash(marksB, 'customs'));
  });
});
