import { describe, expect, it } from 'vitest';
import { getBossPins } from '@/features/maps/utils/bossSpawnLocations';
import { projectBossSpawns } from '@/server/utils/bossSpawnProjection';
import type { TarkovMap } from '@/types/tarkov';
const cases = [
  {
    mapId: '56f40101d2720b2a4d8b45d6',
    zones: ['ZoneDormitory', 'ZoneGasStation'],
    pinRoles: [['bossBully'], ['bossBully']],
    points: [8, 9],
    pins: [
      { x: 171.889282, y: 2.83300018, z: 172.208786 },
      { x: 430.815033, y: 1.88306046, z: 54.8594666 },
    ],
  },
  {
    mapId: '5704e554d2720bac5b8b456e',
    zones: ['ZonePort', 'ZoneForestSpawn'],
    pinRoles: [['bossSanitar'], ['sectantPriest']],
    points: [10, 4],
    pins: [
      { x: -323.5232, y: -62.0306168, z: 498.4858 },
      { x: 143.34, y: -33.5435829, z: -288.24 },
    ],
  },
  {
    mapId: '65cc8f81a9aac3e77d0cfd3e',
    zones: ['Zone2ScavPort29'],
    pinRoles: [['bossBully', 'bossGluhar', 'bossKilla', 'bossSanitar', 'bossTagilla']],
    points: [3],
    pins: [{ x: -73.276, y: -60.24734, z: 190.63 }],
  },
];
describe('boss spawn position fallbacks', () => {
  it.each(cases)(
    'projects only verified boss areas for $mapId',
    ({ mapId, pinRoles, zones, points, pins }) => {
      const roles = [...new Set(pinRoles.flat()), 'bossPartisan'];
      const mobs = Object.fromEntries(roles.map((role) => [role, { name: role }]));
      const rows = roles.map((mob) => ({
        mob,
        spawnChance: 0.2,
        spawnLocations: zones.map((zone) => ({
          name: `@tt:pvp-season:maps:${zone}`,
          chance: 0.4,
          positions: [],
        })),
      }));
      const bossSpawns = projectBossSpawns(rows, mobs, mapId);
      const visiblePins = getBossPins({ id: mapId, bossSpawns } as TarkovMap);
      expect(visiblePins.map((pin) => pin.position)).toEqual(pins);
      expect(visiblePins.map((pin) => pin.encounters.map(({ boss }) => boss.name))).toEqual(
        pinRoles
      );
      visiblePins.forEach((pin, index) => {
        pin.encounters.forEach(({ boss, location }) => {
          expect(boss.chance).toBe(0.2);
          expect(location.chance).toBe(0.4);
          expect(location.positions).toHaveLength(points[index]!);
        });
      });
      expect(bossSpawns.at(-1)?.locations.every((location) => !location.positions.length)).toBe(
        true
      );
    }
  );
});
