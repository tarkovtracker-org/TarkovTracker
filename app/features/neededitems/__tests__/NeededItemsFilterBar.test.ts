import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createTestLocaleMessages } from '#tests/test-helpers/i18nMessages';
const UButtonStub = {
  props: ['icon'],
  emits: ['click'],
  template: '<button :data-icon="icon" @click="$emit(\'click\')"><slot /></button>',
};
const UInputStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};
const UIconStub = {
  props: ['name'],
  template: '<i :data-icon-name="name"></i>',
};
const SelectMenuFixedStub = {
  emits: ['update:modelValue'],
  template:
    "<button data-testid=\"sort-select\" @click=\"$emit('update:modelValue', { label: 'Count', value: 'count' })\"><slot /></button>",
};
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  silentTranslationWarn: true,
  messages: createTestLocaleMessages(),
});
const setup = async () => {
  vi.resetModules();
  const { default: NeededItemsFilterBar } =
    await import('@/features/neededitems/NeededItemsFilterBar.vue');
  return NeededItemsFilterBar;
};
const createDefaultProps = () => ({
  modelValue: 'all' as const,
  viewMode: 'list' as const,
  filterTabs: [
    {
      label: 'All',
      value: 'all' as const,
      icon: 'i-mdi-format-list-bulleted',
      count: 3,
      tone: 'neutral' as const,
    },
  ],
  totalCount: 3,
  ungroupedCount: 3,
  firFilter: 'all' as const,
  groupByItem: false,
  hideTeamItems: false,
  hideNonFirSpecialEquipment: false,
  kappaOnly: false,
  sortBy: 'priority' as const,
  sortDirection: 'desc' as const,
  hideOwned: false,
  cardStyle: 'expanded' as const,
});
const createDefaultGlobal = () => ({
  plugins: [i18n],
  stubs: {
    AppTooltip: { template: '<span><slot /></span>' },
    UBadge: true,
    UButton: UButtonStub,
    UIcon: UIconStub,
    UInput: UInputStub,
    SelectMenuFixed: SelectMenuFixedStub,
    UPopover: { template: '<div><slot /><slot name="content" /></div>' },
  },
});
describe('NeededItemsFilterBar', () => {
  it('keeps localized source labels accessible with zero and changing counts', async () => {
    const NeededItemsFilterBar = await setup();
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
        count: 0,
        tone: 'info' as const,
      },
      {
        label: 'Versteck',
        value: 'hideout' as const,
        icon: 'i-mdi-home',
        count: 0,
        tone: 'info' as const,
      },
    ];
    const wrapper = mount(NeededItemsFilterBar, {
      props: { ...createDefaultProps(), filterTabs },
      global: createDefaultGlobal(),
    });
    const tabs = wrapper.get('[role="group"]').findAll('button');
    for (const [index, tab] of tabs.entries()) {
      const label = tab.find('span');
      expect(label.text()).toBe(filterTabs[index]?.label);
      expect(label.classes()).toContain('sr-only');
      expect(label.classes()).toContain('sm:not-sr-only');
      expect(label.classes()).not.toContain('hidden');
      expect(tab.findAll('span').map((span) => span.text())).toEqual([
        filterTabs[index]?.label,
        '0',
      ]);
    }
    await wrapper.setProps({
      filterTabs: filterTabs.map((tab, index) => ({ ...tab, count: index + 1 })),
    });
    for (const [index, tab] of tabs.entries()) {
      expect(tab.findAll('span').map((span) => span.text())).toEqual([
        filterTabs[index]?.label,
        String(index + 1),
      ]);
      expect(tab.findAll('.sr-only')).toHaveLength(1);
    }
    await tabs[1]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['tasks']]);
  });
  it('emits update:viewMode after triggering list view button', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: {
        ...createDefaultProps(),
        viewMode: 'grid',
      },
      global: createDefaultGlobal(),
    });
    await wrapper.find('button[data-icon="i-mdi-view-list"]').trigger('click');
    expect(wrapper.emitted('update:viewMode')).toEqual([['list']]);
  });
  it('emits update:groupByItem when toggle button is clicked', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: createDefaultProps(),
      global: createDefaultGlobal(),
    });
    // No initial emission on mount
    expect(wrapper.emitted('update:groupByItem')).toBeUndefined();
    // Trigger toggle and check emission
    await wrapper.find('button[data-icon="i-mdi-group"]').trigger('click');
    expect(wrapper.emitted('update:groupByItem')).toEqual([[true]]);
  });
  it('keeps the source tabs and the list controls on one bar', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: createDefaultProps(),
      global: createDefaultGlobal(),
    });
    const bar = wrapper.get('[role="group"]').element.parentElement;
    expect(bar?.contains(wrapper.get('[data-testid="sort-select"]').element)).toBe(true);
    expect(bar?.contains(wrapper.get('button[data-icon="i-mdi-group"]').element)).toBe(true);
  });
  it('shows the Completed tab only once something is done', async () => {
    const NeededItemsFilterBar = await setup();
    const completedTab = {
      label: 'Completed',
      value: 'completed' as const,
      icon: 'i-mdi-check-all',
      count: 0,
      tone: 'success' as const,
    };
    const defaults = createDefaultProps();
    const wrapper = mount(NeededItemsFilterBar, {
      props: { ...defaults, filterTabs: [...defaults.filterTabs, completedTab] },
      global: createDefaultGlobal(),
    });
    const tabLabels = () =>
      wrapper
        .get('[role="group"]')
        .findAll('.sr-only')
        .map((label) => label.text());
    expect(tabLabels()).toEqual(['All']);
    await wrapper.setProps({
      filterTabs: [...defaults.filterTabs, { ...completedTab, count: 2 }],
    });
    expect(tabLabels()).toEqual(['All', 'Completed']);
    // Un-completing the last item while Completed is picked keeps the active filter visible.
    await wrapper.setProps({
      modelValue: 'completed',
      filterTabs: [...defaults.filterTabs, completedTab],
    });
    expect(tabLabels()).toEqual(['All', 'Completed']);
  });
  it('renders the filter icon only once per tab', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: createDefaultProps(),
      global: createDefaultGlobal(),
    });
    expect(wrapper.findAll('[data-icon-name="i-mdi-format-list-bulleted"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-icon="i-mdi-format-list-bulleted"]')).toHaveLength(0);
  });
  it('normalizes object sort selections before emitting updates', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: { ...createDefaultProps(), sortDirection: 'asc' as const },
      global: createDefaultGlobal(),
    });
    await wrapper.find('[data-testid="sort-select"]').trigger('click');
    expect(wrapper.emitted('update:sortBy')).toEqual([['count']]);
    expect(wrapper.emitted('update:sortDirection')).toEqual([['desc']]);
  });
  it('lists active filters as chips and hides the idle Kappa chip on the Hideout scope', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: {
        ...createDefaultProps(),
        modelValue: 'hideout' as const,
        firFilter: 'non-fir' as const,
        hideOwned: true,
        kappaOnly: true,
      },
      global: createDefaultGlobal(),
    });
    const chips = wrapper.get('[data-testid="needed-items-active-filters"]');
    expect(chips.get('[data-testid="needed-items-active-filters-fir"]').text()).toBe(
      'page.needed_items.filters.chips.non_fir'
    );
    expect(chips.find('[data-testid="needed-items-active-filters-hide_owned"]').exists()).toBe(
      true
    );
    expect(chips.find('[data-testid="needed-items-active-filters-kappa_only"]').exists()).toBe(
      false
    );
    expect(wrapper.get('[data-testid="needed-items-filters-count"]').text()).toBe('2');
    await wrapper.setProps({ modelValue: 'tasks' });
    expect(chips.find('[data-testid="needed-items-active-filters-kappa_only"]').exists()).toBe(
      true
    );
    expect(wrapper.get('[data-testid="needed-items-filters-count"]').text()).toBe('3');
  });
  it('clears one filter from its chip without touching the others', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: { ...createDefaultProps(), firFilter: 'fir' as const, hideTeamItems: true },
      global: createDefaultGlobal(),
    });
    await wrapper.get('[data-testid="needed-items-active-filters-fir"]').trigger('click');
    expect(wrapper.emitted('update:firFilter')).toEqual([['all']]);
    expect(wrapper.emitted('update:hideTeamItems')).toBeUndefined();
  });
  it('resets every saved filter from the popover, including Kappa only on the Hideout scope', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: {
        ...createDefaultProps(),
        modelValue: 'hideout' as const,
        firFilter: 'fir' as const,
        hideOwned: true,
        hideTeamItems: true,
        hideNonFirSpecialEquipment: true,
        kappaOnly: true,
      },
      global: createDefaultGlobal(),
    });
    await wrapper.get('[data-testid="needed-items-filters-reset"]').trigger('click');
    expect(wrapper.emitted('update:firFilter')).toEqual([['all']]);
    expect(wrapper.emitted('update:hideOwned')).toEqual([[false]]);
    expect(wrapper.emitted('update:hideTeamItems')).toEqual([[false]]);
    expect(wrapper.emitted('update:hideNonFirSpecialEquipment')).toEqual([[false]]);
    expect(wrapper.emitted('update:kappaOnly')).toEqual([[false]]);
  });
  it('keeps Reset available while Kappa only sits idle on the Hideout scope', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: { ...createDefaultProps(), modelValue: 'hideout' as const },
      global: createDefaultGlobal(),
    });
    const reset = () => wrapper.get('[data-testid="needed-items-filters-reset"]');
    expect(reset().attributes('disabled')).toBeDefined();
    await wrapper.setProps({ kappaOnly: true });
    expect(wrapper.find('[data-testid="needed-items-filters-count"]').exists()).toBe(false);
    expect(reset().attributes('disabled')).toBeUndefined();
  });
  it('hides the chip row when no filter is active', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: createDefaultProps(),
      global: createDefaultGlobal(),
    });
    expect(wrapper.find('[data-testid="needed-items-active-filters"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="needed-items-filters-count"]').exists()).toBe(false);
  });
});
