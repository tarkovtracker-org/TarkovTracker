// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { SupporterStatus } from '@/composables/useSupporter';
const supporterRef = ref<SupporterStatus | null>(null);
const composableErrorRef = ref<string | null>(null);
const mockOpenBillingPortal = vi.fn();
vi.mock('@/composables/useSupporter', () => ({
  useSupporter: () => ({
    error: composableErrorRef,
    openBillingPortal: mockOpenBillingPortal,
    supporter: supporterRef,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) => {
      if (typeof paramsOrFallback === 'string') {
        return paramsOrFallback;
      }
      if (paramsOrFallback && typeof paramsOrFallback === 'object') {
        const templates: Record<string, string> = {
          'page.supporter.status_summary_renews': 'Renews on {date}.',
          'page.supporter.status_summary_cancelled_until': 'Access until {date}.',
          'page.supporter.status_summary_one_time_until': 'Perks until {date}.',
        };
        const template = templates[key] ?? key;
        return Object.entries(paramsOrFallback).reduce(
          (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
          template
        );
      }
      return key;
    },
    te: () => false,
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const mountBanner = async () => {
  const { default: SupporterStatusBanner } =
    await import('@/features/supporter/SupporterStatusBanner.vue');
  return mount(SupporterStatusBanner, {
    global: {
      stubs: {
        UAlert: { template: '<div data-testid="alert"><slot /></div>' },
        UButton: {
          props: ['loading', 'to'],
          emits: ['click'],
          template:
            '<button :data-to="to" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
      },
    },
  });
};
describe('SupporterStatusBanner', () => {
  beforeEach(() => {
    supporterRef.value = null;
    composableErrorRef.value = null;
    mockOpenBillingPortal.mockReset();
  });
  it('renders nothing when there is no supporter row', async () => {
    const wrapper = await mountBanner();
    expect(wrapper.find('section').exists()).toBe(false);
    wrapper.unmount();
  });
  it('renders an active subscription banner with manage action and renewal date', async () => {
    supporterRef.value = {
      expiresAt: '2030-01-15T00:00:00.000Z',
      hasEverSupported: true,
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'active',
      tier: 'chad',
      type: 'subscription',
    };
    const wrapper = await mountBanner();
    expect(wrapper.text()).toContain('Active subscription');
    expect(wrapper.text()).toContain('Chad');
    expect(wrapper.text()).toContain('Renews on');
    const manageBtn = wrapper.get('button');
    expect(manageBtn.text()).toContain('Manage subscription');
    wrapper.unmount();
  });
  it('opens the billing portal when manage is clicked', async () => {
    supporterRef.value = {
      expiresAt: null,
      hasEverSupported: true,
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'active',
      tier: 'timmy',
      type: 'subscription',
    };
    mockOpenBillingPortal.mockResolvedValue('https://billing.stripe.com/p/x');
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://app.test/supporter' } as Location,
      writable: true,
    });
    const wrapper = await mountBanner();
    await wrapper.get('button').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockOpenBillingPortal).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('https://billing.stripe.com/p/x');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
    wrapper.unmount();
  });
  it('shows the inactive summary and manage action for cancelled subscriptions', async () => {
    supporterRef.value = {
      expiresAt: '2030-01-15T00:00:00.000Z',
      hasEverSupported: true,
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'cancelled',
      tier: 'scav',
      type: 'subscription',
    };
    const wrapper = await mountBanner();
    expect(wrapper.text()).toContain('Subscription cancelled');
    // Cancelled subscribers still have a stripe customer; portal access is
    // useful for downloading past invoices or resubscribing.
    expect(wrapper.find('button').text()).toContain('Manage subscription');
    wrapper.unmount();
  });
  it('renders the upgrade CTA for past supporters with no active status', async () => {
    supporterRef.value = {
      expiresAt: '2020-01-01T00:00:00.000Z',
      hasEverSupported: true,
      startedAt: '2019-01-01T00:00:00.000Z',
      status: 'expired',
      tier: 'supporter',
      type: 'one_time',
    };
    const wrapper = await mountBanner();
    expect(wrapper.text()).toContain('Subscription expired');
    const upgradeBtn = wrapper.get('button');
    expect(upgradeBtn.text()).toContain('Pick a tier');
    expect(upgradeBtn.attributes('data-to')).toBe('#tiers');
    wrapper.unmount();
  });
});
