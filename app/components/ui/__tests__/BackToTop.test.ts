import { mount, type VueWrapper } from '@vue/test-utils';
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
  Transition: true,
};
describe('BackToTop', () => {
  let rafCallback: FrameRequestCallback | null = null;
  let rafId = 1;
  let wrapper: VueWrapper | null = null;
  const mountComponent = () => {
    wrapper = mount(BackToTop, { global: { stubs } });
    return wrapper;
  };
  beforeEach(() => {
    rafCallback = null;
    rafId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb;
      return rafId++;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
    vi.spyOn(window, 'removeEventListener');
    vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
  });
  it('schedules rAF on scroll and updates visibility when threshold exceeded', async () => {
    const mounted = mountComponent();
    expect(mounted.get('button').attributes('style')).toContain('display: none');
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(rafCallback).not.toBeNull();
    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
    rafCallback!(performance.now());
    await mounted.vm.$nextTick();
    expect(mounted.get('button').attributes('style')).toBeUndefined();
    window.dispatchEvent(new Event('scroll'));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });
  it('does not schedule multiple rAFs before callback fires', () => {
    mountComponent();
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
  it('cancels pending rAF on unmount', () => {
    const mounted = mountComponent();
    mounted.unmount();
    wrapper = null;
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(window.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
  it('does not cancel rAF on unmount if none pending', () => {
    const mounted = mountComponent();
    rafCallback!(performance.now());
    vi.mocked(window.cancelAnimationFrame).mockClear();
    mounted.unmount();
    wrapper = null;
    expect(window.cancelAnimationFrame).not.toHaveBeenCalled();
  });
});
