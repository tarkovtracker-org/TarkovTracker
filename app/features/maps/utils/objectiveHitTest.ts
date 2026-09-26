/**
 * Pure hit-testing for map objective shapes in container pixel space, used to
 * list every objective under the cursor when zones and points overlap (#919).
 */
export type HitPoint = { x: number; y: number };
export type ObjectiveHitShape =
  | {
      kind: 'zone';
      objectiveId: string;
      ring: HitPoint[];
      area: number;
      center?: HitPoint;
      radius?: number;
    }
  | { kind: 'point'; objectiveId: string; center: HitPoint; radius: number };
export type ObjectiveHitGeometry<TPosition> =
  | {
      kind: 'zone';
      objectiveId: string;
      ring: readonly TPosition[];
      area: number;
      center: TPosition;
      radius: number;
    }
  | { kind: 'point'; objectiveId: string; center: TPosition; radius: number };
export type ObjectiveHitCandidate<T> = { shape: ObjectiveHitShape; source: T };
export type ObjectiveHitSource<T> = { shape: ObjectiveHitShape; source: T };
export const projectObjectiveHitShape = <TPosition>(
  geometry: ObjectiveHitGeometry<TPosition>,
  project: (position: TPosition) => HitPoint
): ObjectiveHitShape => {
  if (geometry.kind === 'zone') {
    return {
      kind: 'zone',
      objectiveId: geometry.objectiveId,
      ring: geometry.ring.map(project),
      area: geometry.area,
      center: project(geometry.center),
      radius: geometry.radius,
    };
  }
  return {
    kind: 'point',
    objectiveId: geometry.objectiveId,
    center: project(geometry.center),
    radius: geometry.radius,
  };
};
const crossesRay = (a: HitPoint, b: HitPoint, point: HitPoint): boolean => {
  if (a.y > point.y === b.y > point.y) return false;
  return point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
};
const isInsideRing = (ring: HitPoint[], point: HitPoint): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (crossesRay(ring[i]!, ring[j]!, point)) inside = !inside;
  }
  return inside;
};
const isHit = (shape: ObjectiveHitShape, point: HitPoint): boolean => {
  if (shape.kind === 'zone') {
    return (
      isInsideRing(shape.ring, point) ||
      (shape.center !== undefined &&
        shape.radius !== undefined &&
        Math.hypot(shape.center.x - point.x, shape.center.y - point.y) <= shape.radius)
    );
  }
  return Math.hypot(shape.center.x - point.x, shape.center.y - point.y) <= shape.radius;
};
/** Points first (most specific), then zones from smallest to largest area. */
const hitRank = (shape: ObjectiveHitShape): number => (shape.kind === 'point' ? -1 : shape.area);
/**
 * Returns the first hit shape for each objective, most specific first.
 */
export const findObjectiveHitsAtPoint = (
  shapes: readonly ObjectiveHitShape[],
  point: HitPoint
): ObjectiveHitShape[] => {
  const hits = shapes.filter((shape) => isHit(shape, point));
  hits.sort((a, b) => hitRank(a) - hitRank(b));
  const seen = new Set<string>();
  return hits.filter((shape) => {
    if (seen.has(shape.objectiveId)) return false;
    seen.add(shape.objectiveId);
    return true;
  });
};
/** Preserves the source object for each first-ranked objective hit. */
export const findObjectiveHitSourcesAtPoint = <T>(
  candidates: readonly ObjectiveHitCandidate<T>[],
  point: HitPoint
): ObjectiveHitSource<T>[] => {
  const sourceByShape = new Map(candidates.map(({ shape, source }) => [shape, source]));
  return findObjectiveHitsAtPoint(
    candidates.map(({ shape }) => shape),
    point
  ).map((shape) => ({ shape, source: sourceByShape.get(shape)! }));
};
/** Returns each hit objective's source, substituting the hovered occurrence. */
export const findObjectiveHitStackAtPoint = <T extends { objectiveId: string }>(
  candidates: readonly ObjectiveHitCandidate<T>[],
  point: HitPoint,
  fallback: T
): T[] => {
  const entries = findObjectiveHitSourcesAtPoint(candidates, point).map(({ source }) => source);
  const fallbackIndex = entries.findIndex((entry) => entry.objectiveId === fallback.objectiveId);
  if (fallbackIndex < 0) return [fallback, ...entries];
  entries[fallbackIndex] = fallback;
  return entries;
};
/** Returns the unique objective IDs whose shapes contain `point`. */
export const findObjectivesAtPoint = (
  shapes: readonly ObjectiveHitShape[],
  point: HitPoint
): string[] => findObjectiveHitsAtPoint(shapes, point).map((shape) => shape.objectiveId);
