import { currentExtractRuleData } from '@/features/maps/composables/useExtractRuleData';
import { isDrawableMapPosition } from '@/features/maps/utils/mapLocations';
import { extractRulesForMode } from '@/utils/extractRuleData';
import { getMapColorOptions, type MapMarkerColorKey } from '@/utils/theme-colors';
import type {
  SavedMapLayerKey,
  SavedMapLayerVisibility,
} from '@/features/maps/utils/mapLayerVisibility';
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
    /** Layers rows the user turned on or off on an earlier visit. */
    getMapLayerVisibility?: SavedMapLayerVisibility;
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
  /** App game mode (pvp, pve, seasonal); co-op classification follows its rules. */
  gameMode?: RefLike<string | undefined>;
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
/**
 * A shared exit that needs a PMC and a Scav in `mode`, from the current extract rule data, using
 * the same rule list the requirement details show; the name fallback covers missing data.
 */
export const isCoopExtract = (extract: MapExtract, mode = 'pvp'): boolean => {
  const data = currentExtractRuleData();
  const coop = Object.keys(data.requirements.maps).some((mapId) =>
    extractRulesForMode(data, { mapId, extractId: extract.id }, mode)?.some(
      (rule) => rule.type === 'coop'
    )
  );
  return coop || /\bco-?op\b/i.test(extract.name || '');
};
/** Derive available map locations and expose independent layer toggles and display controls. */
export function useLeafletMapControls({
  map,
  preferencesStore,
  showExtracts = true,
  showPmcExtracts: initialShowPmcExtracts,
  showPmcSpawns: initialShowPmcSpawns = false,
  showScavExtracts: initialShowScavExtracts,
  gameMode,
  t,
}: UseLeafletMapControlsOptions) {
  const isCoop = (extract: MapExtract) => isCoopExtract(extract, gameMode?.value ?? 'pvp');
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
  const saved = preferencesStore.getMapLayerVisibility ?? {};
  const showTransits = ref(saved.transit ?? true);
  const mapPmcSpawns = computed<MapSpawn[]>(() => {
    if (!map.value?.spawns) return [];
    return map.value.spawns.filter((spawn) => {
      const hasPmcAccess = spawn.sides?.includes('pmc') || spawn.sides?.includes('all');
      const isPlayerSpawn =
        spawn.categories?.includes('player') || spawn.categories?.includes('all');
      return Boolean(spawn.position) && Boolean(hasPmcAccess) && Boolean(isPlayerSpawn);
    });
  });
  // The user's saved row wins, then an explicit page value, then the default.
  const showPmcExtracts = ref(saved.pmc ?? initialShowPmcExtracts ?? showExtracts);
  const showScavExtracts = ref(saved.scav ?? initialShowScavExtracts ?? showExtracts);
  // Shared and co-op extracts used to appear whenever either faction was shown; keep that default.
  const sharedDefault =
    (initialShowPmcExtracts ?? showExtracts) || (initialShowScavExtracts ?? showExtracts);
  const showSharedExtracts = ref(saved.shared ?? sharedDefault);
  const showCoopExtracts = ref(saved.coop ?? sharedDefault);
  const showPmcSpawns = ref(saved.spawns ?? initialShowPmcSpawns);
  const savedLayerRefs: Record<SavedMapLayerKey, { value: boolean }> = {
    pmc: showPmcExtracts,
    scav: showScavExtracts,
    shared: showSharedExtracts,
    coop: showCoopExtracts,
    transit: showTransits,
    spawns: showPmcSpawns,
  };
  // Another map on the page (the full-screen one) can save a row; follow it so both agree.
  watch(
    () => preferencesStore.getMapLayerVisibility ?? {},
    (rows) => {
      (Object.entries(rows) as Array<[SavedMapLayerKey, boolean]>).forEach(([key, visible]) => {
        savedLayerRefs[key].value = visible;
      });
    }
  );
  const hasPmcSpawns = computed(() => mapPmcSpawns.value.length > 0);
  // Layers rows mirror drawn markers, so availability only counts extracts with a position.
  const drawableExtracts = computed(() => mapExtracts.value.filter((extract) => extract.position));
  const hasDrawable = (predicate: (extract: MapExtract) => boolean) =>
    computed(() => drawableExtracts.value.some(predicate));
  const hasSharedExtracts = hasDrawable(
    (extract) => extract.faction === 'shared' && !isCoop(extract)
  );
  const hasPmcExtracts = hasDrawable((extract) => extract.faction === 'pmc');
  const hasScavExtracts = hasDrawable((extract) => extract.faction === 'scav');
  /** Extracts without a recognized faction are drawn with the Shared row's visibility. */
  const hasUnknownFactionExtracts = hasDrawable(
    (extract) => !['pmc', 'scav', 'shared'].includes(extract.faction ?? '')
  );
  const hasCoopExtracts = hasDrawable((extract) => extract.faction === 'shared' && isCoop(extract));
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
