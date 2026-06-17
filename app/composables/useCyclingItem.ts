import { useIntervalFn, usePreferredReducedMotion } from '@vueuse/core';
import type { ComputedRef, MaybeRefOrGetter, Ref } from '#imports';
import type { TarkovItem } from '@/types/tarkov';
const DEFAULT_CYCLE_INTERVAL_MS = 5000;
export interface UseCyclingItemOptions {
  /** Time in milliseconds each item is shown before advancing. */
  intervalMs?: number;
  /** When false (or 0/1 items) cycling pauses and the primary item is shown. */
  enabled?: MaybeRefOrGetter<boolean>;
}
export interface UseCyclingItemReturn {
  /** The item currently being displayed (primary item when not cycling). */
  currentItem: ComputedRef<TarkovItem | null>;
  /** Zero-based index of the current item within the provided list. */
  currentIndex: Ref<number>;
  /** Total number of items available to cycle through. */
  total: ComputedRef<number>;
  /** Whether more than one item is available (alternatives exist), regardless of motion. */
  hasAlternatives: ComputedRef<boolean>;
  /** Whether the display is actively rotating (alternatives + enabled + motion allowed). */
  isCycling: ComputedRef<boolean>;
}
/**
 * Cycles through a list of accepted items for an "any of these" objective so
 * the UI can casually rotate the displayed item (with a tooltip) instead of
 * implying only the first item is valid.
 *
 * Display-only: this never mutates progress or counts. When there is one item
 * or fewer, or cycling is disabled, it simply returns the primary (first) item.
 */
export function useCyclingItem(
  items: MaybeRefOrGetter<TarkovItem[] | undefined>,
  primaryItem: MaybeRefOrGetter<TarkovItem | null>,
  options: UseCyclingItemOptions = {}
): UseCyclingItemReturn {
  const { intervalMs = DEFAULT_CYCLE_INTERVAL_MS, enabled = true } = options;
  const itemList = computed(() => {
    const resolved = toValue(items);
    return Array.isArray(resolved) ? resolved.filter((entry): entry is TarkovItem => !!entry) : [];
  });
  const total = computed(() => itemList.value.length);
  const hasAlternatives = computed(() => total.value > 1);
  const reducedMotion = usePreferredReducedMotion();
  const isCycling = computed(
    () => Boolean(toValue(enabled)) && reducedMotion.value !== 'reduce' && hasAlternatives.value
  );
  const currentIndex = ref(0);
  // Keep the index within bounds if the list changes (e.g. filters/locale).
  watch(total, (count) => {
    if (count <= 0) {
      currentIndex.value = 0;
    } else if (currentIndex.value >= count) {
      currentIndex.value = currentIndex.value % count;
    }
  });
  const advance = () => {
    if (total.value <= 1) return;
    currentIndex.value = (currentIndex.value + 1) % total.value;
  };
  const { pause, resume } = useIntervalFn(advance, intervalMs, { immediate: false });
  watch(
    isCycling,
    (active) => {
      if (active) {
        resume();
      } else {
        pause();
        currentIndex.value = 0;
      }
    },
    { immediate: true }
  );
  const currentItem = computed(() => {
    const fallback = toValue(primaryItem) ?? null;
    if (!isCycling.value) return fallback;
    return itemList.value[currentIndex.value] ?? fallback;
  });
  return {
    currentItem,
    currentIndex,
    total,
    hasAlternatives,
    isCycling,
  };
}
