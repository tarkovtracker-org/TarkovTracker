import { describe, expect, it } from 'vitest';
import {
  findObjectivesAtPoint,
  type ObjectiveHitShape,
} from '@/features/maps/utils/objectiveHitTest';
const square = (x: number, y: number, size: number) => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];
describe('findObjectivesAtPoint', () => {
  // #919: hovering a point objective inside a large quest zone only ever
  // surfaced one of them; the hover must list every objective under the cursor.
  it('lists a point objective and the zone it sits inside', () => {
    const shapes: ObjectiveHitShape[] = [
      { kind: 'zone', objectiveId: 'zone-big', ring: square(0, 0, 200), area: 40000 },
      { kind: 'point', objectiveId: 'point-a', center: { x: 50, y: 50 }, radius: 8 },
    ];
    expect(findObjectivesAtPoint(shapes, { x: 52, y: 49 })).toEqual(['point-a', 'zone-big']);
  });
  it('orders overlapping zones from smallest to largest after points', () => {
    const shapes: ObjectiveHitShape[] = [
      { kind: 'zone', objectiveId: 'zone-big', ring: square(0, 0, 200), area: 40000 },
      { kind: 'zone', objectiveId: 'zone-small', ring: square(40, 40, 30), area: 900 },
      { kind: 'point', objectiveId: 'point-a', center: { x: 50, y: 50 }, radius: 8 },
    ];
    expect(findObjectivesAtPoint(shapes, { x: 50, y: 50 })).toEqual([
      'point-a',
      'zone-small',
      'zone-big',
    ]);
  });
  it('dedupes an objective hit through several shapes', () => {
    const shapes: ObjectiveHitShape[] = [
      { kind: 'zone', objectiveId: 'zone-a', ring: square(0, 0, 100), area: 10000 },
      { kind: 'point', objectiveId: 'zone-a', center: { x: 50, y: 50 }, radius: 5 },
    ];
    expect(findObjectivesAtPoint(shapes, { x: 50, y: 50 })).toEqual(['zone-a']);
  });
  it('ignores shapes away from the cursor', () => {
    const shapes: ObjectiveHitShape[] = [
      { kind: 'zone', objectiveId: 'zone-far', ring: square(300, 300, 50), area: 2500 },
      { kind: 'point', objectiveId: 'point-far', center: { x: 120, y: 10 }, radius: 8 },
      { kind: 'point', objectiveId: 'point-near', center: { x: 10, y: 10 }, radius: 8 },
    ];
    expect(findObjectivesAtPoint(shapes, { x: 14, y: 12 })).toEqual(['point-near']);
  });
});
