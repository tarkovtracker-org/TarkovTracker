import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import ObjectiveItemDisplay from '@/features/tasks/ObjectiveItemDisplay.vue';
import type { TarkovItem } from '@/types/tarkov';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string, namedOrDefault?: Record<string, unknown> | string) =>
      namedOrDefault && typeof namedOrDefault === 'object' && 'count' in namedOrDefault
        ? `${key}:${namedOrDefault.count}`
        : key,
  }),
}));
const makeItem = (id: string, name: string): TarkovItem =>
  ({ id, name, iconLink: `https://img/${id}.png` }) as TarkovItem;
const AppTooltipStub = defineComponent({
  template: '<span><slot /><slot name="content" /></span>',
});
const AcceptedItemsPopoverStub = defineComponent({
  props: { items: { type: Array, default: () => [] }, cycling: Boolean },
  template: '<span class="accepted-items-popover">any-of:{{ items.length }}</span>',
});
const mountDisplay = (props: {
  primaryItem?: TarkovItem;
  acceptedItems?: TarkovItem[];
  fallbackName: string;
  paused?: boolean;
}) =>
  mount(ObjectiveItemDisplay, {
    props,
    global: {
      stubs: {
        AppTooltip: AppTooltipStub,
        AcceptedItemsPopover: AcceptedItemsPopoverStub,
        UIcon: true,
      },
    },
  });
describe('ObjectiveItemDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('shows the single item without an "any of" badge', () => {
    const wrapper = mountDisplay({
      primaryItem: makeItem('augmentin', 'Augmentin antibiotic pills'),
      fallbackName: 'Augmentin antibiotic pills',
    });
    expect(wrapper.text()).toContain('Augmentin antibiotic pills');
    expect(wrapper.find('.accepted-items-popover').exists()).toBe(false);
  });
  it('cycles through accepted items and shows the accepted-items badge', async () => {
    const accepted = [
      makeItem('augmentin', 'Augmentin antibiotic pills'),
      makeItem('analgin', 'Analgin painkillers'),
    ];
    const wrapper = mountDisplay({
      primaryItem: accepted[0],
      acceptedItems: accepted,
      fallbackName: 'Augmentin antibiotic pills',
    });
    await nextTick();
    // Badge popover is rendered with the full accepted-item list.
    expect(wrapper.find('.accepted-items-popover').text()).toBe('any-of:2');
    expect(wrapper.text()).toContain('Augmentin antibiotic pills');
    vi.advanceTimersByTime(5000);
    await nextTick();
    expect(wrapper.text()).toContain('Analgin painkillers');
  });
  it('pauses cycling while hovered so users can read the current item', async () => {
    const accepted = [
      makeItem('augmentin', 'Augmentin antibiotic pills'),
      makeItem('analgin', 'Analgin painkillers'),
    ];
    const wrapper = mountDisplay({
      primaryItem: accepted[0],
      acceptedItems: accepted,
      fallbackName: 'Augmentin antibiotic pills',
    });
    await nextTick();
    await wrapper.find('span.contents').trigger('mouseenter');
    vi.advanceTimersByTime(15000);
    await nextTick();
    // Stays on the primary item while hovered.
    expect(wrapper.text()).toContain('Augmentin antibiotic pills');
    expect(wrapper.text()).not.toContain('Analgin painkillers');
  });
  it('does not cycle when paused', async () => {
    const accepted = [
      makeItem('augmentin', 'Augmentin antibiotic pills'),
      makeItem('analgin', 'Analgin painkillers'),
    ];
    const wrapper = mountDisplay({
      primaryItem: accepted[0],
      acceptedItems: accepted,
      fallbackName: 'Augmentin antibiotic pills',
      paused: true,
    });
    await nextTick();
    vi.advanceTimersByTime(15000);
    await nextTick();
    // Stays on the primary item; no rotation while paused.
    expect(wrapper.text()).toContain('Augmentin antibiotic pills');
    expect(wrapper.text()).not.toContain('Analgin painkillers');
  });
});
