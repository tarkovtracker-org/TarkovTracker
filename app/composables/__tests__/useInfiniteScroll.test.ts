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
const createSentinelElement = () => {
  const sentinel = document.createElement('div');
  sentinel.getBoundingClientRect = () => new DOMRect(0, 100, 100, 20);
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
  const sentinelRef = ref<HTMLElement | null>(createSentinelElement());
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
  return { result, wrapper };
};
describe('useInfiniteScroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
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
