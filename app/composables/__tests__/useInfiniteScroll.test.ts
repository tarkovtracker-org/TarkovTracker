import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfiniteScroll, type UseInfiniteScrollOptions } from '@/composables/useInfiniteScroll';
import { logger } from '@/utils/logger';
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  disconnect: IntersectionObserver['disconnect'] = vi.fn();
  observe: IntersectionObserver['observe'] = vi.fn();
  takeRecords: IntersectionObserver['takeRecords'] = vi.fn(() => []);
  unobserve: IntersectionObserver['unobserve'] = vi.fn();
}
const createClientRects = (rects: DOMRect[]): DOMRectList =>
  Object.assign(rects, { item: (index: number) => rects[index] ?? null });
const sentinels: HTMLElement[] = [];
const createSentinelElement = () => {
  const sentinel = document.createElement('div');
  sentinels.push(sentinel);
  sentinel.getBoundingClientRect = () => new DOMRect(0, 100, 100, 20);
  sentinel.getClientRects = () => createClientRects([sentinel.getBoundingClientRect()]);
  return sentinel;
};
const flushMicrotasks = async (cycles = 8) => {
  for (let index = 0; index < cycles; index += 1) {
    await nextTick();
    await Promise.resolve();
  }
};
const mountHarness = async (
  onLoadMore: () => void | Promise<void>,
  options: UseInfiniteScrollOptions
) => {
  const sentinel = createSentinelElement();
  document.body.append(sentinel);
  const sentinelRef = ref<HTMLElement | null>(sentinel);
  let result: ReturnType<typeof useInfiniteScroll> | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useInfiniteScroll(sentinelRef, onLoadMore, options);
        return () => null;
      },
    })
  );
  await nextTick();
  if (!result) {
    throw new Error('Failed to initialize useInfiniteScroll harness');
  }
  return { result, wrapper, sentinel };
};
describe('useInfiniteScroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const sentinel of sentinels.splice(0)) sentinel.remove();
  });
  it.each(['detached', 'hidden'] as const)(
    'waits for a %s sentinel to have layout before consuming the auto-load budget',
    async (state) => {
      const onLoadMore = vi.fn();
      const { result, wrapper, sentinel } = await mountHarness(onLoadMore, {
        autoLoadOnReady: false,
        maxAutoLoads: 1,
      });
      const getClientRects = sentinel.getClientRects;
      if (state === 'detached') sentinel.remove();
      else sentinel.getClientRects = () => createClientRects([]);
      await result.checkAndLoadMore();
      await flushMicrotasks();
      expect(onLoadMore).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      document.body.append(sentinel);
      sentinel.getClientRects = getClientRects;
      await result.checkAndLoadMore(true);
      await flushMicrotasks();
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    }
  );
  it('stops queued auto-fill when the sentinel loses its layout box', async () => {
    const onLoadMore = vi.fn(() => {
      sentinel.getClientRects = () => createClientRects([]);
    });
    const { result, wrapper, sentinel } = await mountHarness(onLoadMore, {
      autoLoadOnReady: false,
      maxAutoLoads: 8,
    });
    await result.checkAndLoadMore();
    await flushMicrotasks(12);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('does not load when a rendered sentinel is outside the preload range', async () => {
    const onLoadMore = vi.fn();
    const { result, wrapper, sentinel } = await mountHarness(onLoadMore, {
      autoLoadOnReady: false,
      rootMargin: '700px',
    });
    sentinel.getBoundingClientRect = () => new DOMRect(0, window.innerHeight + 701, 100, 20);
    await result.checkAndLoadMore();
    expect(onLoadMore).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('starts a fresh auto-load cycle on external checks', async () => {
    const onLoadMore = vi.fn();
    const { result, wrapper } = await mountHarness(onLoadMore, {
      autoLoadOnReady: false,
      maxAutoLoads: 1,
      rootMargin: '0px',
    });
    await result.checkAndLoadMore();
    await flushMicrotasks();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    await result.checkAndLoadMore();
    await flushMicrotasks();
    expect(onLoadMore).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it('keeps queued auto-fill checks capped by maxAutoLoads', async () => {
    const onLoadMore = vi.fn();
    const { result, wrapper } = await mountHarness(onLoadMore, {
      autoLoadOnReady: false,
      maxAutoLoads: 2,
      rootMargin: '0px',
    });
    await result.checkAndLoadMore();
    await flushMicrotasks(12);
    const warnMock = vi.mocked(logger.warn);
    expect(onLoadMore).toHaveBeenCalledTimes(2);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledWith(
      '[useInfiniteScroll] Max auto-load cycles reached, pausing'
    );
    wrapper.unmount();
  });
});
