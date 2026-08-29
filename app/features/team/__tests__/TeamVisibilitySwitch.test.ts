import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TeamVisibilitySwitch from '@/features/team/TeamVisibilitySwitch.vue';
const mountSwitch = (props: { disabled?: boolean; label: string; modelValue: boolean }) => {
  return mount(TeamVisibilitySwitch, { props });
};
describe('TeamVisibilitySwitch', () => {
  it('exposes switch semantics and emits the next value', async () => {
    const wrapper = mountSwitch({ label: 'Show team tasks', modelValue: false });
    const button = wrapper.get('button');
    expect(button.attributes('role')).toBe('switch');
    expect(button.attributes('aria-label')).toBe('Show team tasks');
    expect(button.attributes('aria-checked')).toBe('false');
    expect(button.attributes('class')).toContain('min-h-11');
    await button.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    wrapper.unmount();
  });
  it('does not emit when disabled', async () => {
    const wrapper = mountSwitch({ disabled: true, label: 'Show team tasks', modelValue: false });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});
