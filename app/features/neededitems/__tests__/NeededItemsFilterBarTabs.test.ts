import { mountSuspended } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import NeededItemsFilterBar from '@/features/neededitems/NeededItemsFilterBar.vue';
type FilterType = 'all' | 'tasks' | 'hideout' | 'completed';
const filterTabs = [
  {
    label: 'Alle',
    value: 'all' as const,
    icon: 'i-mdi-format-list-bulleted',
    count: 0,
    tone: 'neutral' as const,
  },
  {
    label: 'Aufgaben',
    value: 'tasks' as const,
    icon: 'i-mdi-checkbox-marked-circle-outline',
    count: 17,
    tone: 'info' as const,
  },
  {
    label: 'Versteck',
    value: 'hideout' as const,
    icon: 'i-mdi-home',
    count: 4,
    tone: 'info' as const,
  },
];
const props = {
  modelValue: 'all' as const,
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
  it('exposes the sources as labelled toggle buttons that switch on click', async () => {
    const wrapper = await mountSuspended(NeededItemsFilterBar, {
      attachTo: document.body,
      props: {
        ...props,
        'onUpdate:modelValue': (value: FilterType) => {
          void wrapper.setProps({ modelValue: value });
        },
      },
      global: {
        stubs: {
          AppTooltip: { template: '<span><slot /></span>' },
          SelectMenuFixed: true,
          UPopover: true,
        },
      },
    });
    const group = wrapper.get('[role="group"]');
    expect(group.attributes('aria-label')).toBe('Needed item filters');
    const tabs = group.findAll('button');
    expect(
      tabs.map((tab) => [tab.get('.sr-only').text(), tab.get('.rounded-full').text()])
    ).toEqual([
      ['Alle', '0'],
      ['Aufgaben', '17'],
      ['Versteck', '4'],
    ]);
    expect(tabs.map((tab) => tab.attributes('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(tabs[0]?.attributes('disabled')).toBeUndefined();
    (tabs[0]!.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(tabs[0]!.element);
    await tabs[0]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await tabs[1]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['tasks']);
    expect(tabs.map((tab) => tab.attributes('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(tabs[1]?.attributes('disabled')).toBeUndefined();
    await tabs[1]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['tasks']]);
    wrapper.unmount();
  });
});
