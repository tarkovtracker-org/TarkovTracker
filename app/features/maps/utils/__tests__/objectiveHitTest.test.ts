import { describe, expect, it, vi } from 'vitest';
import {
  findObjectiveHitStackAtPoint,
  findObjectiveHitsAtPoint,
  findObjectiveHitSourcesAtPoint,
  findObjectivesAtPoint,
  projectObjectiveHitShape,
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
  it('projects zone and point geometry into container coordinates', () => {
    const project = ({ x, y }: { x: number; y: number }) => ({ x: x * 2, y: y * 3 });
    expect(
      projectObjectiveHitShape(
        {
          kind: 'zone',
          objectiveId: 'zone-a',
          ring: square(0, 0, 10),
          area: 100,
          center: { x: 5, y: 5 },
          radius: 4,
          strokeWidth: 2.25,
          centerHitTolerance: 0.75,
        },
        project
      )
    ).toEqual({
      kind: 'zone',
      objectiveId: 'zone-a',
      ring: square(0, 0, 10).map(project),
      area: 100,
      center: { x: 10, y: 15 },
      radius: 4,
      strokeWidth: 2.25,
      centerHitTolerance: 0.75,
    });
    expect(
      projectObjectiveHitShape(
        { kind: 'point', objectiveId: 'point-a', center: { x: 5, y: 5 }, radius: 4 },
        project
      )
    ).toEqual({ kind: 'point', objectiveId: 'point-a', center: { x: 10, y: 15 }, radius: 4 });
  });
  it('keeps the hovered occurrence for its objective in the stack', () => {
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
    const hitPoint = { objectiveId: 'point-a', control: { showPopup: vi.fn() } };
    const actualHoveredPoint = { objectiveId: 'point-a', control: { showPopup: vi.fn() } };
    const zone = { objectiveId: 'zone-a', control: { showPopup: vi.fn() } };
    expect(
      findObjectiveHitStackAtPoint(
        [
          { shape: zoneShape, source: zone },
          { shape: pointShape, source: hitPoint },
        ],
        { x: 50, y: 50 },
        actualHoveredPoint
      )
    ).toEqual([actualHoveredPoint, zone]);
  });
  it('puts the hovered objective first when no source hit matches it', () => {
    const outside = { objectiveId: 'outside', control: { showPopup: vi.fn() } };
    const hit = { objectiveId: 'hit', control: { showPopup: vi.fn() } };
    const shapes: ObjectiveHitShape[] = [
      { kind: 'point', objectiveId: 'hit', center: { x: 10, y: 10 }, radius: 5 },
    ];
    expect(
      findObjectiveHitStackAtPoint([{ shape: shapes[0]!, source: hit }], { x: 10, y: 10 }, outside)
    ).toEqual([outside, hit]);
    expect(findObjectiveHitStackAtPoint([], { x: 10, y: 10 }, outside)).toEqual([outside]);
  });
  it('ignores shapes away from the cursor', () => {
    const shapes: ObjectiveHitShape[] = [
      { kind: 'zone', objectiveId: 'zone-far', ring: square(300, 300, 50), area: 2500 },
      { kind: 'point', objectiveId: 'point-far', center: { x: 120, y: 10 }, radius: 8 },
      { kind: 'point', objectiveId: 'point-near', center: { x: 10, y: 10 }, radius: 8 },
    ];
    expect(findObjectivesAtPoint(shapes, { x: 14, y: 12 })).toEqual(['point-near']);
  });
  it('includes half the marker stroke outside a point radius', () => {
    const shape: ObjectiveHitShape = {
      kind: 'point',
      objectiveId: 'point-a',
      center: { x: 50, y: 50 },
      radius: 8,
      hitTolerance: 1,
    };
    expect(findObjectivesAtPoint([shape], { x: 59, y: 50 })).toEqual(['point-a']);
    expect(findObjectivesAtPoint([shape], { x: 59.1, y: 50 })).toEqual([]);
  });
  it('includes only the polygon stroke outside a zone fill', () => {
    const zone: ObjectiveHitShape = {
      kind: 'zone',
      objectiveId: 'zone-a',
      ring: square(0, 0, 100),
      area: 10000,
      strokeWidth: 2,
    };
    expect(findObjectivesAtPoint([zone], { x: 50, y: -0.9 })).toEqual(['zone-a']);
    expect(findObjectivesAtPoint([zone], { x: 50, y: -1.1 })).toEqual([]);
  });
  it('includes the center marker stroke outside a zone radius', () => {
    const zone: ObjectiveHitShape = {
      kind: 'zone',
      objectiveId: 'zone-a',
      ring: square(0, 0, 100),
      area: 10000,
      center: { x: 200, y: 200 },
      radius: 5,
      centerHitTolerance: 0.75,
    };
    expect(findObjectivesAtPoint([zone], { x: 205.7, y: 200 })).toEqual(['zone-a']);
    expect(findObjectivesAtPoint([zone], { x: 205.8, y: 200 })).toEqual([]);
  });
});
