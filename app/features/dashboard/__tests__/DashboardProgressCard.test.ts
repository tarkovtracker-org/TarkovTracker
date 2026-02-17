import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import type { ProgressCardColor } from '@/features/dashboard/progressCard';
vi.mock('@/utils/formatters', () => ({
  useLocaleNumberFormatter: () => (value: number) => value.toLocaleString('en-US'),
}));
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      page: {
        dashboard: {
          progress_card: {
            view_details: 'View details for {label}',
            progress_label: '{label} progress',
          },
        },
      },
    },
    de: {},
    es: {},
    fr: {},
    ru: {},
    uk: {},
    zh: {},
  },
});
const colorVariants: Array<{ color: ProgressCardColor; barClass: string }> = [
  { color: 'primary', barClass: 'bg-primary-500/60' },
  { color: 'neutral', barClass: 'bg-surface-400/60' },
  { color: 'info', barClass: 'bg-info-500/60' },
  { color: 'success', barClass: 'bg-success-500/60' },
  { color: 'kappa', barClass: 'bg-kappa-500/60' },
  { color: 'lightkeeper', barClass: 'bg-lightkeeper-500/60' },
];
const setup = async () => {
  vi.resetModules();
  const { default: DashboardProgressCard } =
    await import('@/features/dashboard/DashboardProgressCard.vue');
  return DashboardProgressCard;
};
interface MountProps {
  icon?: string;
  label?: string;
  completed?: number;
  total?: number;
  percentage?: number;
  color?: ProgressCardColor;
}
const mountWithProps = async (props: MountProps = {}) => {
  const DashboardProgressCard = await setup();
  const defaultProps = {
    icon: 'i-mdi-check',
    label: 'Tasks',
    completed: 5,
    total: 10,
    percentage: 50,
    color: 'primary',
  } satisfies MountProps;
  return mount(DashboardProgressCard, {
    props: { ...defaultProps, ...props },
    global: {
      plugins: [i18n],
      stubs: {
        UIcon: true,
      },
    },
  });
};
describe('DashboardProgressCard', () => {
  it.each(colorVariants)('renders color $color variant', async ({ color, barClass }) => {
    const wrapper = await mountWithProps({ color });
    expect(wrapper.text()).toContain('Tasks');
    const progressbar = wrapper.get('[role="progressbar"]');
    expect(progressbar.classes()).toContain(barClass);
  });
  it('renders progress values and emits click', async () => {
    const wrapper = await mountWithProps();
    expect(wrapper.text()).toContain('Tasks');
    expect(wrapper.text()).toContain('5/10');
    const progressbar = wrapper.find('[role="progressbar"]');
    expect(progressbar.attributes('aria-valuenow')).toBe('50');
    expect(progressbar.attributes('aria-valuemin')).toBe('0');
    expect(progressbar.attributes('aria-valuemax')).toBe('100');
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });
  it('formats large counts with locale separators', async () => {
    const completed = 75007;
    const total = 15648395;
    const wrapper = await mountWithProps({ completed, total });
    expect(wrapper.text()).toContain(
      `${completed.toLocaleString('en-US')}/${total.toLocaleString('en-US')}`
    );
  });
  it('renders aria-valuenow as 0 when percentage is 0', async () => {
    const wrapper = await mountWithProps({ completed: 0, total: 10, percentage: 0 });
    const progressbar = wrapper.find('[role="progressbar"]');
    expect(progressbar.attributes('aria-valuenow')).toBe('0');
    expect(progressbar.attributes('aria-valuemin')).toBe('0');
    expect(progressbar.attributes('aria-valuemax')).toBe('100');
  });
  it('renders aria-valuenow as 100 when percentage is 100', async () => {
    const wrapper = await mountWithProps({ completed: 10, total: 10, percentage: 100 });
    const progressbar = wrapper.find('[role="progressbar"]');
    expect(progressbar.attributes('aria-valuenow')).toBe('100');
    expect(progressbar.attributes('aria-valuemin')).toBe('0');
    expect(progressbar.attributes('aria-valuemax')).toBe('100');
  });
});
