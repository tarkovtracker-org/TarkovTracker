import { mountSuspended } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import NeededItemsFilterBar from '@/features/neededitems/NeededItemsFilterBar.vue';
type FilterType = 'all' | 'tasks' | 'hideout' | 'completed';
const filterTabs = [
  { label: 'Alle', value: 'all' as const, icon: 'i-mdi-clipboard-list', count: 0 },
  {
    label: 'Aufgaben',
    value: 'tasks' as const,
    icon: 'i-mdi-checkbox-marked-circle-outline',
    count: 17,
  },
  { label: 'Versteck', value: 'hideout' as const, icon: 'i-mdi-home', count: 4 },
];
const props = {
  modelValue: 'all' as const,
  search: '',
  viewMode: 'list' as const,
  filterTabs,
  totalCount: 21,
  ungroupedCount: 21,
  firFilter: 'all' as const,
  groupByItem: false,
  hideTeamItems: false,
  hideNonFirSpecialEquipment: false,
  kappaOnly: false,
  sortBy: 'priority' as const,
  sortDirection: 'desc' as const,
  hideOwned: false,
  cardStyle: 'expanded' as const,
};
describe('NeededItemsFilterBar source tabs', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('exposes labelled tabs with arrow-key selection through the real tab primitives', async () => {
    const wrapper = await mountSuspended(NeededItemsFilterBar, {
      props: {
        ...props,
        'onUpdate:modelValue': (value: FilterType) => wrapper.setProps({ modelValue: value }),
      },
      attachTo: document.body,
      global: {
        stubs: {
          AppTooltip: { template: '<span><slot /></span>' },
          SelectMenuFixed: true,
          UPopover: true,
        },
      },
    });
    const tabs = wrapper.find('[role="tablist"]').findAll('[role="tab"]');
    expect(
      tabs.map((tab) => [tab.find('.sr-only').text(), tab.find('.rounded-full').text()])
    ).toEqual([
      ['Alle', '0'],
      ['Aufgaben', '17'],
      ['Versteck', '4'],
    ]);
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs[0]?.classes().some((name) => name.startsWith('focus-visible:'))).toBe(true);
    (tabs[0]?.element as HTMLElement).focus();
    await tabs[0]?.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]?.element);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['tasks']);
    expect(tabs[1]?.attributes('aria-selected')).toBe('true');
    await tabs[1]?.trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[0]?.element);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['all']);
    wrapper.unmount();
  });
});
