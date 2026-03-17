import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
const setup = async () => {
  const { default: DashboardMilestoneCard } =
    await import('@/features/dashboard/DashboardMilestoneCard.vue');
  return DashboardMilestoneCard;
};
const mountWithProps = async (props = {}) => {
  const DashboardMilestoneCard = await setup();
  return mount(DashboardMilestoneCard, {
    props: {
      title: '25%',
      subtitle: 'Getting started',
      isAchieved: false,
      achievedIcon: 'i-mdi-check-circle',
      unachievedIcon: 'i-mdi-circle-outline',
      color: 'primary',
      ...props,
    },
    global: {
      stubs: {
        UIcon: true,
      },
    },
  });
};
describe('DashboardMilestoneCard', () => {
  it('renders a progress ring when progressValue is provided', async () => {
    const wrapper = await mountWithProps({ progressValue: 25 });
    const ring = wrapper.find('[style*="conic-gradient"]');
    expect(ring.exists()).toBe(true);
    expect(ring.attributes('style')).toContain('90deg');
  });
  it('renders the achieved icon instead of the progress ring when completed', async () => {
    const wrapper = await mountWithProps({ isAchieved: true, progressValue: 100 });
    expect(wrapper.find('[style*="conic-gradient"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'UIcon' }).exists()).toBe(true);
  });
  it('renders the icon fallback when progressValue is not provided', async () => {
    const wrapper = await mountWithProps({ progressValue: null });
    expect(wrapper.findComponent({ name: 'UIcon' }).exists()).toBe(true);
  });
});
