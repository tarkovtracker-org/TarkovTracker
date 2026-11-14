import { describe, expect, it } from 'vitest';
import { OBJECTIVE_CHIP_SIZE } from '@/features/maps/utils/objectiveGlyphs';
import {
  ZONE_OUTLINE_MIN_PX,
  zoneOutlineStyle,
  zoneScreenSize,
} from '@/features/maps/utils/objectiveZoneOutline';
describe('objective zone outlines', () => {
  it('measures the larger side of a zone on screen', () => {
    const ring = [
      { x: 10, y: 10 },
      { x: 50, y: 12 },
      { x: 30, y: 25 },
    ];
    expect(zoneScreenSize(ring)).toBe(40);
    expect(zoneScreenSize([])).toBe(0);
  });
  it('hides zones that would only peek out around the chip', () => {
    expect(ZONE_OUTLINE_MIN_PX).toBe(Math.round(OBJECTIVE_CHIP_SIZE * 1.5));
    expect(zoneOutlineStyle(ZONE_OUTLINE_MIN_PX - 1, false, 0.24)).toEqual({
      opacity: 0,
      fillOpacity: 0,
      weight: 2.25,
    });
    expect(zoneOutlineStyle(ZONE_OUTLINE_MIN_PX, false, 0.24)).toEqual({
      opacity: 0.95,
      fillOpacity: 0.24,
      weight: 2.25,
    });
  });
  it('shows any zone while it or its chip is hovered, capped at the hover maximum', () => {
    expect(zoneOutlineStyle(3, true, 0.24)).toEqual({ opacity: 0.95, fillOpacity: 0.4, weight: 3 });
    expect(zoneOutlineStyle(300, true, 0.5).fillOpacity).toBe(0.6);
  });
});
