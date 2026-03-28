import { describe, expect, it } from 'vitest';
import mapsData from '@/data/maps.json';
describe('maps static data', () => {
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
