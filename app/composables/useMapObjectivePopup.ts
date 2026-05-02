import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { logger } from '@/utils/logger';
export type LeafletMapRef = {
  activateObjectivePopup: (id: string) => boolean;
  closeActivePopup: () => void;
};
export type UseMapObjectivePopupOptions = {
  leafletMapRef: Ref<LeafletMapRef | null>;
  mapContainerRef: Ref<HTMLElement | null>;
};
export interface UseMapObjectivePopupReturn {
  jumpToMapObjective: (objectiveId: string) => Promise<void>;
  scrollToMap: () => void;
  cleanup: () => void;
}
const SCROLL_TO_MAP_POPUP_DELAY = 150;
const MAP_POPUP_POST_RERENDER_DELAY = 100;
const NEAR_TOP_SCROLL_THRESHOLD = 100;
const POPUP_ACTIVATE_RETRY_DELAY = 150;
const POPUP_ACTIVATE_MAX_ATTEMPTS = 6;
export function useMapObjectivePopup({
  leafletMapRef,
  mapContainerRef,
}: UseMapObjectivePopupOptions): UseMapObjectivePopupReturn {
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const isMounted = ref(true);
  let mapJumpRequestId = 0;
  let jumpToMapTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const popupActivateTimers = ref<ReturnType<typeof setTimeout>[]>([]);
  const clearPopupActivateTimers = () => {
    popupActivateTimers.value.forEach((timerId) => {
      clearTimeout(timerId);
    });
    popupActivateTimers.value = [];
  };
  const findObjectiveMapId = (objectiveId: string): string | null => {
    const objective = metadataStore.objectives.find((o) => o.id === objectiveId);
    if (!objective) return null;
    const taskId = objective.taskId;
    if (!taskId) return null;
    if (objective.zones?.length) {
      const zoneMapId = objective.zones[0]?.map?.id;
      if (zoneMapId) return zoneMapId;
    }
    if (objective.possibleLocations?.length) {
      const locMapId = objective.possibleLocations[0]?.map?.id;
      if (locMapId) return locMapId;
    }
    const objectiveMapsForTask = metadataStore.objectiveMaps?.[taskId] ?? [];
    const mapInfo = objectiveMapsForTask.find((m) => m.objectiveID === objectiveId);
    if (mapInfo?.mapID) return mapInfo.mapID;
    return null;
  };
  const activateObjectivePopupWithRetry = (objectiveId: string) => {
    clearPopupActivateTimers();
    let attempts = 1;
    const tryActivate = () => {
      const success = leafletMapRef.value?.activateObjectivePopup(objectiveId);
      if (success) return;
      if (attempts >= POPUP_ACTIVATE_MAX_ATTEMPTS) {
        logger.warn(
          `[Tasks] Failed to activate popup for objective ${objectiveId} after ${attempts} attempts`
        );
        clearPopupActivateTimers();
        return;
      }
      attempts += 1;
      const timerId = setTimeout(tryActivate, POPUP_ACTIVATE_RETRY_DELAY);
      popupActivateTimers.value.push(timerId);
    };
    tryActivate();
  };
  const scrollToMap = () => {
    if (mapContainerRef.value) {
      mapContainerRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const jumpToMapObjective = async (objectiveId: string) => {
    const requestId = (mapJumpRequestId += 1);
    if (jumpToMapTimeoutId) {
      clearTimeout(jumpToMapTimeoutId);
      jumpToMapTimeoutId = null;
    }
    const targetMapId = findObjectiveMapId(objectiveId);
    const currentMapId = preferencesStore.getTaskMapView;
    if (targetMapId && targetMapId !== currentMapId) {
      preferencesStore.setTaskMapView(targetMapId);
      await nextTick();
      if (!isMounted.value || requestId !== mapJumpRequestId) return;
      await new Promise((resolve) => {
        setTimeout(resolve, MAP_POPUP_POST_RERENDER_DELAY);
      });
      if (!isMounted.value || requestId !== mapJumpRequestId) return;
    }
    const isNearTop = window.scrollY < NEAR_TOP_SCROLL_THRESHOLD;
    if (!isNearTop) {
      scrollToMap();
    }
    if (isNearTop) {
      activateObjectivePopupWithRetry(objectiveId);
      return;
    }
    jumpToMapTimeoutId = setTimeout(() => {
      jumpToMapTimeoutId = null;
      if (!isMounted.value || requestId !== mapJumpRequestId) return;
      activateObjectivePopupWithRetry(objectiveId);
    }, SCROLL_TO_MAP_POPUP_DELAY);
  };
  const cleanup = () => {
    isMounted.value = false;
    if (jumpToMapTimeoutId) {
      clearTimeout(jumpToMapTimeoutId);
      jumpToMapTimeoutId = null;
    }
    clearPopupActivateTimers();
  };
  onUnmounted(() => {
    cleanup();
  });
  return {
    jumpToMapObjective,
    scrollToMap,
    cleanup,
  };
}
