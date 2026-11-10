import { describe, expect, it } from 'vitest';
import {
  createMapPinElement,
  getExtractGlyphKind,
  MAP_MARKER_GLYPH_COLOR_KEYS,
  MAP_MARKER_GLYPH_PATHS,
} from '@/features/maps/utils/markerGlyphs';
import type { MapExtract } from '@/types/tarkov';
const extract = (faction: MapExtract['faction'], name = 'Gate'): MapExtract => ({
  id: name,
  name,
  faction,
});
describe('markerGlyphs', () => {
  it('classifies extracts by who can use them', () => {
    expect(getExtractGlyphKind(extract('pmc'))).toBe('pmc');
    expect(getExtractGlyphKind(extract('scav'))).toBe('scav');
    expect(getExtractGlyphKind(extract('shared'))).toBe('shared');
    expect(getExtractGlyphKind(extract('shared', 'Scav Co-Op Exfil'))).toBe('coop');
    expect(getExtractGlyphKind(extract(null))).toBe('extract');
    expect(getExtractGlyphKind(extract(undefined))).toBe('extract');
  });
  it('gives every glyph path data and a customizable color', () => {
    for (const kind of Object.keys(MAP_MARKER_GLYPH_PATHS) as Array<
      keyof typeof MAP_MARKER_GLYPH_PATHS
    >) {
      expect(MAP_MARKER_GLYPH_PATHS[kind]).toMatch(/^M/);
      expect(MAP_MARKER_GLYPH_COLOR_KEYS[kind]).toBeTruthy();
    }
  });
  it('builds a pin whose name is text-only and doubles as its accessible name', () => {
    const pin = createMapPinElement('transit', '#cf5959', 'Transit to <Reserve>');
    expect(pin.classList).toContain('map-pin');
    expect(pin.classList).toContain('map-pin--transit');
    expect(pin.getAttribute('role')).toBe('img');
    // The styled label already shows on hover, so there is no duplicate native tooltip.
    expect(pin.hasAttribute('title')).toBe(false);
    expect(pin.getAttribute('aria-label')).toBe('Transit to <Reserve>');
    expect(pin.style.getPropertyValue('--pin-color')).toBe('#cf5959');
    const head = pin.querySelector('.map-pin-head');
    expect(head?.querySelector('path')?.getAttribute('d')).toBe(MAP_MARKER_GLYPH_PATHS.transit);
    const label = pin.querySelector('.map-pin-label');
    expect(label?.textContent).toBe('Transit to <Reserve>');
    expect(label?.classList).toContain('border-dashed');
    expect(pin.querySelector('reserve')).toBeNull();
  });
  it('ignores inherited property names when classifying factions', () => {
    const odd = { id: 'x', name: 'Odd', faction: 'toString' } as unknown as MapExtract;
    expect(getExtractGlyphKind(odd)).toBe('extract');
  });
});
