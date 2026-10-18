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
        NeededItemGroupedCard: true,
      },
    },
  });
describe('NeededItemsResults', () => {
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
