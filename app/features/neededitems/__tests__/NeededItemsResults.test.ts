import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NeededItemsResults from '@/features/neededitems/NeededItemsResults.vue';
import type { NeededItemTaskObjective } from '@/types/tarkov';
const items = [
  { id: 'a', needType: 'taskObjective' },
  { id: 'b', needType: 'taskObjective' },
] as unknown as NeededItemTaskObjective[];
const mountResults = (props: Partial<InstanceType<typeof NeededItemsResults>['$props']>) =>
  mount(NeededItemsResults, {
    props: {
      groupByItem: false,
      viewMode: 'list',
      cardStyle: 'compact',
      activeFilter: 'all',
      groupedItems: [],
      items,
      objectivesByItemId: new Map(),
      search: '',
      initiallyVisibleCount: 1,
      hasMore: true,
      ...props,
    },
    global: {
      stubs: {
        NeededItem: {
          props: ['itemStyle', 'initiallyVisible'],
          template:
            '<div data-testid="item" :data-style="itemStyle" :data-visible="String(initiallyVisible)" />',
        },
        NeededItemGroupedCard: {
          props: ['groupedItem'],
          emits: ['open'],
          template:
            '<button data-testid="group" @click="$emit(\'open\', groupedItem.item.id)">{{ groupedItem.item.id }}</button>',
        },
        NeededItemGroupedModal: {
          props: ['open', 'itemInfo', 'taskObjectives'],
          template:
            '<div data-testid="modal" :data-open="String(open)" :data-item="itemInfo.id" :data-objectives="taskObjectives.map((o) => o.id).join()" />',
        },
      },
    },
  });
const groupedItems = [
  { item: { id: 'item-a' } },
  { item: { id: 'item-b' } },
] as unknown as InstanceType<typeof NeededItemsResults>['$props']['groupedItems'];
describe('NeededItemsResults', () => {
  it('shares one grouped modal across cards and opens it for the clicked item', async () => {
    const wrapper = mountResults({
      groupByItem: true,
      groupedItems,
      objectivesByItemId: new Map([
        ['item-a', { taskObjectives: [items[0]!], hideoutModules: [] }],
        ['item-b', { taskObjectives: [items[1]!], hideoutModules: [] }],
      ]),
    });
    expect(wrapper.findAll('[data-testid="modal"]')).toHaveLength(0);
    const groups = wrapper.findAll('[data-testid="group"]');
    await groups[1]!.trigger('click');
    const modals = wrapper.findAll('[data-testid="modal"]');
    expect(modals).toHaveLength(1);
    expect(modals[0]!.attributes()).toMatchObject({
      'data-open': 'true',
      'data-item': 'item-b',
      'data-objectives': 'b',
    });
    await groups[0]!.trigger('click');
    expect(wrapper.findAll('[data-testid="modal"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="modal"]').attributes('data-item')).toBe('item-a');
  });
  it('keeps the modal closed when a selected group drops out and comes back', async () => {
    const wrapper = mountResults({ groupByItem: true, groupedItems });
    await wrapper.findAll('[data-testid="group"]')[0]!.trigger('click');
    await wrapper.setProps({ groupedItems: groupedItems.slice(1) });
    expect(wrapper.find('[data-testid="modal"]').exists()).toBe(false);
    await wrapper.setProps({ groupedItems });
    expect(wrapper.get('[data-testid="modal"]').attributes('data-open')).toBe('false');
  });
  it.each(['list', 'grid'] as const)(
    'exposes one scroll sentinel in %s view while more items remain',
    async (viewMode) => {
      const wrapper = mountResults({ viewMode });
      const sentinel = (wrapper.vm as unknown as { sentinel: HTMLElement | null }).sentinel;
      expect(sentinel).toBeInstanceOf(HTMLElement);
      expect(wrapper.findAll('.h-1')).toHaveLength(1);
      await wrapper.setProps({ hasMore: false });
      expect((wrapper.vm as unknown as { sentinel: HTMLElement | null }).sentinel).toBeNull();
    }
  );
  it('renders rows in list view and cards in grid view, eagerly showing the first batch', async () => {
    const wrapper = mountResults({ viewMode: 'list' });
    const rows = wrapper.findAll('[data-testid="item"]');
    expect(rows.map((row) => row.attributes('data-style'))).toEqual(['row', 'row']);
    expect(rows.map((row) => row.attributes('data-visible'))).toEqual(['true', 'false']);
    await wrapper.setProps({ viewMode: 'grid' });
    expect(
      wrapper.findAll('[data-testid="item"]').map((card) => card.attributes('data-style'))
    ).toEqual(['card', 'card']);
  });
});
