import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import BackToTop from '@/components/ui/BackToTop.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string) => key,
  }),
}));
const stubs = {
  UIcon: true,
  Transition: false,
};
describe('BackToTop', () => {
  let rafCallback: FrameRequestCallback | null = null;
  let rafId = 1;
  beforeEach(() => {
    rafCallback = null;
    rafId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb;
      return rafId++;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
    vi.spyOn(window, 'addEventListener').mockImplementation(vi.fn());
    vi.spyOn(window, 'removeEventListener').mockImplementation(vi.fn());
    vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('schedules rAF on scroll and updates visibility when threshold exceeded', () => {
    mount(BackToTop, { global: { stubs } });
    // onMounted calls onScroll() which schedules the first rAF
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(rafCallback).not.toBeNull();
    // Simulate scrollY above threshold and fire the rAF callback
    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
    rafCallback!(performance.now());
    // After callback fires, a new scroll should schedule another rAF
    const scrollHandler = vi
      .mocked(window.addEventListener)
      .mock.calls.find(([event]) => event === 'scroll')?.[1] as EventListener | undefined;
    expect(scrollHandler).toBeDefined();
    scrollHandler!(new Event('scroll'));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });
  it('does not schedule multiple rAFs before callback fires', () => {
    mount(BackToTop, { global: { stubs } });
    const scrollHandler = vi
      .mocked(window.addEventListener)
      .mock.calls.find(([event]) => event === 'scroll')?.[1] as EventListener | undefined;
    scrollHandler!(new Event('scroll'));
    scrollHandler!(new Event('scroll'));
    // 1 from onMounted onScroll() + 0 extra because rAF is still pending
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
  it('cancels pending rAF on unmount', () => {
    const wrapper = mount(BackToTop, { global: { stubs } });
    const scrollHandler = vi
      .mocked(window.addEventListener)
      .mock.calls.find(([event]) => event === 'scroll')?.[1] as EventListener | undefined;
    scrollHandler!(new Event('scroll'));
    wrapper.unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(window.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
  it('does not cancel rAF on unmount if none pending', () => {
    const wrapper = mount(BackToTop, { global: { stubs } });
    rafCallback!(performance.now());
    vi.mocked(window.cancelAnimationFrame).mockClear();
    wrapper.unmount();
    expect(window.cancelAnimationFrame).not.toHaveBeenCalled();
  });
});
