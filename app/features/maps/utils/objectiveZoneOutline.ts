import { OBJECTIVE_CHIP_SIZE } from '@/features/maps/utils/objectiveGlyphs';
/**
 * A zone's outline is drawn only once it is clearly larger on screen than the chip at its centre
 * (1.5 chips, 39 px). Smaller zones would only peek out around the chip as a box.
 */
export const ZONE_OUTLINE_MIN_PX = Math.round(OBJECTIVE_CHIP_SIZE * 1.5);
const ZONE_WEIGHT = 2.25;
const ZONE_HOVER_WEIGHT = 3;
const ZONE_OPACITY = 0.95;
const ZONE_HOVER_DELTA = 0.16;
const ZONE_HOVER_MAX = 0.6;
type ScreenPoint = { x: number; y: number };
/** The larger side, in container pixels, of the box around a zone's projected outline. */
export function zoneScreenSize(points: readonly ScreenPoint[]): number {
  if (!points.length) return 0;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}
export type ZoneOutlineStyle = { opacity: number; fillOpacity: number; weight: number };
/**
 * Leaflet path style for a zone. Hovering the zone or its chip always shows the outline, so a
 * small zone's exact shape is still one hover away.
 */
export function zoneOutlineStyle(
  screenSize: number,
  hovered: boolean,
  fillOpacity: number
): ZoneOutlineStyle {
  if (hovered) {
    return {
      opacity: ZONE_OPACITY,
      fillOpacity: Math.min(fillOpacity + ZONE_HOVER_DELTA, ZONE_HOVER_MAX),
      weight: ZONE_HOVER_WEIGHT,
    };
  }
  const visible = screenSize >= ZONE_OUTLINE_MIN_PX;
  return {
    opacity: visible ? ZONE_OPACITY : 0,
    fillOpacity: visible ? fillOpacity : 0,
    weight: ZONE_WEIGHT,
  };
}
