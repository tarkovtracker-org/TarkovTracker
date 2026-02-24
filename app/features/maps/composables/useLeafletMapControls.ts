import { getMapColorOptions, type MapMarkerColorKey } from '@/utils/theme-colors';
import type { MapExtract, MapSpawn, TarkovMap } from '@/types/tarkov';
type TranslateFn = (key: string, fallback?: string) => string;
type RefLike<T> = { value: T };
type UseLeafletMapControlsOptions = {
  map: RefLike<TarkovMap>;
  preferencesStore: {
    getMapMarkerColors: Record<MapMarkerColorKey, string>;
    getMapZoneOpacity: number;
    getMapZoomSpeed: number;
    mapPanSpeed?: number;
    setMapMarkerColor: (key: MapMarkerColorKey, value: string) => void;
    setMapPanSpeed: (value: number) => void;
    setMapZoneOpacity: (value: number) => void;
    setMapZoomSpeed: (value: number) => void;
  };
  showExtracts?: boolean;
  showPmcExtracts?: boolean;
  showPmcSpawns?: boolean;
  showScavExtracts?: boolean;
  t: TranslateFn;
};
export const ZOOM_SPEED_MIN = 0.5;
export const ZOOM_SPEED_MAX = 3;
export const PAN_SPEED_MIN = 0.5;
export const PAN_SPEED_MAX = 3;
export const ZONE_OPACITY_MIN = 0.05;
export const ZONE_OPACITY_MAX = 0.5;
export const MAP_BUTTON_ACTIVE_CLASS = '!bg-surface-700/80 !text-surface-50 !ring-1 !ring-white/30';
export const MAP_BUTTON_INACTIVE_CLASS = 'text-surface-300 hover:text-surface-100';
export const isCoopExtract = (extract: MapExtract): boolean =>
  /\bco-?op\b/i.test(extract.name || '');
export function useLeafletMapControls({
  map,
  preferencesStore,
  showExtracts = true,
  showPmcExtracts: initialShowPmcExtracts,
  showPmcSpawns: initialShowPmcSpawns = false,
  showScavExtracts: initialShowScavExtracts,
  t,
}: UseLeafletMapControlsOptions) {
  const mapColors = computed(() => preferencesStore.getMapMarkerColors);
  const mapExtracts = computed<MapExtract[]>(() => map.value?.extracts ?? []);
  const mapPmcSpawns = computed<MapSpawn[]>(() => {
    if (!map.value?.spawns) return [];
    return map.value.spawns.filter((spawn) => {
      const hasPmcAccess = spawn.sides?.includes('pmc') || spawn.sides?.includes('all');
      const isPlayerSpawn =
        spawn.categories?.includes('player') || spawn.categories?.includes('all');
      return Boolean(spawn.position) && Boolean(hasPmcAccess) && Boolean(isPlayerSpawn);
    });
  });
  const showPmcExtracts = ref(initialShowPmcExtracts ?? showExtracts);
  const showScavExtracts = ref(initialShowScavExtracts ?? showExtracts);
  const showPmcSpawns = ref(initialShowPmcSpawns);
  const hasPmcSpawns = computed(() => mapPmcSpawns.value.length > 0);
  const hasSharedExtracts = computed(() => {
    return mapExtracts.value.some(
      (extract) => extract.faction === 'shared' && !isCoopExtract(extract)
    );
  });
  const hasCoopExtracts = computed(() => {
    return mapExtracts.value.some(
      (extract) => extract.faction === 'shared' && isCoopExtract(extract)
    );
  });
  const mapZoomSpeed = computed({
    get: () => preferencesStore.getMapZoomSpeed,
    set: (value) => {
      const parsed = Number(value);
      const clamped = Math.min(ZOOM_SPEED_MAX, Math.max(ZOOM_SPEED_MIN, parsed));
      preferencesStore.setMapZoomSpeed(clamped);
    },
  });
  const mapPanSpeed = computed({
    get: () => preferencesStore.mapPanSpeed ?? 1,
    set: (value) => {
      const parsed = Number(value);
      const clamped = Math.min(PAN_SPEED_MAX, Math.max(PAN_SPEED_MIN, parsed));
      preferencesStore.setMapPanSpeed(clamped);
    },
  });
  const mapZoneOpacity = computed({
    get: () => preferencesStore.getMapZoneOpacity,
    set: (value) => {
      const parsed = Number(value);
      const clamped = Math.min(ZONE_OPACITY_MAX, Math.max(ZONE_OPACITY_MIN, parsed));
      preferencesStore.setMapZoneOpacity(clamped);
    },
  });
  const mapColorOptions = computed(() => getMapColorOptions(t));
  const onMapColorInput = (key: MapMarkerColorKey, event: Event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    preferencesStore.setMapMarkerColor(key, input.value);
  };
  const zoomSpeedLabel = computed(() => `${mapZoomSpeed.value.toFixed(1)}x`);
  const panSpeedLabel = computed(() => `${mapPanSpeed.value.toFixed(1)}x`);
  const zoneOpacityLabel = computed(() => `${Math.round(mapZoneOpacity.value * 100)}%`);
  return {
    hasCoopExtracts,
    hasPmcSpawns,
    hasSharedExtracts,
    mapColors,
    mapColorOptions,
    mapExtracts,
    mapPanSpeed,
    mapPmcSpawns,
    mapZoneOpacity,
    mapZoomSpeed,
    onMapColorInput,
    panSpeedLabel,
    showPmcExtracts,
    showPmcSpawns,
    showScavExtracts,
    zoomSpeedLabel,
    zoneOpacityLabel,
  };
}
