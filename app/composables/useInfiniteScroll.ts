import {
  type ComputedRef,
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  type Ref,
  ref,
  toValue,
  watch,
} from 'vue';
import { logger } from '@/utils/logger';
export interface UseInfiniteScrollOptions {
  rootMargin?: string;
  threshold?: number;
  enabled?: boolean | Ref<boolean> | ComputedRef<boolean>;
  /** Re-run checks after each load to fill the viewport automatically. */
  autoFill?: boolean;
  /** Attach a window scroll listener as a fallback when needed (opt-in). */
  useScrollFallback?: boolean;
  scrollThrottleMs?: number;
  /** Keep auto-loading while the user is at the bottom, even without new scroll events. */
  stickToBottom?: boolean;
  /** Distance from the bottom (px) to consider "at bottom" when stickToBottom is enabled. */
  stickToBottomThreshold?: number;
  /**
   * If false, skip the initial auto-load checks.
   * When true (default), triggers load checks both on mount and when the sentinel element changes.
   * This ensures the viewport is populated initially and re-checked when the sentinel is replaced.
   */
  autoLoadOnReady?: boolean;
  /**
   * Maximum number of auto-load cycles while the sentinel remains in range.
   * Prevents runaway loops if the list doesn't grow.
   */
  maxAutoLoads?: number;
}
// Scroll fallback attaches a global window scroll listener; only enable if needed.
export function useInfiniteScroll(
  sentinelRef: Ref<HTMLElement | null> | ComputedRef<HTMLElement | null>,
  onLoadMore: () => void | Promise<void>,
  options: UseInfiniteScrollOptions = {}
) {
  const {
    rootMargin = '1500px',
    threshold = 0,
    autoFill = true,
    // When true, attaches a window scroll listener; opt-in for cases without IntersectionObserver.
    useScrollFallback = false,
    scrollThrottleMs = 150,
    stickToBottom = useScrollFallback,
    stickToBottomThreshold = 200,
    autoLoadOnReady = true,
    maxAutoLoads = 100,
  } = options;
  const enabled = computed(() => toValue(options.enabled) ?? true);
  const shouldAttachScrollListener = useScrollFallback || stickToBottom;
  let observer: IntersectionObserver | null = null;
  const isLoading = ref(false);
  const canUseObserver = typeof IntersectionObserver !== 'undefined';
  let warnedObserverUnavailable = false;
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  const marginPx = parseInt(rootMargin) || 1500;
  let autoLoadCount = 0;
  let stickToBottomArmed = false;
  let isStuckToBottom = false;
  let ignoreInitialIntersection = !autoLoadOnReady;
  let pendingRafId: number | null = null;
  let pendingNextTick = false;
  // Flag to prevent callbacks from executing after stop() is called
  let isStopped = true;
  // Cooldown to prevent rapid consecutive checks during fast scrolling
  let lastCheckTime = 0;
  const checkCooldownMs = 100;
  // Track if user is actively scrolling to disable aggressive autoFill
  let isActivelyScrolling = false;
  let scrollIdleTimeout: ReturnType<typeof setTimeout> | null = null;
  const updateStickiness = () => {
    if (!stickToBottom || !stickToBottomArmed || typeof window === 'undefined') return;
    const doc = document.documentElement;
    const distanceFromBottom = doc.scrollHeight - (window.scrollY + window.innerHeight);
    isStuckToBottom = distanceFromBottom <= stickToBottomThreshold;
  };
  const handleIntersection = (entries: IntersectionObserverEntry[]) => {
    if (isStopped) return;
    const target = entries[0];
    if (target?.isIntersecting && enabled.value) {
      if (ignoreInitialIntersection) {
        ignoreInitialIntersection = false;
        return;
      }
      autoLoadCount = 0;
      void checkAndLoadMore();
    }
  };
  const checkAndLoadMore = async () => {
    if (isStopped || !enabled.value || isLoading.value || !sentinelRef.value) return;
    if (typeof window === 'undefined') return;
    // Enforce cooldown between checks to prevent overwhelming the main thread
    // This prevents expensive getBoundingClientRect calls from piling up
    const now = performance.now();
    if (now - lastCheckTime < checkCooldownMs) {
      return;
    }
    lastCheckTime = now;
    // Yield to the event loop immediately so callers (setTimeout/rAF handlers) return quickly
    // This prevents browser "long task" violations by deferring expensive work
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Re-check guards after yielding - state may have changed
    if (isStopped || !enabled.value || isLoading.value || !sentinelRef.value) return;
    const rect = sentinelRef.value.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const shouldLoad = rect.top < viewportHeight + marginPx || (stickToBottom && isStuckToBottom);
    if (shouldLoad) {
      if (autoFill && autoLoadCount >= maxAutoLoads) {
        logger.warn('[useInfiniteScroll] Max auto-load cycles reached, pausing');
        return;
      }
      if (autoFill) {
        autoLoadCount += 1;
      }
      isLoading.value = true;
      try {
        await Promise.resolve(onLoadMore());
      } catch (error) {
        logger.error('[useInfiniteScroll] Failed to load more items:', error);
      } finally {
        isLoading.value = false;
        // Only use autoFill when NOT actively scrolling - scroll handler will trigger loads
        // This prevents the recursive nextTick/rAF chain from competing with scroll events
        if (
          autoFill &&
          !isActivelyScrolling &&
          !isStopped &&
          !pendingNextTick &&
          pendingRafId === null
        ) {
          pendingNextTick = true;
          nextTick(() => {
            pendingNextTick = false;
            if (
              isStopped ||
              isActivelyScrolling ||
              pendingRafId !== null ||
              !enabled.value ||
              !sentinelRef.value
            ) {
              return;
            }
            pendingRafId = requestAnimationFrame(() => {
              pendingRafId = null;
              if (isStopped || isActivelyScrolling || !enabled.value || !sentinelRef.value) return;
              void checkAndLoadMore();
            });
          });
        }
      }
    } else {
      autoLoadCount = 0;
    }
  };
  const scheduleScrollCheck = () => {
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      if (isStopped) return;
      void checkAndLoadMore();
    }, scrollThrottleMs);
  };
  const handleScroll = () => {
    if (isStopped || !enabled.value) return;
    stickToBottomArmed ||= stickToBottom;
    updateStickiness();
    autoLoadCount = 0;
    // Mark as actively scrolling and reset idle timer
    isActivelyScrolling = true;
    if (scrollIdleTimeout) {
      clearTimeout(scrollIdleTimeout);
    }
    // After scrolling stops for 200ms, allow autoFill to resume
    scrollIdleTimeout = setTimeout(() => {
      scrollIdleTimeout = null;
      isActivelyScrolling = false;
      // Trigger one final check after scrolling stops
      if (!isStopped && enabled.value) {
        void checkAndLoadMore();
      }
    }, 200);
    // If a timeout is already scheduled, skip - it will handle the check
    if (scrollTimeout) {
      return;
    }
    scheduleScrollCheck();
  };
  const createObserver = () => {
    if (!canUseObserver) {
      if (!warnedObserverUnavailable) {
        warnedObserverUnavailable = true;
        logger.warn(
          '[useInfiniteScroll] IntersectionObserver unavailable; ' +
            'enable useScrollFallback to scroll.'
        );
      }
      return;
    }
    if (observer) {
      observer.disconnect();
    }
    observer = new IntersectionObserver(handleIntersection, {
      rootMargin,
      threshold,
    });
    if (sentinelRef.value) {
      observer.observe(sentinelRef.value);
    }
  };
  const start = () => {
    // Enable processing - must be set before any async operations
    isStopped = false;
    isActivelyScrolling = false;
    lastCheckTime = 0;
    // When autoLoadOnReady is true, we run a manual checkAndLoadMore() below.
    // Set ignoreInitialIntersection=true to skip duplicate observer triggers,
    // then clear it after the manual check so subsequent intersections work.
    ignoreInitialIntersection = autoLoadOnReady;
    createObserver();
    if (shouldAttachScrollListener) {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }
    nextTick(() => {
      if (isStopped) return;
      updateStickiness();
      if (autoLoadOnReady) {
        void checkAndLoadMore();
        // Clear the flag after manual check so observer can respond to subsequent intersections
        ignoreInitialIntersection = false;
      }
    });
  };
  const stop = () => {
    // Set stopped flag first to prevent any pending callbacks from executing
    isStopped = true;
    observer?.disconnect();
    observer = null;
    if (shouldAttachScrollListener) {
      window.removeEventListener('scroll', handleScroll);
    }
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
    if (scrollIdleTimeout) {
      clearTimeout(scrollIdleTimeout);
      scrollIdleTimeout = null;
    }
    if (pendingRafId !== null) {
      cancelAnimationFrame(pendingRafId);
      pendingRafId = null;
    }
    pendingNextTick = false;
    autoLoadCount = 0;
    stickToBottomArmed = false;
    isStuckToBottom = false;
    isActivelyScrolling = false;
    lastCheckTime = 0;
  };
  watch(
    sentinelRef,
    (el, oldEl) => {
      if (isStopped || el === oldEl || !observer) return;
      observer.disconnect();
      if (el) {
        observer.observe(el);
        if (autoLoadOnReady) {
          nextTick(() => {
            if (isStopped) return;
            void checkAndLoadMore();
          });
        }
      }
    },
    { flush: 'post' }
  );
  watch(enabled, (newEnabled) => {
    if (newEnabled) {
      start();
    } else {
      stop();
    }
  });
  onMounted(() => {
    if (enabled.value) {
      start();
    }
  });
  onUnmounted(() => {
    stop();
  });
  return {
    isLoading,
    stop,
    start,
    checkAndLoadMore,
  };
}
