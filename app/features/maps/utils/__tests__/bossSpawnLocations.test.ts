import { describe, expect, it } from 'vitest';
import { getBossPins, resolveMergedBossSpawns } from '@/features/maps/utils/bossSpawnLocations';
describe('boss spawn map locations', () => {
  it('keeps shared spawn entries under one real pin and skips disabled or unmapped areas', () => {
    const position = { x: 10, y: 20, z: 30 };
    const other = { ...position, x: 50 };
    const area = {
      name: 'Stronghold',
      chance: 0.33,
      positions: [other, position, { ...position, x: 0 }],
    };
    const reshala = {
      name: 'Reshala',
      chance: 0.6,
      locations: [area, { ...area, name: 'Dorms', positions: [] }],
    };
    const knight = {
      name: 'Knight',
      chance: 0.2,
      locations: [
        { ...area, chance: 1 },
        { ...area, chance: 0, positions: [other] },
      ],
    };
    const disabled = { ...knight, chance: 0 };
    const map = { id: 'customs', name: 'Customs', bossSpawns: [reshala, knight, disabled] };
    const pins = getBossPins(map);
    expect(pins).toHaveLength(1);
    expect(pins[0]?.position).toEqual(position);
    expect(pins[0]?.encounters.map(({ boss, location }) => [boss.chance, location.chance])).toEqual(
      [
        [0.6, 0.33],
        [0.2, 1],
      ]
    );
  });
  it('keeps spawn rates separate by source map when variants share a map view', () => {
    const boss = { name: 'Tagilla', chance: 0.3, locations: [] };
    const maps = [
      { id: 'day', name: 'Factory', bossSpawns: [boss] },
      { id: 'night', name: 'Night Factory', bossSpawns: [{ ...boss, chance: 0.4 }] },
    ];
    expect(resolveMergedBossSpawns(maps)).toEqual([
      { ...boss, mapName: 'Factory' },
      { ...boss, chance: 0.4, mapName: 'Night Factory' },
    ]);
  });
});
