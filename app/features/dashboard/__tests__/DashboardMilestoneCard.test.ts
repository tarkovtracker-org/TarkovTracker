import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'page.dashboard.progress_card.progress_label') {
        return `${params?.label ?? ''} progress`;
      }
      return key;
    },
  }),
}));
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
    expect(wrapper.find('[role="img"]').attributes('aria-label')).toBe('25% progress');
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
  it('falls back to a 0 degree ring for non-finite progress values', async () => {
    const wrapper = await mountWithProps({ progressValue: Number.NaN });
    const ring = wrapper.find('[style*="conic-gradient"]');
    expect(ring.exists()).toBe(true);
    expect(ring.attributes('style')).toContain('0deg 0deg');
  });
  it('does not dim the entire card when a milestone is still in progress', async () => {
    const wrapper = await mountWithProps({ progressValue: 25 });
    expect(wrapper.classes()).not.toContain('opacity-65');
  });
});
