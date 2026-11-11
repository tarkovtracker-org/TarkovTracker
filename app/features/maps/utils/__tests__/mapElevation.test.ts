import { describe, expect, it } from 'vitest';
import maps from '@/data/maps.json';
import { createElevationIndicator, getMapFloorDelta } from '@/features/maps/utils/mapElevation';
import { isDrawableMapPosition } from '@/features/maps/utils/mapLocations';
import type { TarkovMap } from '@/types/tarkov';
const groundZero = {
  id: '653e6760052c01c1c805532f',
  name: 'Ground Zero',
  svg: maps.groundzero.svg,
} as TarkovMap;
const at = (x: number, y: number, z: number) => ({ position: { x, y, z } });
describe('source-map coordinate validation', () => {
  it.each(
    [
      null,
      [],
      [null, [1, 1]],
      Array(2),
      [Array(2), [1, 1]],
      [[0], [1, 1]],
      [
        [0, 0],
        [Infinity, 1],
      ],
      [
        ['0', 0],
        [1, 1],
      ],
    ].map((bounds) => ({ bounds }))
  )('rejects malformed render bounds without throwing: %j', ({ bounds }) => {
    const position = { x: 0, z: 0 };
    const svgMap = {
      ...groundZero,
      svg: { ...maps.groundzero.svg, bounds },
    } as unknown as TarkovMap;
    expect(() => isDrawableMapPosition(svgMap, position)).not.toThrow();
    expect(isDrawableMapPosition(svgMap, position)).toBe(false);
    const tileMap = {
      ...groundZero,
      svg: undefined,
      tile: { ...maps.lab.tile, bounds },
    } as unknown as TarkovMap;
    expect(() => isDrawableMapPosition(tileMap, position)).not.toThrow();
    expect(isDrawableMapPosition(tileMap, position)).toBe(false);
  });
  it('rejects all three contaminated Ground Zero records but preserves their real maps', () => {
    for (const position of [
      { x: -527.87, y: 1.68, z: 288.23 },
      { x: 220.43, y: 20.54, z: -705.8 },
      { x: -113.71, y: -2.93, z: 65.63 },
    ]) {
      expect(isDrawableMapPosition(groundZero, position)).toBe(false);
      expect(isDrawableMapPosition({ id: 'woods', name: 'Woods' }, position)).toBe(true);
    }
  });
  it('keeps the six native extracts and the source-map Streets transit unchanged', () => {
    for (const [x, z] of [
      [-16.12, 335.06],
      [25.22, -79.54],
      [190.8, 133.39],
      [218.23, -38.51],
      [151.63, -97.46],
      [-19.51, 114.94],
      [229.6, 65.36],
    ]) {
      expect(isDrawableMapPosition(groundZero, { x: x!, z: z! })).toBe(true);
    }
    expect(isDrawableMapPosition(groundZero, { x: NaN, z: 0 })).toBe(false);
    expect(isDrawableMapPosition(groundZero, { x: 0, z: Infinity })).toBe(false);
    expect(isDrawableMapPosition(groundZero)).toBe(false);
  });
});
describe('floor-relative elevation', () => {
  it('counts ordered levels in either direction, including the garage', () => {
    expect(getMapFloorDelta(groundZero, '3rd Floor', at(80, 14, 100))).toBe(-3);
    expect(getMapFloorDelta(groundZero, 'Garage', at(80, 34, 100))).toBe(3);
    expect(getMapFloorDelta(groundZero, 'Ground_Level', at(80, 30, 100))).toBe(1);
  });
  it('uses spatial garage and showroom exceptions instead of a global height cutoff', () => {
    expect(getMapFloorDelta(groundZero, 'Ground_Level', at(218.23, 17.99, -38.51))).toBe(0);
    expect(getMapFloorDelta(groundZero, 'Ground_Level', at(130, 17, 65))).toBe(-1);
    expect(getMapFloorDelta(groundZero, 'Ground_Level', at(95, 27, 220))).toBe(1);
    expect(getMapFloorDelta(groundZero, 'Ground_Level', at(120, 27, 220))).toBe(0);
  });
  it('uses half-open height boundaries and supports overlapping vertical zones', () => {
    expect(getMapFloorDelta(groundZero, 'Ground_Level', at(80, 28, 100))).toBe(1);
    expect(getMapFloorDelta(groundZero, '2nd Floor', at(80, 32.3, 100))).toBe(1);
    const zone = { ...at(56.6, 32.34, 130.6), bottom: 30.84, top: 33.84 };
    expect(getMapFloorDelta(groundZero, '2nd Floor', zone)).toBe(0);
    expect(getMapFloorDelta(groundZero, '3rd Floor', zone)).toBe(0);
    expect(getMapFloorDelta(groundZero, 'Garage', zone)).toBe(2);
  });
  it('keeps unknown heights unknown, but accepts a real height of zero', () => {
    expect(getMapFloorDelta(groundZero, '3rd Floor', { position: { x: 80, z: 100 } })).toBe(0);
    expect(getMapFloorDelta(groundZero, '3rd Floor', at(80, NaN, 100))).toBe(0);
    expect(
      getMapFloorDelta(groundZero, '3rd Floor', { ...at(80, 14, 100), bottom: 20, top: 10 })
    ).toBe(0);
    const factory = { id: 'factory', name: 'Factory', svg: maps.factory.svg } as TarkovMap;
    expect(getMapFloorDelta(factory, '3rd Floor', at(0, 0, 0))).toBe(-2);
  });
  it('counts four levels on Streets and does not infer unsupported floors', () => {
    const streets = { id: 'streets', name: 'Streets', svg: maps.streetsoftarkov.svg } as TarkovMap;
    expect(getMapFloorDelta(streets, '5th Floor', at(0, 0, 0))).toBe(-4);
    expect(getMapFloorDelta(streets, 'Underground', at(0, 30, 0))).toBe(5);
    const terminal = { id: 'terminal', name: 'Terminal', svg: maps.terminal.svg } as TarkovMap;
    expect(getMapFloorDelta(terminal, '2nd Floor', at(0, 30, 0))).toBe(0);
  });
  it('renders exactly one arrow per level with an accessible direction', () => {
    const indicator = createElevationIndicator(-4, 'Go down 4 levels');
    expect(indicator?.textContent).toBe('↓↓↓↓');
    expect(indicator?.getAttribute('aria-label')).toBe('Go down 4 levels');
    expect(createElevationIndicator(2, 'Go up 2 levels')?.textContent).toBe('↑↑');
    expect(createElevationIndicator(0, '')).toBeNull();
  });
  it('supports Labs tile floors without applying their heights to unrelated tiles', () => {
    const labs = { id: 'lab', name: 'The Lab', tile: maps.lab.tile } as unknown as TarkovMap;
    expect(getMapFloorDelta(labs, 'Technical', at(-150, 5, -300))).toBe(2);
    expect(getMapFloorDelta(labs, 'Second_Level', at(-150, -2, -300))).toBe(-2);
    const unrelated = { ...labs, tile: { ...labs.tile!, defaultFloor: 'Unmapped' } };
    expect(getMapFloorDelta(unrelated, 'Technical', at(-150, 5, -300))).toBe(0);
  });
  it('does not invent arrows for Reserve floors absent from its artwork', () => {
    const reserve = { id: 'reserve', name: 'Reserve', svg: maps.reserve.svg } as TarkovMap;
    expect(getMapFloorDelta(reserve, 'Bunkers', at(-10, 28, 180))).toBe(0);
    expect(getMapFloorDelta(reserve, 'Ground_Level', at(40, -9, -100))).toBe(-1);
  });
});
