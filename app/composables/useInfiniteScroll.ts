import { logger } from '@/utils/logger';
import { perfNow, roundPerfMs } from '@/utils/perf';
export interface UseInfiniteScrollOptions {
  rootMargin?: string;
  threshold?: number;
  enabled?: boolean | Ref<boolean> | ComputedRef<boolean>;
  autoFill?: boolean;
  autoLoadOnReady?: boolean;
  maxAutoLoads?: number;
  maxAutoLoadsPerScrollTrigger?: number;
  useScrollFallback?: boolean;
  scrollThrottleMs?: number;
  debug?: boolean | Ref<boolean> | ComputedRef<boolean>;
  debugLabel?: string;
}
export function useInfiniteScroll(
  sentinelRef: Ref<HTMLElement | null> | ComputedRef<HTMLElement | null>,
  onLoadMore: () => void | Promise<void>,
  options: UseInfiniteScrollOptions = {}
) {
  const {
    rootMargin = '1500px',
    threshold = 0,
    autoFill = true,
    autoLoadOnReady = true,
    maxAutoLoads = 100,
    maxAutoLoadsPerScrollTrigger = 1,
    scrollThrottleMs = 120,
    useScrollFallback = false,
  } = options;
  const enabled = computed(() => toValue(options.enabled) ?? true);
  const debug = computed(() => toValue(options.debug) ?? false);
  const debugLabel = options.debugLabel ?? 'default';
  const isLoading = ref(false);
  const canUseObserver =
    typeof window !== 'undefined' && typeof globalThis.IntersectionObserver !== 'undefined';
  const state = {
    observer: null as IntersectionObserver | null,
    isStopped: true,
    autoLoadCount: 0,
    scrollTimeout: null as ReturnType<typeof setTimeout> | null,
  };
  let warnedObserverUnavailable = false;
  const logDebug = (event: string, payload: Record<string, unknown> = {}) => {
    if (!debug.value) return;
    logger.info(`[useInfiniteScroll:${debugLabel}] ${event}`, payload);
  };
  const checkAndLoadMore = async (scrollTriggered = false) => {
    if (state.isStopped) {
      logDebug('skip', { reason: 'stopped', scrollTriggered });
      return;
    }
    if (!enabled.value) {
      logDebug('skip', { reason: 'disabled', scrollTriggered });
      return;
    }
    if (isLoading.value) {
      logDebug('skip', { reason: 'already-loading', scrollTriggered });
      return;
    }
    if (!sentinelRef.value) {
      logDebug('skip', { reason: 'missing-sentinel', scrollTriggered });
      return;
    }
    if (typeof window === 'undefined') {
      logDebug('skip', { reason: 'missing-window', scrollTriggered });
      return;
    }
    const startedAt = debug.value ? perfNow() : 0;
    const rect = sentinelRef.value.getBoundingClientRect();
    const marginPx = parseInt(rootMargin) || 1500;
    if (rect.top >= window.innerHeight + marginPx) {
      state.autoLoadCount = 0;
      logDebug('defer', {
        autoLoadCount: state.autoLoadCount,
        marginPx,
        rectTop: Math.round(rect.top),
        scrollTriggered,
        viewportHeight: window.innerHeight,
      });
      return;
    }
    if (autoFill && state.autoLoadCount >= maxAutoLoads) {
      logger.warn('[useInfiniteScroll] Max auto-load cycles reached, pausing');
      logDebug('max-auto-loads', {
        autoLoadCount: state.autoLoadCount,
        maxAutoLoads,
        rectTop: Math.round(rect.top),
        scrollTriggered,
      });
      return;
    }
    if (autoFill) state.autoLoadCount += 1;
    isLoading.value = true;
    const loadStartedAt = debug.value ? perfNow() : 0;
    try {
      await Promise.resolve(onLoadMore());
      if (debug.value) {
        logDebug('load-complete', {
          autoLoadCount: state.autoLoadCount,
          loadMs: roundPerfMs(perfNow() - loadStartedAt),
          rectTop: Math.round(rect.top),
          scrollTriggered,
          totalMs: roundPerfMs(perfNow() - startedAt),
        });
      }
    } catch (error) {
      logger.error('[useInfiniteScroll] Failed to load more items:', error);
    } finally {
      isLoading.value = false;
      const shouldQueueNext =
        autoFill &&
        !state.isStopped &&
        enabled.value &&
        sentinelRef.value &&
        (!scrollTriggered || state.autoLoadCount < maxAutoLoadsPerScrollTrigger);
      if (autoFill && scrollTriggered && state.autoLoadCount >= maxAutoLoadsPerScrollTrigger) {
        logDebug('queue-stop', {
          autoLoadCount: state.autoLoadCount,
          maxAutoLoadsPerScrollTrigger,
          reason: 'scroll-trigger-cap',
        });
      }
      if (shouldQueueNext) {
        logDebug('queue-next', { autoLoadCount: state.autoLoadCount, scrollTriggered });
        await nextTick();
        if (!state.isStopped && enabled.value && sentinelRef.value) {
          void checkAndLoadMore(scrollTriggered);
        }
      }
    }
  };
  const handleIntersection = (entries: IntersectionObserverEntry[]) => {
    if (state.isStopped) return;
    const target = entries[0];
    if (target?.isIntersecting && enabled.value) {
      logDebug('intersection', {
        autoLoadCount: state.autoLoadCount,
        intersectionRatio: target.intersectionRatio,
        rectTop: Math.round(target.boundingClientRect.top),
      });
      state.autoLoadCount = 0;
      void checkAndLoadMore(true);
    }
  };
  const createObserver = (): boolean => {
    if (!canUseObserver) {
      if (!warnedObserverUnavailable) {
        warnedObserverUnavailable = true;
        logger.warn(
          '[useInfiniteScroll] IntersectionObserver unavailable; scroll fallback is required'
        );
      }
      return false;
    }
    state.observer?.disconnect();
    state.observer = new IntersectionObserver(handleIntersection, { rootMargin, threshold });
    if (sentinelRef.value) {
      state.observer.observe(sentinelRef.value);
      logDebug('observe', { rootMargin, threshold });
    }
    return true;
  };
  const handleScroll = () => {
    if (state.isStopped || !enabled.value) return;
    if (state.scrollTimeout) return;
    state.scrollTimeout = setTimeout(() => {
      state.scrollTimeout = null;
      if (state.isStopped || !enabled.value) return;
      void checkAndLoadMore(true);
    }, scrollThrottleMs);
  };
  const start = () => {
    if (!state.isStopped) {
      logDebug('start-skip', { reason: 'already-started' });
      return;
    }
    state.isStopped = false;
    state.autoLoadCount = 0;
    logDebug('start', { autoFill, autoLoadOnReady, maxAutoLoads, rootMargin, threshold });
    const observerReady = createObserver();
    if (typeof window !== 'undefined' && useScrollFallback) {
      window.addEventListener('scroll', handleScroll, { passive: true });
      logDebug('scroll-fallback-start', { scrollThrottleMs });
    }
    if (!observerReady && !useScrollFallback) {
      logDebug('start-without-observer', { useScrollFallback });
    }
    if (autoLoadOnReady) {
      nextTick(() => {
        if (!state.isStopped) void checkAndLoadMore();
      });
    }
  };
  const stop = () => {
    if (state.isStopped) {
      logDebug('stop-skip', { reason: 'already-stopped' });
      return;
    }
    state.isStopped = true;
    state.observer?.disconnect();
    state.observer = null;
    state.autoLoadCount = 0;
    if (typeof window !== 'undefined' && useScrollFallback) {
      window.removeEventListener('scroll', handleScroll);
      logDebug('scroll-fallback-stop');
    }
    if (state.scrollTimeout) {
      clearTimeout(state.scrollTimeout);
      state.scrollTimeout = null;
    }
    logDebug('stop');
  };
  watch(
    sentinelRef,
    (el, oldEl) => {
      if (state.isStopped || el === oldEl || !state.observer) return;
      logDebug('sentinel-change', {
        hasNew: Boolean(el),
        hadOld: Boolean(oldEl),
      });
      state.observer.disconnect();
      if (el) {
        state.observer.observe(el);
        if (autoLoadOnReady) {
          nextTick(() => {
            if (!state.isStopped) void checkAndLoadMore();
          });
        }
      }
    },
    { flush: 'post' }
  );
  watch(enabled, (newEnabled) => {
    logDebug('enabled-change', { enabled: newEnabled });
    if (newEnabled) start();
    else stop();
  });
  onMounted(() => {
    if (enabled.value) start();
  });
  onUnmounted(() => {
    stop();
  });
  return { isLoading, stop, start, checkAndLoadMore };
}
