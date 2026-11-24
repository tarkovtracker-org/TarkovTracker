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
  it('redraws when only the objective type, and so its glyph, differs', () => {
    const plant = getMarksHash([{ ...baseMark, type: 'plantItem' }], 'customs');
    expect(getMarksHash([{ ...baseMark, type: 'visit' }], 'customs')).not.toBe(plant);
  });
  it('redraws when only the quest or the chip color differs (#920)', () => {
    const questA = getMarksHash([{ ...baseMark, taskId: 'task-a' }], 'customs');
    expect(getMarksHash([{ ...baseMark, taskId: 'task-b' }], 'customs')).not.toBe(questA);
    const orange = getMarksHash([{ ...baseMark, color: '#e69f00' }], 'customs');
    expect(getMarksHash([{ ...baseMark, color: '#0072b2' }], 'customs')).not.toBe(orange);
    expect(getMarksHash([baseMark], 'customs')).not.toBe(orange);
  });
  it('invalidates markers when only elevation changes', () => {
    const point = {
      ...baseMark,
      possibleLocations: [{ map: { id: 'customs' }, positions: [{ x: 1, y: 2, z: 3 }] }],
    };
    const elevated = {
      ...point,
      possibleLocations: [{ map: { id: 'customs' }, positions: [{ x: 1, y: 6, z: 3 }] }],
    };
    expect(getMarksHash([point], 'customs')).not.toBe(getMarksHash([elevated], 'customs'));
    const zone = {
      ...baseMark,
      zones: [
        {
          map: { id: 'customs' },
          outline: [{ x: 1, z: 3 }],
          position: { x: 1, y: 2, z: 3 },
          bottom: 0,
          top: 3,
        },
      ],
    };
    expect(getMarksHash([zone], 'customs')).not.toBe(
      getMarksHash([{ ...zone, zones: [{ ...zone.zones[0]!, top: 6 }] }], 'customs')
    );
  });
});
