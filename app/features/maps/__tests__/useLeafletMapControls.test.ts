import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
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
        PMC_EXTRACT: '#f97316',
        PMC_SPAWN: '#ef4444',
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
  };
};
describe('useLeafletMapControls', () => {
  it('derives extract/spawn visibility and clamps slider settings', () => {
    const controls = useLeafletMapControls({
      map: ref({
        extracts: [{ faction: 'shared', name: 'Co-op extract' }],
        id: 'woods',
        spawns: [{ categories: ['player'], position: { x: 1, y: 0, z: 1 }, sides: ['pmc'] }],
      } as TarkovMap),
      preferencesStore: createPreferencesStore(),
      t: (key: string) => key,
    });
    expect(controls.hasPmcSpawns.value).toBe(true);
    expect(controls.hasCoopExtracts.value).toBe(true);
    controls.mapZoomSpeed.value = 9;
    controls.mapPanSpeed.value = -4;
    controls.mapZoneOpacity.value = 9;
    expect(controls.mapZoomSpeed.value).toBe(3);
    expect(controls.mapPanSpeed.value).toBe(0.5);
    expect(controls.mapZoneOpacity.value).toBe(0.5);
  });
});
