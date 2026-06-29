import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
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
  messages: {
    en: {},
    de: {},
    es: {},
    fr: {},
    ru: {},
    uk: {},
    zh: {},
    ko: {},
  },
});
const setup = async () => {
  vi.resetModules();
  const { default: NeededItemsFilterBar } =
    await import('@/features/neededitems/NeededItemsFilterBar.vue');
  return NeededItemsFilterBar;
};
const createDefaultProps = () => ({
  modelValue: 'all' as const,
  search: '',
  viewMode: 'list' as const,
  filterTabs: [
    { label: 'All', value: 'all' as const, icon: 'i-mdi-format-list-bulleted', count: 3 },
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
    UTabs: {
      props: ['items', 'modelValue', 'variant'],
      emits: ['update:modelValue'],
      template:
        '<div :data-variant="variant"><button v-for="item in items" :key="item.value" @click="$emit(\'update:modelValue\', item.value)"><i v-if="item.icon" :data-leading-icon="item.icon"></i><slot :item="item">{{ item.label }}</slot></button></div>',
    },
    UPopover: { template: '<div><slot /><slot name="content" /></div>' },
  },
});
describe('NeededItemsFilterBar', () => {
  it('emits update:search after setting input value', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: createDefaultProps(),
      global: createDefaultGlobal(),
    });
    await wrapper.find('input').setValue('gpu');
    expect(wrapper.emitted('update:search')).toEqual([['gpu']]);
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
  it('uses link tabs instead of the default pill variant', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: createDefaultProps(),
      global: createDefaultGlobal(),
    });
    expect(wrapper.find('[data-variant]').attributes('data-variant')).toBe('link');
  });
  it('renders the filter icon only once per tab', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: createDefaultProps(),
      global: createDefaultGlobal(),
    });
    expect(wrapper.findAll('[data-leading-icon="i-mdi-format-list-bulleted"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-icon-name="i-mdi-format-list-bulleted"]')).toHaveLength(0);
  });
  it('normalizes object sort selections before emitting updates', async () => {
    const NeededItemsFilterBar = await setup();
    const wrapper = mount(NeededItemsFilterBar, {
      props: createDefaultProps(),
      global: createDefaultGlobal(),
    });
    await wrapper.find('[data-testid="sort-select"]').trigger('click');
    expect(wrapper.emitted('update:sortBy')).toEqual([['count']]);
    expect(wrapper.emitted('update:sortDirection')).toEqual([['desc']]);
  });
});
