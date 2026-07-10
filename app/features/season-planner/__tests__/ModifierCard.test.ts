// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ModifierCard from '@/features/season-planner/ModifierCard.vue';
import type { PersonalModifier } from '@/types/season';
const mockModifier: PersonalModifier = {
  id: 'marathon_runner',
  name: 'Marathon Runner',
  type: 'positive',
  points: -3,
  description: 'Arm and leg stamina is consumed 15% slower.',
};
describe('ModifierCard', () => {
  it('renders modifier details correctly', () => {
    const wrapper = mount(ModifierCard, {
      props: {
        modifier: mockModifier,
        selected: false,
      },
    });
    expect(wrapper.text()).toContain('Marathon Runner');
    expect(wrapper.text()).toContain('Arm and leg stamina is consumed 15% slower.');
    expect(wrapper.text()).toContain('-3');
  });
  it('prefixes positive points with +', () => {
    const positiveMod: PersonalModifier = {
      ...mockModifier,
      type: 'negative',
      points: 4,
    };
    const wrapper = mount(ModifierCard, {
      props: {
        modifier: positiveMod,
        selected: false,
      },
    });
    expect(wrapper.text()).toContain('+4');
  });
  it('applies correct classes and accessibility attributes when selected', () => {
    const wrapper = mount(ModifierCard, {
      props: {
        modifier: mockModifier,
        selected: true,
      },
    });
    const button = wrapper.find('button');
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.classes()).toContain('bg-primary-500/10');
    expect(wrapper.find('.absolute.top-2.right-2').exists()).toBe(true); // dot indicator
  });
  it('applies default classes and accessibility attributes when not selected', () => {
    const wrapper = mount(ModifierCard, {
      props: {
        modifier: mockModifier,
        selected: false,
      },
    });
    const button = wrapper.find('button');
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(button.classes()).toContain('bg-surface-800/40');
    expect(wrapper.find('.absolute.top-2.right-2').exists()).toBe(false);
  });
  it('emits toggle event when clicked', async () => {
    const wrapper = mount(ModifierCard, {
      props: {
        modifier: mockModifier,
        selected: false,
      },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('toggle')).toHaveLength(1);
  });
});
