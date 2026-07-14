// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { SupporterTier } from '@/features/supporter/supporterTypes';
const activeTier = ref<'supporter' | 'scav' | 'timmy' | 'chad' | null>('scav');
const composableError = ref<string | null>(null);
const isActiveSubscriber = ref(true);
const mockCreateCheckout = vi.fn();
const mockOpenBillingPortal = vi.fn();
vi.mock('@/composables/useSupporter', () => ({
  useSupporter: () => ({
    activeTier,
    createCheckout: mockCreateCheckout,
    error: composableError,
    isActiveSubscriber,
    openBillingPortal: mockOpenBillingPortal,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en-US'),
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    },
  },
}));
const tier: SupporterTier = { id: 'chad', baseMonthly: 10 };
describe('SupporterTierCard', () => {
  beforeEach(() => {
    activeTier.value = 'scav';
    composableError.value = null;
    isActiveSubscriber.value = true;
    mockCreateCheckout.mockReset();
    mockOpenBillingPortal.mockReset().mockResolvedValue(null);
  });
  it('uses Customer Portal instead of Checkout when an active subscriber changes tiers', async () => {
    const { default: SupporterTierCard } =
      await import('@/features/supporter/SupporterTierCard.vue');
    const wrapper = mount(SupporterTierCard, {
      props: { interval: 'monthly', tier },
      global: {
        stubs: {
          UAlert: true,
          UButton: {
            emits: ['click'],
            props: ['color', 'disabled', 'icon', 'loading', 'size', 'to', 'variant'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
          },
          UIcon: true,
        },
      },
    });
    await flushPromises();
    const button = wrapper.get('button');
    expect(button.text()).toContain('Change plan in billing portal');
    await button.trigger('click');
    await flushPromises();
    expect(mockOpenBillingPortal).toHaveBeenCalledTimes(1);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
