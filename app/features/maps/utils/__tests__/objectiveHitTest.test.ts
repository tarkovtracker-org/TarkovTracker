import { describe, expect, it } from 'vitest';
import {
  findObjectiveHitsAtPoint,
  findObjectiveHitSourcesAtPoint,
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
  it('keeps a zone center marker ranked as a zone below an actual point', () => {
    const zone: ObjectiveHitShape = {
      kind: 'zone',
      objectiveId: 'zone-a',
      ring: square(200, 200, 50),
      area: 2500,
      center: { x: 50, y: 50 },
      radius: 5,
    };
    const point: ObjectiveHitShape = {
      kind: 'point',
      objectiveId: 'point-a',
      center: { x: 50, y: 50 },
      radius: 8,
    };
    expect(findObjectivesAtPoint([zone, point], { x: 52, y: 49 })).toEqual(['point-a', 'zone-a']);
  });
  it('returns the exact first hit shape so its map occurrence can stay attached', () => {
    const shapes: ObjectiveHitShape[] = [
      { kind: 'zone', objectiveId: 'same-task-zone', ring: square(0, 0, 200), area: 40000 },
      { kind: 'point', objectiveId: 'point-a', center: { x: 50, y: 50 }, radius: 8 },
      { kind: 'zone', objectiveId: 'same-task-zone', ring: square(40, 40, 30), area: 900 },
    ];
    expect(findObjectiveHitsAtPoint(shapes, { x: 50, y: 50 })).toEqual([shapes[1], shapes[2]]);
  });
  it('keeps the popup source attached to the first ranked shape for each objective', () => {
    const pointShape: ObjectiveHitShape = {
      kind: 'point',
      objectiveId: 'point-a',
      center: { x: 50, y: 50 },
      radius: 8,
    };
    const zoneShape: ObjectiveHitShape = {
      kind: 'zone',
      objectiveId: 'zone-a',
      ring: square(0, 0, 200),
      area: 40000,
    };
    const pointPopup = { occurrence: 'point' };
    const zonePopup = { occurrence: 'zone' };
    const hits = findObjectiveHitSourcesAtPoint(
      [
        { shape: zoneShape, source: zonePopup },
        { shape: pointShape, source: pointPopup },
      ],
      { x: 50, y: 50 }
    );
    expect(hits.map((hit) => hit.source)).toEqual([pointPopup, zonePopup]);
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
