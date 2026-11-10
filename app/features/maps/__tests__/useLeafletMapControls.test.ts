import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { useLeafletMapControls } from '@/features/maps/composables/useLeafletMapControls';
import type { TarkovMap } from '@/types/tarkov';
const createPreferencesStore = () => {
  const state = {
    mapPanSpeed: 1,
    mapZoneOpacity: 0.2,
    mapZoomSpeed: 1,
  };
  return {
    get getMapMarkerColors() {
      return {
        COOP_EXTRACT: '#22c55e',
        DEFAULT_EXTRACT: '#64748b',
        EXTRACT_DOT_BORDER: '#ffffff',
        MARKER_BORDER: '#000000',
        PINNED_OBJECTIVE: '#7c3bed',
        PMC_EXTRACT: '#f97316',
        PMC_SPAWN: '#ef4444',
        TRANSIT: '#cf5959',
        SCAV_EXTRACT: '#3b82f6',
        SELECTED: '#f59e0b',
        SELF_OBJECTIVE: '#10b981',
        SHARED_EXTRACT: '#a855f7',
        TEAM_OBJECTIVE: '#38bdf8',
      };
    },
    get getMapZoneOpacity() {
      return state.mapZoneOpacity;
    },
    get getMapZoomSpeed() {
      return state.mapZoomSpeed;
    },
    get mapPanSpeed() {
      return state.mapPanSpeed;
    },
    setMapMarkerColor: () => {},
    setMapPanSpeed: (value: number) => {
      state.mapPanSpeed = value;
    },
    setMapZoneOpacity: (value: number) => {
      state.mapZoneOpacity = value;
    },
    setMapZoomSpeed: (value: number) => {
      state.mapZoomSpeed = value;
    },
    get getMapTooltipDensity() {
      return 'default' as 'default' | 'compact';
    },
    setMapTooltipDensity: () => {},
  };
};
describe('useLeafletMapControls', () => {
  it('keeps transits independent and updates them when the map changes', async () => {
    const map = ref<TarkovMap>({ id: 'empty', name: 'Empty' });
    const controls = useLeafletMapControls({
      map,
      preferencesStore: createPreferencesStore(),
      showExtracts: false,
      t: (key: string) => key,
    });
    expect(controls.mapTransits.value).toEqual([]);
    expect(controls.hasTransits.value).toBe(false);
    expect(controls.showTransits.value).toBe(true);
    const transit = {
      id: '9',
      description: 'Transit to Reserve',
      map: 'reserve',
      position: { x: 650.64, y: 1.59, z: 124.94 },
    };
    map.value = {
      id: 'customs',
      name: 'Customs',
      transits: [
        transit,
        { ...transit, id: 'bad', position: { x: NaN, y: 0, z: 1 } },
        { ...transit, id: 'missing', position: undefined },
      ],
    };
    expect(controls.mapTransits.value).toEqual([transit]);
    expect(controls.hasTransits.value).toBe(true);
    controls.showPmcExtracts.value = true;
    controls.showScavExtracts.value = true;
    controls.showPmcSpawns.value = true;
    controls.showTransits.value = false;
    await nextTick();
    expect(controls.showPmcExtracts.value).toBe(true);
    expect(controls.showScavExtracts.value).toBe(true);
    expect(controls.showPmcSpawns.value).toBe(true);
  });
  it('derives extract/spawn visibility and clamps slider settings', () => {
    const controls = useLeafletMapControls({
      map: ref({
        extracts: [
          { faction: 'shared', name: 'Co-op extract', position: { x: 1, y: 0, z: 1 } },
          // Layers rows only count extracts the map can draw.
          { faction: 'pmc', name: 'No position' },
          { faction: null, name: 'Unknown', position: { x: 2, y: 0, z: 2 } },
        ],
        id: 'woods',
        spawns: [{ categories: ['player'], position: { x: 1, y: 0, z: 1 }, sides: ['pmc'] }],
      } as TarkovMap),
      preferencesStore: createPreferencesStore(),
      t: (key: string) => key,
    });
    expect(controls.hasPmcSpawns.value).toBe(true);
    expect(controls.hasCoopExtracts.value).toBe(true);
    expect(controls.hasPmcExtracts.value).toBe(false);
    expect(controls.hasScavExtracts.value).toBe(false);
    expect(controls.hasSharedExtracts.value).toBe(false);
    expect(controls.hasUnknownFactionExtracts.value).toBe(true);
    controls.mapZoomSpeed.value = 9;
    controls.mapPanSpeed.value = -4;
    controls.mapZoneOpacity.value = 9;
    expect(controls.mapZoomSpeed.value).toBe(3);
    expect(controls.mapPanSpeed.value).toBe(0.5);
    expect(controls.mapZoneOpacity.value).toBe(0.5);
  });
});
