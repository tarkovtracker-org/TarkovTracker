import { describe, expect, it } from 'vitest';
import floorData from '@/data/mapFloors.json';
import mapsData from '@/data/maps.json';
import { normalizeTileConfig } from '@/utils/mapCoordinates';
import type { MapTileConfig } from '@/types/tarkov';
describe('maps static data', () => {
  it('provides an Icebreaker tile set for every selectable deck', () => {
    const { tile } = mapsData.icebreaker;
    expect(tile.floors).toHaveLength(16);
    expect(tile.floors).toEqual(floorData.icebreaker.order);
    expect(tile.defaultFloor).toBe(floorData.icebreaker.base);
    expect(Object.keys(tile.floorTilePaths)).toEqual(tile.floors);
    expect(tile.tilePath).toBe(tile.floorTilePaths.Infirmary);
    expect(normalizeTileConfig(tile as unknown as MapTileConfig).transform).toEqual([
      1.5, 128, 1.4, 130.5,
    ]);
  });
  it('keeps reserve floor controls aligned with the shared SVG', () => {
    expect(mapsData.reserve.svg).toMatchObject({
      floors: ['Bunkers', 'Ground_Level'],
      stackFloors: false,
    });
  });
  it('exposes terminal as a multi-floor SVG map', () => {
    expect(mapsData.terminal.svg).toMatchObject({
      floors: ['Ground_Level', '2nd Floor'],
      defaultFloor: 'Ground_Level',
    });
  });
});
