import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import BackToTop from '@/components/ui/BackToTop.vue';
const routeState = reactive({ meta: { usesWindowScroll: false } });
mockNuxtImport('useRoute', () => () => routeState);
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
    routeState.meta.usesWindowScroll = false;
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
    rafCallback!(performance.now());
    await mounted.vm.$nextTick();
    expect(mounted.get('button').attributes('style')).toContain('display: none');
    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
    rafCallback!(performance.now());
    await mounted.vm.$nextTick();
    expect(mounted.get('button').attributes('style')).toBeUndefined();
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
  const withMainContent = async (
    fn: (wrapperEl: HTMLElement) => void | Promise<void>
  ): Promise<void> => {
    const main = document.createElement('main');
    main.id = 'main-content';
    const wrapperEl = document.createElement('div');
    main.appendChild(wrapperEl);
    document.body.appendChild(main);
    try {
      await fn(wrapperEl);
    } finally {
      main.remove();
    }
  };
  it('tracks scroll on the layout content wrapper when it is the scroll container', async () => {
    await withMainContent(async (wrapperEl) => {
      Object.defineProperty(wrapperEl, 'scrollTop', {
        value: 0,
        writable: true,
        configurable: true,
      });
      const mounted = mountComponent();
      rafCallback!(performance.now());
      await mounted.vm.$nextTick();
      Object.defineProperty(wrapperEl, 'scrollTop', { value: 500, configurable: true });
      wrapperEl.dispatchEvent(new Event('scroll'));
      rafCallback!(performance.now());
      await mounted.vm.$nextTick();
      expect(mounted.get('button').attributes('style')).toBeUndefined();
    });
  });
  it('removes the content wrapper scroll listener on unmount', async () => {
    await withMainContent((wrapperEl) => {
      const removeSpy = vi.spyOn(wrapperEl, 'removeEventListener');
      const mounted = mountComponent();
      mounted.unmount();
      wrapper = null;
      expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    });
  });
  it('scrolls the active content wrapper to top on click', async () => {
    await withMainContent((wrapperEl) => {
      const wrapperScrollTo = vi.fn();
      wrapperEl.scrollTo = wrapperScrollTo;
      const mounted = mountComponent();
      mounted.get('button').trigger('click');
      expect(window.scrollTo).not.toHaveBeenCalled();
      expect(wrapperScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });
  });
  it('uses the window as the active scroll root for window-scroll routes', async () => {
    routeState.meta.usesWindowScroll = true;
    await withMainContent(async (wrapperEl) => {
      const wrapperScrollTo = vi.fn();
      wrapperEl.scrollTo = wrapperScrollTo;
      Object.defineProperty(wrapperEl, 'scrollTop', { value: 500, configurable: true });
      const mounted = mountComponent();
      rafCallback!(performance.now());
      await mounted.vm.$nextTick();
      expect(mounted.get('button').attributes('style')).toContain('display: none');
      Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
      window.dispatchEvent(new Event('scroll'));
      rafCallback!(performance.now());
      await mounted.vm.$nextTick();
      expect(mounted.get('button').attributes('style')).toBeUndefined();
      mounted.get('button').trigger('click');
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      expect(wrapperScrollTo).not.toHaveBeenCalled();
    });
  });
  it('updates the active scroll root after route metadata changes', async () => {
    await withMainContent(async (wrapperEl) => {
      const mounted = mountComponent();
      rafCallback!(performance.now());
      await mounted.vm.$nextTick();
      routeState.meta.usesWindowScroll = true;
      await mounted.vm.$nextTick();
      Object.defineProperty(wrapperEl, 'scrollTop', { value: 500, configurable: true });
      wrapperEl.dispatchEvent(new Event('scroll'));
      rafCallback!(performance.now());
      await mounted.vm.$nextTick();
      expect(mounted.get('button').attributes('style')).toContain('display: none');
      Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
      window.dispatchEvent(new Event('scroll'));
      rafCallback!(performance.now());
      await mounted.vm.$nextTick();
      expect(mounted.get('button').attributes('style')).toBeUndefined();
    });
  });
});
