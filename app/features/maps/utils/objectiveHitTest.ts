/**
 * Pure hit-testing for map objective shapes in container pixel space, used to
 * list every objective under the cursor when zones and points overlap (#919).
 */
export type HitPoint = { x: number; y: number };
export type ObjectiveHitShape =
  | { kind: 'zone'; objectiveId: string; ring: HitPoint[]; area: number }
  | { kind: 'point'; objectiveId: string; center: HitPoint; radius: number };
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
  if (shape.kind === 'zone') return isInsideRing(shape.ring, point);
  return Math.hypot(shape.center.x - point.x, shape.center.y - point.y) <= shape.radius;
};
/** Points first (most specific), then zones from smallest to largest area. */
const hitRank = (shape: ObjectiveHitShape): number => (shape.kind === 'point' ? -1 : shape.area);
/**
 * Returns the unique objective IDs whose shapes contain `point`, most specific
 * first.
 */
export const findObjectivesAtPoint = (
  shapes: readonly ObjectiveHitShape[],
  point: HitPoint
): string[] => {
  const hits = shapes.filter((shape) => isHit(shape, point));
  hits.sort((a, b) => hitRank(a) - hitRank(b));
  return [...new Set(hits.map((shape) => shape.objectiveId))];
};
