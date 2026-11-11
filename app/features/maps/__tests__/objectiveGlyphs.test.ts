import { describe, expect, it } from 'vitest';
import { MAP_MARKER_GLYPH_PATHS } from '@/features/maps/utils/markerGlyphs';
import {
  createObjectiveGlyphElement,
  getObjectiveGlyphKind,
  MAP_OBJECTIVE_GLYPH_LEGEND_KINDS,
  MAP_OBJECTIVE_GLYPH_PATHS,
} from '@/features/maps/utils/objectiveGlyphs';
import { MAP_OBJECTIVE_TYPES } from '@/features/tasks/taskObjectiveTypes';
describe('objective glyphs', () => {
  it.each([
    ['visit', 'visit'],
    ['zone', 'visit'],
    ['findItem', 'find'],
    ['findQuestItem', 'find'],
    ['plantItem', 'plant'],
    ['plantQuestItem', 'plant'],
    ['place', 'plant'],
    ['mark', 'mark'],
    ['shoot', 'shoot'],
    ['useItem', 'use'],
    ['extract', 'extract'],
  ])('draws %s objectives with the %s glyph', (type, kind) => {
    expect(getObjectiveGlyphKind(type)).toBe(kind);
  });
  it('gives every map objective type its own action, and others the generic flag', () => {
    for (const type of MAP_OBJECTIVE_TYPES) expect(getObjectiveGlyphKind(type)).not.toBe('other');
    expect(getObjectiveGlyphKind(undefined)).toBe('other');
    expect(getObjectiveGlyphKind('giveItem')).toBe('other');
    expect(getObjectiveGlyphKind('constructor')).toBe('other');
  });
  it('lists every glyph once in the legend, each with path data', () => {
    const kinds = Object.keys(MAP_OBJECTIVE_GLYPH_PATHS);
    expect([...MAP_OBJECTIVE_GLYPH_LEGEND_KINDS].sort()).toEqual([...kinds].sort());
    for (const kind of MAP_OBJECTIVE_GLYPH_LEGEND_KINDS) {
      expect(MAP_OBJECTIVE_GLYPH_PATHS[kind]).toMatch(/^M/);
    }
    expect(new Set(Object.values(MAP_OBJECTIVE_GLYPH_PATHS)).size).toBe(kinds.length);
    expect(MAP_OBJECTIVE_GLYPH_PATHS.extract).toBe(MAP_MARKER_GLYPH_PATHS.extract);
  });
  it('builds a decorative glyph that fades with off-floor objectives', () => {
    const glyph = createObjectiveGlyphElement('plant');
    expect(glyph.dataset.kind).toBe('plant');
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(glyph.classList).toContain('pointer-events-none');
    expect(glyph.classList).not.toContain('opacity-55');
    expect(glyph.querySelector('path')?.getAttribute('d')).toBe(MAP_OBJECTIVE_GLYPH_PATHS.plant);
    expect(createObjectiveGlyphElement('shoot', true).classList).toContain('opacity-55');
  });
});
