import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const translations: Record<string, string> = {
  'common.close': 'Close',
  'common.finish': 'Finish',
  'common.next': 'Next',
  'common.previous': 'Previous',
};
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => translations[key] ?? key,
}));
const UButtonStub = {
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};
type HelpStep = {
  avoidSelector?: string;
  advanceOnSelector?: string;
  bullets?: string[];
  description: string;
  interactionHint?: string;
  preferredPlacement?: 'bottom' | 'left' | 'right' | 'top';
  targetSelector: string;
  title: string;
};
const createTarget = (name: string, rect: Partial<DOMRect>) => {
  const element = document.createElement('div');
  element.setAttribute('data-help-target', name);
  element.scrollIntoView = vi.fn();
  element.getBoundingClientRect = () =>
    ({
      bottom: rect.bottom ?? 0,
      height: rect.height ?? 80,
      left: rect.left ?? 0,
      right: rect.right ?? 200,
      toJSON: () => ({}),
      top: rect.top ?? 0,
      width: rect.width ?? 200,
      x: rect.x ?? rect.left ?? 0,
      y: rect.y ?? rect.top ?? 0,
    }) as DOMRect;
  document.body.appendChild(element);
  return element;
};
const defaultSteps: HelpStep[] = [
  {
    bullets: ['Start with the main filters.'],
    description: 'This step highlights the filter bar.',
    targetSelector: '[data-help-target="step-one"]',
    title: 'Filter bar',
  },
  {
    description: 'This step highlights the settings cluster.',
    targetSelector: '[data-help-target="step-two"]',
    title: 'Settings',
  },
];
const mountComponent = async (steps: HelpStep[] = defaultSteps) => {
  const { default: PageHelpSpotlight } = await import('@/components/ui/PageHelpSpotlight.vue');
  return mountSuspended(PageHelpSpotlight, {
    attachTo: document.body,
    props: {
      steps,
      title: 'Hideout guide',
    },
    global: {
      stubs: {
        Teleport: false,
        UButton: UButtonStub,
        UIcon: true,
      },
    },
  });
};
const flushUi = async (wrapper: Awaited<ReturnType<typeof mountComponent>>) => {
  await wrapper.vm.$nextTick();
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
  await wrapper.vm.$nextTick();
};
const findBodyButton = (label: string) =>
  Array.from(document.body.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(label)
  );
describe('PageHelpSpotlight', () => {
  let originalInnerHeight: number;
  let originalInnerWidth: number;
  beforeEach(() => {
    document.body.innerHTML = '';
    originalInnerHeight = window.innerHeight;
    originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1400,
      writable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
      writable: true,
    });
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0))
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => window.clearTimeout(id))
    );
    createTarget('step-one', {
      bottom: 1060,
      height: 72,
      left: 120,
      right: 720,
      top: 988,
      width: 600,
    });
    createTarget('step-two', {
      bottom: 1180,
      height: 96,
      left: 180,
      right: 580,
      top: 1084,
      width: 400,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
      writable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
    document.body.innerHTML = '';
  });
  it('renders the first step as a modal dialog and advances to the next target', async () => {
    const wrapper = await mountComponent();
    await flushUi(wrapper);
    const dialog = document.body.querySelector('aside');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(document.body.textContent ?? '').toContain('Filter bar');
    const nextButton = findBodyButton('Next');
    expect(nextButton).toBeTruthy();
    nextButton!.click();
    await flushUi(wrapper);
    expect(document.body.textContent ?? '').toContain('Settings');
    expect(document.body.textContent ?? '').not.toContain('Start with the main filters.');
    wrapper.unmount();
  });
  it('emits close when finishing the final step', async () => {
    const wrapper = await mountComponent();
    await flushUi(wrapper);
    const nextButton = findBodyButton('Next');
    expect(nextButton).toBeTruthy();
    nextButton!.click();
    await flushUi(wrapper);
    const finishButton = findBodyButton('Finish');
    expect(finishButton).toBeTruthy();
    finishButton!.click();
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
  it('emits close when pressing escape', async () => {
    const wrapper = await mountComponent();
    await flushUi(wrapper);
    const dialog = document.body.querySelector('aside');
    dialog?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Escape',
      })
    );
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
  it('advances when the current step target is clicked', async () => {
    const wrapper = await mountComponent([
      {
        advanceOnSelector: '[data-help-target="step-one"]',
        bullets: ['Click the highlighted target.'],
        description: 'This step should advance on click.',
        interactionHint: 'Click the target to continue.',
        targetSelector: '[data-help-target="step-one"]',
        title: 'Interactive step',
      },
      {
        bullets: ['Done.'],
        description: 'The second step should now be visible.',
        targetSelector: '[data-help-target="step-two"]',
        title: 'Advanced',
      },
    ]);
    await flushUi(wrapper);
    const stepOneTarget = document.body.querySelector('[data-help-target="step-one"]');
    expect(document.body.textContent ?? '').toContain('Interactive step');
    stepOneTarget?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushUi(wrapper);
    expect(document.body.textContent ?? '').toContain('Advanced');
    wrapper.unmount();
  });
  it('ignores a stale queued target click after manual navigation', async () => {
    createTarget('step-three', {
      bottom: 1260,
      height: 96,
      left: 180,
      right: 580,
      top: 1164,
      width: 400,
    });
    const wrapper = await mountComponent([
      {
        advanceOnSelector: '[data-help-target="step-one"]',
        description: 'This step should advance on click.',
        targetSelector: '[data-help-target="step-one"]',
        title: 'Interactive step',
      },
      {
        description: 'The second step should stay visible.',
        targetSelector: '[data-help-target="step-two"]',
        title: 'Advanced',
      },
      {
        description: 'This step should not be skipped to.',
        targetSelector: '[data-help-target="step-three"]',
        title: 'Skipped',
      },
    ]);
    await flushUi(wrapper);
    const stepOneTarget = document.body.querySelector('[data-help-target="step-one"]');
    const nextButton = findBodyButton('Next');
    expect(nextButton).toBeTruthy();
    stepOneTarget?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    nextButton!.click();
    await flushUi(wrapper);
    expect(document.body.textContent ?? '').toContain('Advanced');
    expect(document.body.textContent ?? '').not.toContain('Skipped');
    wrapper.unmount();
  });
  it('restores focus to the opener when closed', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open guide';
    document.body.appendChild(opener);
    opener.focus();
    const wrapper = await mountComponent();
    await flushUi(wrapper);
    const closeButton = document.body.querySelector(
      'button[aria-label="Close"]'
    ) as HTMLButtonElement | null;
    expect(closeButton).toBeTruthy();
    closeButton!.click();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(opener);
    wrapper.unmount();
  });
  it('blocks outside clicks without closing the guide', async () => {
    const wrapper = await mountComponent();
    await flushUi(wrapper);
    const overlayPanel = document.body.querySelector(
      '[data-testid="page-help-overlay-panel"]'
    ) as HTMLElement | null;
    expect(overlayPanel).toBeTruthy();
    overlayPanel?.click();
    await flushUi(wrapper);
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(document.body.textContent ?? '').toContain('Filter bar');
    wrapper.unmount();
  });
  it('matches the overlay cutout to the visible highlight padding', async () => {
    const wrapper = await mountComponent();
    await flushUi(wrapper);
    const overlayPanels = Array.from(
      document.body.querySelectorAll<HTMLElement>('[data-testid="page-help-overlay-panel"]')
    );
    expect(overlayPanels).toHaveLength(4);
    expect(overlayPanels[2]?.style.left).toBe('728px');
    expect(overlayPanels[3]?.style.top).toBe('1068px');
    wrapper.unmount();
  });
  it('avoids covering protected content by shifting to a narrower side placement', async () => {
    createTarget('step-three', {
      bottom: 420,
      height: 300,
      left: 360,
      right: 560,
      top: 120,
      width: 200,
    });
    createTarget('avoid-zone', {
      bottom: 900,
      height: 780,
      left: 360,
      right: 1000,
      top: 120,
      width: 640,
    });
    const wrapper = await mountComponent([
      {
        avoidSelector: '[data-help-target="avoid-zone"]',
        bullets: ['Keep the card out of the grid.'],
        description: 'This step highlights a station card.',
        preferredPlacement: 'right',
        targetSelector: '[data-help-target="step-three"]',
        title: 'Materials',
      },
    ]);
    await flushUi(wrapper);
    const dialog = document.body.querySelector('aside') as HTMLElement | null;
    expect(dialog).toBeTruthy();
    const dialogLeft = Number.parseFloat(dialog!.style.left);
    const dialogWidth = Number.parseFloat(dialog!.style.width);
    expect(dialogLeft).toBeGreaterThanOrEqual(16);
    expect(dialogWidth).toBeLessThan(360);
    expect(dialogLeft + dialogWidth <= 360 || dialogLeft >= 1000).toBe(true);
    wrapper.unmount();
  });
});
