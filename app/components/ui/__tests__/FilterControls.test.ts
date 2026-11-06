import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ActiveFilterChips from '@/components/ui/ActiveFilterChips.vue';
import FiltersPopover from '@/components/ui/FiltersPopover.vue';
import PreferenceSwitch from '@/components/ui/PreferenceSwitch.vue';
import SortControl from '@/components/ui/SortControl.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));
const UButtonStub = {
  props: ['icon', 'disabled', 'ariaLabel'],
  emits: ['click'],
  template:
    '<button :data-icon="icon" :disabled="disabled" :aria-label="ariaLabel" @click="$emit(\'click\')"><slot /></button>',
};
const stubs = {
  UButton: UButtonStub,
  UIcon: true,
  UPopover: { template: '<div><slot /><slot name="content" /></div>' },
  USwitch: {
    props: ['modelValue', 'disabled'],
    template: '<input type="checkbox" :checked="modelValue" :disabled="disabled" />',
  },
  SelectMenuFixed: { template: '<div data-testid="sort-select"><slot name="leading" /></div>' },
};
const filter = (key: string) => ({ key, label: key, clear: vi.fn() });
describe('ActiveFilterChips', () => {
  it('renders nothing without active filters', () => {
    const wrapper = mount(ActiveFilterChips, {
      props: { filters: [], testIdPrefix: 'chips' },
      global: { stubs },
    });
    expect(wrapper.find('[data-testid="chips"]').exists()).toBe(false);
  });
  it('clears one filter per chip and offers clear all only for several filters', async () => {
    const single = filter('a');
    const wrapper = mount(ActiveFilterChips, {
      props: { filters: [single], testIdPrefix: 'chips' },
      global: { stubs },
    });
    expect(wrapper.find('[data-testid="chips-clear"]').exists()).toBe(false);
    await wrapper.get('[data-testid="chips-a"]').trigger('click');
    expect(single.clear).toHaveBeenCalledTimes(1);
    const first = filter('a');
    const second = filter('b');
    await wrapper.setProps({ filters: [first, second] });
    await wrapper.get('[data-testid="chips-clear"]').trigger('click');
    expect(first.clear).toHaveBeenCalledTimes(1);
    expect(second.clear).toHaveBeenCalledTimes(1);
  });
});
describe('FiltersPopover', () => {
  const mountPopover = (activeCount: number) =>
    mount(FiltersPopover, {
      props: { title: 'Filters', activeCount, testIdPrefix: 'f' },
      slots: { default: '<p data-testid="section">section</p>' },
      global: { stubs },
    });
  it('disables reset and hides the count when nothing is filtered', () => {
    const wrapper = mountPopover(0);
    expect(wrapper.find('[data-testid="f-count"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="f-reset"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="f-button"]').attributes('aria-label')).toBe(
      'filter_menu.button'
    );
  });
  it('shows the active count and emits reset', async () => {
    const wrapper = mountPopover(2);
    expect(wrapper.get('[data-testid="f-count"]').text()).toBe('2');
    expect(wrapper.get('[data-testid="f-button"]').attributes('aria-label')).toBe(
      'filter_menu.button_active:{"count":2}'
    );
    expect(wrapper.find('[data-testid="section"]').exists()).toBe(true);
    await wrapper.get('[data-testid="f-reset"]').trigger('click');
    expect(wrapper.emitted('reset')).toHaveLength(1);
  });
});
describe('SortControl', () => {
  it('labels the direction button by the current direction and emits toggles', async () => {
    const wrapper = mount(SortControl, {
      props: {
        items: [{ value: 'name', label: 'Name', icon: 'i-mdi-format-title' }],
        label: 'Sort',
        leadingIcon: 'i-mdi-sort',
        direction: 'asc' as const,
        modelValue: 'name',
      },
      global: { stubs },
    });
    const button = wrapper.get('button');
    expect(button.attributes('data-icon')).toBe('i-mdi-sort-ascending');
    expect(button.attributes('aria-label')).toBe('filter_menu.sort_ascending');
    await wrapper.setProps({ direction: 'desc' });
    expect(button.attributes('data-icon')).toBe('i-mdi-sort-descending');
    expect(button.attributes('aria-label')).toBe('filter_menu.sort_descending');
    await button.trigger('click');
    expect(wrapper.emitted('toggle-direction')).toHaveLength(1);
  });
});
describe('PreferenceSwitch', () => {
  it('passes the disabled state to the switch and dims the row', () => {
    const wrapper = mount(PreferenceSwitch, {
      props: { label: 'Kappa only', description: 'Why', disabled: true, modelValue: false },
      global: { stubs },
    });
    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    expect(wrapper.get('label').classes()).toContain('cursor-not-allowed');
    expect(wrapper.text()).toContain('Why');
  });
});
