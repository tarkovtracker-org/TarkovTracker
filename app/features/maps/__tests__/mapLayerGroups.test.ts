import { describe, expect, it } from 'vitest';
import {
  buildMapLayerGroups,
  countHiddenLayers,
  type MapLayerGroupsInput,
} from '@/features/maps/utils/mapLayerGroups';
import { MAP_MARKER_COLORS } from '@/utils/theme-colors';
const toggle = (value: boolean) => ({ value });
const createInput = (available: Partial<MapLayerGroupsInput['available']> = {}) =>
  ({
    t: (key: string) => key,
    colors: { ...MAP_MARKER_COLORS },
    objectives: { self: toggle(true), pinned: toggle(true), team: toggle(false) },
    extracts: { pmc: toggle(true), scav: toggle(false), shared: toggle(true), coop: toggle(true) },
    transit: toggle(true),
    spawns: toggle(false),
    available: {
      pmc: true,
      scav: true,
      shared: true,
      coop: true,
      transit: true,
      spawns: true,
      ...available,
    },
  }) satisfies MapLayerGroupsInput;
const keysOf = (input: MapLayerGroupsInput) =>
  buildMapLayerGroups(input).map((group) => [group.key, group.items.map((item) => item.key)]);
describe('buildMapLayerGroups', () => {
  it('lists every available marker type with its swatch, color, and toggle', () => {
    const input = createInput();
    expect(keysOf(input)).toEqual([
      ['tasks', ['self', 'pinned', 'team']],
      ['extracts', ['pmc', 'scav', 'shared', 'coop']],
      ['locations', ['transit', 'spawns']],
    ]);
    const extracts = buildMapLayerGroups(input)[1]!.items;
    expect(extracts.map((item) => item.swatch)).toEqual(['pmc', 'scav', 'shared', 'coop']);
    expect(extracts[0]!.color).toBe(MAP_MARKER_COLORS.PMC_EXTRACT);
    expect(extracts[0]!.visible).toBe(input.extracts.pmc);
    expect(extracts[2]!.label).toBe('maps.layers.shared_or_unknown');
    expect(extracts[2]!.hint).toBe('maps.layers.shared_or_unknown_hint');
    expect(extracts[2]).toMatchObject({
      secondaryGlyph: { kind: 'extract', color: MAP_MARKER_COLORS.DEFAULT_EXTRACT },
    });
  });
  it('omits marker types the current map does not have', () => {
    expect(keysOf(createInput({ shared: false, transit: false, spawns: false }))).toEqual([
      ['tasks', ['self', 'pinned', 'team']],
      ['extracts', ['pmc', 'scav', 'coop']],
    ]);
    expect(keysOf(createInput({ pmc: false, scav: false, shared: false, coop: false }))).toEqual([
      ['tasks', ['self', 'pinned', 'team']],
      ['locations', ['transit', 'spawns']],
    ]);
  });
  it('counts hidden rows', () => {
    expect(countHiddenLayers(buildMapLayerGroups(createInput()))).toBe(3);
    expect(countHiddenLayers(buildMapLayerGroups(createInput({ spawns: false })))).toBe(2);
  });
});
