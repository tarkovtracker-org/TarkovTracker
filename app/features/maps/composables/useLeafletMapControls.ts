import { isDrawableMapPosition } from '@/features/maps/utils/mapLocations';
import { getMapColorOptions, type MapMarkerColorKey } from '@/utils/theme-colors';
import type { MapExtract, MapPosition, MapSpawn, MapTransit, TarkovMap } from '@/types/tarkov';
type TranslateFn = (key: string, fallback?: string) => string;
type RefLike<T> = { value: T };
type UseLeafletMapControlsOptions = {
  map: RefLike<TarkovMap>;
  preferencesStore: {
    getMapMarkerColors: Record<MapMarkerColorKey, string>;
    getMapTooltipDensity: 'default' | 'compact';
    getMapZoneOpacity: number;
    getMapZoomSpeed: number;
    mapPanSpeed?: number;
    setMapMarkerColor: (key: MapMarkerColorKey, value: string) => void;
    setMapPanSpeed: (value: number) => void;
    setMapTooltipDensity: (density: 'default' | 'compact') => void;
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
export const MAP_BUTTON_ACTIVE_CLASS =
  'border border-primary-400/60 bg-primary-500/15 text-primary-100 light:text-primary-900';
export const MAP_BUTTON_INACTIVE_CLASS =
  'border border-transparent text-surface-300/60 hover:bg-white/5 hover:text-surface-100';
export const isCoopExtract = (extract: MapExtract): boolean =>
  /\bco-?op\b/i.test(extract.name || '');
/** Derive available map locations and expose independent layer toggles and display controls. */
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
  const mapExtracts = computed<MapExtract[]>(() =>
    (map.value?.extracts ?? []).filter((extract) =>
      isDrawableMapPosition(map.value, extract.position)
    )
  );
  const mapTransits = computed(() =>
    (map.value?.transits ?? []).filter(
      (transit): transit is MapTransit & { position: MapPosition } =>
        isDrawableMapPosition(map.value, transit.position)
    )
  );
  const hasTransits = computed(() => mapTransits.value.length > 0);
  const showTransits = ref(true);
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
  // Shared and co-op extracts used to appear whenever either faction was shown; keep that default.
  const showSharedExtracts = ref(showPmcExtracts.value || showScavExtracts.value);
  const showCoopExtracts = ref(showSharedExtracts.value);
  const showPmcSpawns = ref(initialShowPmcSpawns);
  const hasPmcSpawns = computed(() => mapPmcSpawns.value.length > 0);
  // Layers rows mirror drawn markers, so availability only counts extracts with a position.
  const drawableExtracts = computed(() => mapExtracts.value.filter((extract) => extract.position));
  const hasDrawable = (predicate: (extract: MapExtract) => boolean) =>
    computed(() => drawableExtracts.value.some(predicate));
  const hasSharedExtracts = hasDrawable(
    (extract) => extract.faction === 'shared' && !isCoopExtract(extract)
  );
  const hasPmcExtracts = hasDrawable((extract) => extract.faction === 'pmc');
  const hasScavExtracts = hasDrawable((extract) => extract.faction === 'scav');
  /** Extracts without a recognized faction are drawn with the Shared row's visibility. */
  const hasUnknownFactionExtracts = hasDrawable(
    (extract) => !['pmc', 'scav', 'shared'].includes(extract.faction ?? '')
  );
  const hasCoopExtracts = hasDrawable(
    (extract) => extract.faction === 'shared' && isCoopExtract(extract)
  );
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
  const mapTooltipDensity = computed({
    get: () => preferencesStore.getMapTooltipDensity,
    set: (value: 'default' | 'compact') => {
      preferencesStore.setMapTooltipDensity(value);
    },
  });
  return {
    hasTransits,
    mapTransits,
    showTransits,
    hasCoopExtracts,
    hasPmcExtracts,
    hasPmcSpawns,
    hasScavExtracts,
    hasSharedExtracts,
    hasUnknownFactionExtracts,
    mapColors,
    mapColorOptions,
    mapExtracts,
    mapPanSpeed,
    mapPmcSpawns,
    mapTooltipDensity,
    mapZoneOpacity,
    mapZoomSpeed,
    onMapColorInput,
    panSpeedLabel,
    showPmcExtracts,
    showPmcSpawns,
    showScavExtracts,
    showSharedExtracts,
    showCoopExtracts,
    zoomSpeedLabel,
    zoneOpacityLabel,
  };
}
