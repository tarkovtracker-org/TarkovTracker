import { describe, expect, it } from 'vitest';
import {
  createMarkerBadgeElement,
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
  it('builds a labeled badge with a colored glyph chip and text-only label', () => {
    const badge = createMarkerBadgeElement('transit', '#cf5959', 'Transit to <Reserve>');
    expect(badge.className).toBe('extract-badge extract-badge--transit');
    expect(badge.getAttribute('title')).toBe('Transit to <Reserve>');
    expect(badge.getAttribute('aria-label')).toBe('Transit to <Reserve>');
    const chip = badge.querySelector<HTMLElement>('.map-marker-glyph');
    const reference = document.createElement('span');
    reference.style.backgroundColor = '#cf5959';
    expect(chip?.style.backgroundColor).toBe(reference.style.backgroundColor);
    expect(badge.style.borderColor).toBeTruthy();
    expect(chip?.querySelector('path')?.getAttribute('d')).toBe(MAP_MARKER_GLYPH_PATHS.transit);
    expect(badge.querySelector('.extract-badge-label')?.textContent).toBe('Transit to <Reserve>');
    expect(badge.querySelector('reserve')).toBeNull();
  });
});
