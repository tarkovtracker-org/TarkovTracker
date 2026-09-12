// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DashboardMilestoneCard from '@/features/dashboard/DashboardMilestoneCard.vue';
describe('DashboardMilestoneCard', () => {
  const UIconStub = {
    props: ['name'],
    template: '<i :data-icon-name="name" />',
  };
  it('renders unachieved milestone card with light theme border and background', () => {
    const wrapper = mount(DashboardMilestoneCard, {
      props: {
        title: 'Level 15',
        subtitle: 'Flea Market',
        isAchieved: false,
        color: 'primary',
        achievedIcon: 'i-mdi-check',
        unachievedIcon: 'i-mdi-lock',
      },
      global: {
        stubs: { UIcon: UIconStub },
      },
    });
    expect(wrapper.text()).toContain('Level 15');
    expect(wrapper.text()).toContain('Flea Market');
    const container = wrapper.find('div');
    expect(container.classes()).toContain('light:bg-surface-850/80');
    expect(container.classes()).toContain('light:border-surface-600/60');
  });
  it('renders achieved milestone card with light theme gradient', () => {
    const wrapper = mount(DashboardMilestoneCard, {
      props: {
        title: 'Level 42',
        subtitle: 'Max Traders',
        isAchieved: true,
        color: 'success',
        achievedIcon: 'i-mdi-check',
        unachievedIcon: 'i-mdi-lock',
      },
      global: {
        stubs: { UIcon: UIconStub },
      },
    });
    expect(wrapper.text()).toContain('Level 42');
    const container = wrapper.find('div');
    expect(container.classes()).toContain('light:from-success-100/70');
    expect(container.classes()).toContain('light:to-surface-850');
  });
});
