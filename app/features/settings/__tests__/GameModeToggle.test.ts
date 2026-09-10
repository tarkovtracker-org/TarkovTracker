// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import GameModeToggle from '@/features/settings/GameModeToggle.vue';
import { GAME_MODES } from '@/utils/constants';
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
describe('GameModeToggle', () => {
  const UIconStub = {
    props: ['name'],
    template: '<i :data-icon-name="name" />',
  };
  it('renders all mode options and applies active/inactive classes', () => {
    const wrapper = mount(GameModeToggle, {
      props: {
        modelValue: GAME_MODES.PVP,
      },
      global: {
        stubs: { UIcon: UIconStub },
      },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(3);
    const pvpBtn = buttons[0]!;
    const pveBtn = buttons[1]!;
    const seasonalBtn = buttons[2]!;
    // PVP should be active
    expect(pvpBtn.attributes('aria-pressed')).toBe('true');
    expect(pvpBtn.classes()).toContain('bg-pvp-800');
    // PVE should be inactive
    expect(pveBtn.attributes('aria-pressed')).toBe('false');
    expect(pveBtn.classes()).toContain('text-pve-500');
    // Seasonal should be inactive
    expect(seasonalBtn.attributes('aria-pressed')).toBe('false');
    expect(seasonalBtn.classes()).toContain('text-warning-500');
  });
  it('emits update:modelValue when an enabled mode button is clicked', async () => {
    const wrapper = mount(GameModeToggle, {
      props: {
        modelValue: GAME_MODES.PVP,
      },
      global: {
        stubs: { UIcon: UIconStub },
      },
    });
    const buttons = wrapper.findAll('button');
    await buttons[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[GAME_MODES.PVE]]);
  });
  it('applies disabled styles and prevents emission when mode is disabled', async () => {
    const wrapper = mount(GameModeToggle, {
      props: {
        modelValue: GAME_MODES.PVP,
        disabledModes: [GAME_MODES.SEASONAL],
      },
      global: {
        stubs: { UIcon: UIconStub },
      },
    });
    const seasonalButton = wrapper.findAll('button')[2]!;
    expect(seasonalButton.attributes('disabled')).toBeDefined();
    expect(seasonalButton.classes()).toContain('cursor-not-allowed');
    expect(seasonalButton.classes()).toContain('light:text-surface-500');
    await seasonalButton.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
