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
      groupedItems: [],
      items,
      objectivesByItemId: new Map(),
      search: '',
      hasMore: true,
      ...props,
    },
    global: {
      stubs: {
        NeededItem: {
          props: ['layout'],
          template: '<div data-testid="item" :data-layout="layout" />',
        },
        NeededItemGroupEntry: {
          props: ['group', 'needs', 'layout'],
          emits: ['open'],
          template:
            '<button data-testid="group" :data-layout="layout" :data-needs="needs.map((n) => n.id).join()" @click="$emit(\'open\', group.item.id)">{{ group.item.id }}</button>',
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
const objectivesByItemId = new Map([
  ['item-a', { taskObjectives: [items[0]!], hideoutModules: [] }],
  ['item-b', { taskObjectives: [items[1]!], hideoutModules: [] }],
]);
describe('NeededItemsResults', () => {
  it('shares one grouped modal across entries and opens it for the clicked item', async () => {
    const wrapper = mountResults({ groupByItem: true, groupedItems, objectivesByItemId });
    expect(wrapper.findAll('[data-testid="modal"]')).toHaveLength(0);
    const groups = wrapper.findAll('[data-testid="group"]');
    expect(groups.map((group) => group.attributes('data-needs'))).toEqual(['a', 'b']);
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
  it.each([false, true])(
    'uses rows in a divided list and tiles in a grid (grouped=%s)',
    async (groupByItem) => {
      const testId = groupByItem ? 'group' : 'item';
      const wrapper = mountResults({ groupByItem, groupedItems, objectivesByItemId });
      const results = () => wrapper.get('[data-testid="needed-items-results"]');
      expect(results().element.tagName).toBe('UL');
      expect(wrapper.findAll('li')).toHaveLength(2);
      expect(
        wrapper.findAll(`[data-testid="${testId}"]`).map((entry) => entry.attributes('data-layout'))
      ).toEqual(['row', 'row']);
      await wrapper.setProps({ viewMode: 'grid' });
      expect(results().attributes('data-layout')).toBe('grid');
      expect(wrapper.findAll('li')).toHaveLength(0);
      expect(
        wrapper.findAll(`[data-testid="${testId}"]`).map((entry) => entry.attributes('data-layout'))
      ).toEqual(['tile', 'tile']);
    }
  );
});
