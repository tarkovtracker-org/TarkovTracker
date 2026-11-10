import { useStorage, useWindowSize } from '@vueuse/core';
import type { Ref } from 'vue';
export type UseMapResizeOptions = {
  storageKey?: string;
  /** Fixed height used until resized; omit to size from the window via `autoHeightRatio`. */
  defaultHeight?: number;
  autoHeightRatio?: number;
  minHeight?: number;
  maxHeightRatio?: number;
  step?: number;
};
export interface UseMapResizeReturn {
  mapHeight: Ref<number>;
  mapHeightMax: Readonly<Ref<number>>;
  mapHeightMin: number;
  isAutoHeight: Readonly<Ref<boolean>>;
  resetHeight: () => void;
  resizeHandleRef: Ref<HTMLElement | null>;
  isResizing: Readonly<Ref<boolean>>;
  startResize: (event: PointerEvent) => void;
  stopResize: () => void;
  onResizeKeydown: (event: KeyboardEvent) => void;
}
const MAP_HEIGHT_MIN = 320;
const MAP_HEIGHT_MAX_FALLBACK = 1200;
const MAP_HEIGHT_STEP = 24;
/** Share of the window an untouched map fills, leaving room for its header and legend. */
const MAP_HEIGHT_AUTO_RATIO = 0.75;
/** Used before the window is measured (SSR) and as the old fixed tasks map default. */
const MAP_HEIGHT_FALLBACK = 520;
const heightSerializer = {
  read: (raw: string): number | null => {
    const value = Number(raw);
    return raw === '' || !Number.isFinite(value) ? null : value;
  },
  write: (value: number | null): string => (value === null ? '' : String(value)),
};
const readLegacyChoice = (raw: string | null, untouchedHeight: number): number | null => {
  const value = heightSerializer.read(raw ?? '');
  return value === untouchedHeight ? null : value;
};
/**
 * One-time move from the old key, which wrote its fixed default on first visit. A stored value
 * equal to that default means "never resized"; anything else was the user's choice and is kept.
 * Chosen heights live under a separate key, so a later choice of exactly that value is exact.
 */
function migrateLegacyHeight(legacyKey: string, choiceKey: string, untouchedHeight: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return;
    const choice = readLegacyChoice(legacy, untouchedHeight);
    // Persist the replacement before deleting the old value, so a storage error cannot lose it.
    if (choice !== null && localStorage.getItem(choiceKey) === null) {
      localStorage.setItem(choiceKey, String(choice));
    }
    localStorage.removeItem(legacyKey);
  } catch {
    // Storage can be unavailable (privacy modes); the automatic height still works.
  }
}
/**
 * Resizable panel height. Until the user resizes it, the height follows the window (or the fixed
 * `defaultHeight` when given); a chosen height persists, and `resetHeight` restores the default.
 */
export function useMapResize(options: UseMapResizeOptions = {}): UseMapResizeReturn {
  const {
    storageKey = 'tasks_map_height',
    defaultHeight,
    autoHeightRatio = MAP_HEIGHT_AUTO_RATIO,
    minHeight = MAP_HEIGHT_MIN,
    maxHeightRatio = 0.85,
    step = MAP_HEIGHT_STEP,
  } = options;
  const { height: windowHeight } = useWindowSize();
  const choiceKey = `${storageKey}_choice`;
  migrateLegacyHeight(storageKey, choiceKey, defaultHeight ?? MAP_HEIGHT_FALLBACK);
  const mapHeightStorage = useStorage<number | null>(choiceKey, null, undefined, {
    serializer: heightSerializer,
  });
  const measuredWindowHeight = computed(() =>
    Number.isFinite(windowHeight.value) && windowHeight.value > 0 ? windowHeight.value : null
  );
  const mapHeightMax = computed(() => {
    if (measuredWindowHeight.value === null) return MAP_HEIGHT_MAX_FALLBACK;
    return Math.max(minHeight, Math.round(measuredWindowHeight.value * maxHeightRatio));
  });
  const clampHeight = (value: number) => Math.min(Math.max(value, minHeight), mapHeightMax.value);
  const autoHeight = computed(() => {
    if (defaultHeight !== undefined) return clampHeight(defaultHeight);
    const viewport = measuredWindowHeight.value;
    return clampHeight(
      viewport === null ? MAP_HEIGHT_FALLBACK : Math.round(viewport * autoHeightRatio)
    );
  });
  const mapHeight = computed({
    get: () => {
      const stored = mapHeightStorage.value;
      return typeof stored === 'number' ? clampHeight(stored) : autoHeight.value;
    },
    set: (value: number) => {
      mapHeightStorage.value = clampHeight(value);
    },
  });
  const isAutoHeight = computed(() => typeof mapHeightStorage.value !== 'number');
  const resetHeight = () => {
    mapHeightStorage.value = null;
  };
  watch(mapHeightMax, (nextMax) => {
    const stored = mapHeightStorage.value;
    if (typeof stored === 'number' && stored > nextMax) {
      mapHeightStorage.value = nextMax;
    }
  });
  const resizeHandleRef = ref<HTMLElement | null>(null);
  const resizeState = ref<{
    startY: number;
    startHeight: number;
    pointerId: number;
  } | null>(null);
  const savedUserSelect = ref('');
  const isResizing = computed(() => resizeState.value !== null);
  const onResizeMove = (event: PointerEvent) => {
    const state = resizeState.value;
    if (!state) return;
    if (state.pointerId !== event.pointerId) return;
    const delta = event.clientY - state.startY;
    mapHeight.value = Math.round(state.startHeight + delta);
  };
  const stopResize = (event?: PointerEvent) => {
    const state = resizeState.value;
    if (!state) return;
    if (event && state.pointerId !== event.pointerId) return;
    const pointerId = state.pointerId;
    const handle = resizeHandleRef.value;
    resizeState.value = null;
    if (handle?.hasPointerCapture?.(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }
    document.body.style.userSelect = savedUserSelect.value;
    savedUserSelect.value = '';
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
    handle?.removeEventListener('lostpointercapture', stopResize);
  };
  const startResize = (event: PointerEvent) => {
    if (event.button !== 0 || resizeState.value) return;
    const handle = resizeHandleRef.value;
    if (!handle) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    resizeState.value = {
      startY: event.clientY,
      startHeight: mapHeight.value,
      pointerId: event.pointerId,
    };
    savedUserSelect.value = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    handle?.addEventListener?.('lostpointercapture', stopResize);
  };
  // Arrows step, Home/End jump to the limits, and Enter returns to the automatic height.
  const keyActions: Record<string, () => void> = {
    ArrowUp: () => (mapHeight.value = mapHeight.value - step),
    ArrowDown: () => (mapHeight.value = mapHeight.value + step),
    Home: () => (mapHeight.value = minHeight),
    End: () => (mapHeight.value = mapHeightMax.value),
    Enter: resetHeight,
  };
  const onResizeKeydown = (event: KeyboardEvent) => {
    const action = Object.hasOwn(keyActions, event.key) ? keyActions[event.key] : undefined;
    if (!action) return;
    action();
    event.preventDefault();
  };
  onScopeDispose(() => {
    stopResize();
  });
  return {
    mapHeight,
    mapHeightMax,
    mapHeightMin: minHeight,
    isAutoHeight,
    resetHeight,
    resizeHandleRef,
    isResizing,
    startResize,
    stopResize,
    onResizeKeydown,
  };
}
