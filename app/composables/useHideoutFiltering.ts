import { storeToRefs } from 'pinia';
import { useHideoutStationStatus } from '@/composables/useHideoutStationStatus';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import type { HideoutStation } from '@/types/tarkov';
export type HideoutPrimaryView = 'available' | 'maxed' | 'locked' | 'all';
const STATION_STATUS_VIEWS: readonly HideoutPrimaryView[] = ['available', 'maxed', 'locked'];
export type HideoutStationCounts = {
  available: number;
  maxed: number;
  locked: number;
  all: number;
};
export type UseHideoutFilteringReturn = {
  activePrimaryView: WritableComputedRef<HideoutPrimaryView>;
  isStoreLoading: ComputedRef<boolean>;
  visibleStations: ComputedRef<HideoutStation[]>;
  stationCounts: ComputedRef<HideoutStationCounts>;
  stationsForView: (stations: HideoutStation[], view: HideoutPrimaryView) => HideoutStation[];
};
export function useHideoutFiltering(): UseHideoutFilteringReturn {
  const metadataStore = useMetadataStore();
  const { hideoutStations, hideoutLoading } = storeToRefs(metadataStore);
  const progressStore = useProgressStore();
  const { arePrereqsMet, getStationStatus } = useHideoutStationStatus();
  const preferencesStore = usePreferencesStore();
  const activePrimaryView = computed<HideoutPrimaryView>({
    get: () => preferencesStore.getHideoutPrimaryView as HideoutPrimaryView,
    set: (value: HideoutPrimaryView) => preferencesStore.setHideoutPrimaryView(value),
  });
  const isStationReadyToBuild = (station: HideoutStation): boolean => {
    const currentLevel = progressStore.hideoutLevels?.[station.id]?.self ?? 0;
    const sortedLevels = [...station.levels].sort((a, b) => a.level - b.level);
    const nextLevel = sortedLevels.find((level) => level.level === currentLevel + 1);
    if (!nextLevel) return false;
    return arePrereqsMet(nextLevel);
  };
  // Stations whose next level has its station, skill and trader prerequisites met come first; the
  // rest keep their upstream order. Item requirements do not affect the order.
  const sortStationsByReadiness = (stations: HideoutStation[]): HideoutStation[] =>
    stations
      .map((station, index) => ({
        station,
        index,
        ready: isStationReadyToBuild(station),
      }))
      .sort((a, b) => {
        if (a.ready === b.ready) return a.index - b.index;
        return a.ready ? -1 : 1;
      })
      .map((entry) => entry.station);
  const stationCounts = computed(() => {
    if (!hideoutStations.value || hideoutStations.value.length === 0) {
      return { available: 0, maxed: 0, locked: 0, all: 0 };
    }
    const stationList = hideoutStations.value as HideoutStation[];
    const counts = { available: 0, maxed: 0, locked: 0, all: stationList.length };
    for (const station of stationList) {
      const status = getStationStatus(station);
      if (status === 'maxed') counts.maxed++;
      else if (status === 'available') counts.available++;
      else if (status === 'locked') counts.locked++;
    }
    return counts;
  });
  const isStoreLoading = computed(() => {
    if (!metadataStore.hasInitialized) return true;
    if (hideoutLoading.value) return true;
    if (!hideoutStations.value || hideoutStations.value.length === 0) return true;
    if (Object.keys(progressStore.visibleTeamStores).length === 0) return true;
    return false;
  });
  const stationsForView = (
    stations: HideoutStation[],
    view: HideoutPrimaryView
  ): HideoutStation[] =>
    // A stored view that is not a station status (stale or synced from elsewhere) shows every station.
    sortStationsByReadiness(
      STATION_STATUS_VIEWS.includes(view)
        ? stations.filter((s) => getStationStatus(s) === view)
        : stations
    );
  const visibleStations = computed(() => {
    if (isStoreLoading.value) return [];
    return stationsForView(hideoutStations.value as HideoutStation[], activePrimaryView.value);
  });
  return {
    activePrimaryView,
    isStoreLoading,
    visibleStations,
    stationCounts,
    stationsForView,
  };
}
