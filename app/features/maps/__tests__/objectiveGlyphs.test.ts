import { describe, expect, it } from 'vitest';
import { DARK_GLYPH_INK, LIGHT_GLYPH_INK } from '@/features/maps/utils/colorContrast';
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
  it('builds a raised chip in the category color that fades with off-floor objectives', () => {
    const glyph = createObjectiveGlyphElement('plant', {
      color: '#f59e0b',
      selectedColor: '#7c3bed',
    });
    expect(glyph.dataset.kind).toBe('plant');
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(glyph.classList).toContain('pointer-events-none');
    expect(glyph.style.getPropertyValue('--chip-color')).toBe('#f59e0b');
    expect(glyph.style.getPropertyValue('--chip-selected')).toBe('#7c3bed');
    expect(glyph.classList).not.toContain('opacity-70');
    expect(glyph.querySelector('path')?.getAttribute('d')).toBe(MAP_OBJECTIVE_GLYPH_PATHS.plant);
    const offFloor = createObjectiveGlyphElement('shoot', {
      color: '#f59e0b',
      selectedColor: '#7c3bed',
      offFloor: true,
    });
    expect(offFloor.classList).toContain('opacity-70');
    expect(offFloor.classList).toContain('map-objective-glyph--off-floor');
  });
  it('inks the glyph for contrast against the fill and the selected color', () => {
    const light = createObjectiveGlyphElement('find', {
      color: '#f0e442',
      selectedColor: '#7c3bed',
    });
    expect(light.style.getPropertyValue('--chip-ink')).toBe(DARK_GLYPH_INK);
    expect(light.style.getPropertyValue('--chip-ink-shadow')).toBe('rgba(255,255,255,0.55)');
    expect(light.style.getPropertyValue('--chip-selected-ink')).toBe(LIGHT_GLYPH_INK);
    const dark = createObjectiveGlyphElement('find', {
      color: '#0072b2',
      selectedColor: '#f0e442',
    });
    expect(dark.style.getPropertyValue('--chip-ink')).toBe(LIGHT_GLYPH_INK);
    expect(dark.style.getPropertyValue('--chip-ink-shadow')).toBe('rgba(0,0,0,0.85)');
    expect(dark.style.getPropertyValue('--chip-selected-ink')).toBe(DARK_GLYPH_INK);
  });
});
