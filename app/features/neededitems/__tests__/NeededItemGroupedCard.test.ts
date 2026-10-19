import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import NeededItemGroupedCard from '@/features/neededitems/NeededItemGroupedCard.vue';
import type { GroupedNeededItem } from '@/types/tarkov';
vi.mock('@/composables/useCraftableItem', () => ({
  useCraftableItem: () => ({
    isCraftable: true,
    craftableTitle: 'Craft',
    goToCraftStation: vi.fn(),
  }),
}));
vi.mock('@/utils/formatters', () => ({ useLocaleNumberFormatter: () => String }));
const groupedItem: GroupedNeededItem = {
  item: { id: 'item', name: 'Bolts' },
  taskFir: 3,
  taskFirCurrent: 1,
  taskNonFir: 2,
  taskNonFirCurrent: 2,
  hideoutFir: 0,
  hideoutFirCurrent: 0,
  hideoutNonFir: 4,
  hideoutNonFirCurrent: 0,
  total: 9,
  currentCount: 3,
};
const mountCard = () =>
  mount(NeededItemGroupedCard, {
    props: { groupedItem },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AppTooltip: { props: ['text'], template: '<div :title="text"><slot /></div>' },
        GameItem: { template: '<a href="#item"><span>Wiki</span></a>' },
        UIcon: true,
      },
    },
  });
describe('NeededItemGroupedCard', () => {
  it.each(['click', 'Enter', ' '])('opens the item with %s', async (action) => {
    const wrapper = mountCard();
    if (action === 'click') await wrapper.trigger('click');
    else await wrapper.trigger('keydown', { key: action });
    expect(wrapper.emitted('open')).toEqual([['item']]);
  });
  it.each(['button', 'a span'])('does not open from nested %s interactions', async (selector) => {
    const wrapper = mountCard();
    await wrapper.get(selector).trigger('click');
    await wrapper.get(selector).trigger('keydown', { key: 'Enter' });
    await wrapper.get(selector).trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('open')).toBeUndefined();
  });
  it('shows only the selected source and omits zero FIR requirements', async () => {
    const wrapper = mountCard();
    expect(wrapper.text()).toContain('common.tasks');
    expect(wrapper.text()).toContain('common.hideout');
    expect(wrapper.text()).toContain('1/3');
    expect(wrapper.text()).toContain('2/2');
    expect(wrapper.text()).toContain('0/4');
    expect(wrapper.text()).not.toContain('0/0');
    await wrapper.setProps({ activeFilter: 'tasks' });
    expect(wrapper.text()).toContain('1/3');
    expect(wrapper.text()).not.toContain('0/4');
    await wrapper.setProps({ activeFilter: 'hideout' });
    expect(wrapper.text()).toContain('0/4');
    expect(wrapper.text()).not.toContain('1/3');
    await wrapper.setProps({
      activeFilter: 'completed',
      groupedItem: { ...groupedItem, currentCount: 9 },
    });
    expect(wrapper.text()).toContain('9/9');
    expect(wrapper.text()).toContain('common.tasks');
    expect(wrapper.text()).toContain('common.hideout');
    await wrapper.setProps({ groupedItem: { ...groupedItem, hideoutNonFir: 0 } });
    expect(wrapper.text()).toContain('-');
  });
});
