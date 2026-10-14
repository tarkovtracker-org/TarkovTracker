import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import HideoutSettingsDrawer from '@/features/hideout/HideoutSettingsDrawer.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const stubs = {
  SettingsDrawer: { template: '<aside><slot /></aside>' },
  USwitch: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', !modelValue)" />',
  },
};
const baseProps = {
  collapseCompleted: false,
  requireSkillLevels: true,
  requireStationLevels: false,
  requireTraderLoyalty: false,
  sortReadyFirst: false,
};
describe('HideoutSettingsDrawer', () => {
  it('emits each setting through its own update event', async () => {
    const wrapper = mount(HideoutSettingsDrawer, { props: baseProps, global: { stubs } });
    await wrapper.get('[data-testid="hideout-setting-skill_levels"] input').trigger('change');
    await wrapper.get('[data-testid="hideout-setting-sort_ready_first"] input').trigger('change');
    expect(wrapper.emitted('update:requireSkillLevels')).toEqual([[false]]);
    expect(wrapper.emitted('update:sortReadyFirst')).toEqual([[true]]);
    expect(wrapper.emitted('update:collapseCompleted')).toBeUndefined();
  });
  it('locks every switch while the help tour points at the drawer', async () => {
    const wrapper = mount(HideoutSettingsDrawer, {
      props: { ...baseProps, isHelpTourActive: true },
      global: { stubs },
    });
    const switches = wrapper.findAll('input');
    expect(switches).toHaveLength(5);
    expect(switches.every((input) => input.attributes('disabled') !== undefined)).toBe(true);
    await wrapper.setProps({ isHelpTourActive: false });
    expect(wrapper.findAll('input[disabled]')).toHaveLength(0);
  });
});
