// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import NeededItemGroupedInputControls from '@/features/neededitems/NeededItemGroupedInputControls.vue';
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }));
const mountControls = (props = {}) =>
  mount(NeededItemGroupedInputControls, {
    attachTo: document.body,
    props: { firNeeded: 3, firCurrent: 1, nonFirNeeded: 2, nonFirCurrent: 2, ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { UIcon: { template: '<i />' } },
    },
  });
const button = (wrapper: ReturnType<typeof mountControls>, label: string) =>
  wrapper.get(`button[aria-label="needed_items.aria.${label}"]`);
describe('NeededItemGroupedInputControls', () => {
  it('renders a row per needed source and hides sources with nothing needed', async () => {
    const wrapper = mountControls();
    expect(wrapper.text()).toContain('common.fir');
    expect(wrapper.text()).toContain('needed_items.non_fir');
    await wrapper.setProps({ nonFirNeeded: 0 });
    expect(wrapper.text()).not.toContain('needed_items.non_fir');
  });
  it('steps each source independently and disables steppers at the limits', async () => {
    const wrapper = mountControls();
    await button(wrapper, 'increase_fir').trigger('click');
    await button(wrapper, 'decrease_non_fir').trigger('click');
    expect(wrapper.emitted('update:fir')).toEqual([[2]]);
    expect(wrapper.emitted('update:nonFir')).toEqual([[1]]);
    expect(button(wrapper, 'increase_non_fir').attributes('disabled')).toBeDefined();
    expect(button(wrapper, 'decrease_fir').attributes('disabled')).toBeUndefined();
  });
  it('focuses the clicked source input and commits the typed value', async () => {
    const wrapper = mountControls();
    const valueButtons = wrapper.findAll('button:not([aria-label])');
    await valueButtons[1]!.trigger('click');
    await nextTick();
    const input = wrapper.get('input');
    expect(document.activeElement).toBe(input.element);
    await input.setValue(0);
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:nonFir')).toEqual([[0]]);
    expect(wrapper.emitted('update:fir')).toBeUndefined();
    wrapper.unmount();
  });
});
