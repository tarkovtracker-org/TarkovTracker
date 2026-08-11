// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsConsentState } from '@/composables/useAnalyticsConsent';
const { accept, closePreferences, decline, runtimeConfig } = vi.hoisted(() => ({
  accept: vi.fn(),
  closePreferences: vi.fn(),
  decline: vi.fn(),
  runtimeConfig: {
    public: {
      appUrl: 'https://tarkovtracker.org',
      googleAnalyticsMeasurementId: 'G-TEST',
      microsoftClarityProjectId: '',
    },
  },
}));
const state = ref<AnalyticsConsentState>({ status: 'unknown', updatedAt: null });
const isPromptOpen = ref(true);
const hasAnswered = computed(() => state.value.status !== 'unknown');
const isAccepted = computed(() => state.value.status === 'accepted');
const translations: Record<string, string> = {
  'analytics_consent.accepted': 'Analytics accepted',
  'analytics_consent.allow': 'Help us improve',
  'analytics_consent.decline': 'Keep analytics off',
  'analytics_consent.declined': 'Analytics declined',
  'analytics_consent.description': 'Analytics description',
  'analytics_consent.eyebrow': 'Analytics',
  'analytics_consent.status_disabled': 'Analytics Status: Disabled',
  'analytics_consent.status_enabled': 'Analytics Status: Enabled',
  'analytics_consent.title': 'Initial title',
  'analytics_consent.title_answered': 'Answered title',
};
mockNuxtImport('useAnalyticsConsent', () => () => ({
  accept,
  closePreferences,
  decline,
  hasAnswered,
  isAccepted,
  isPromptOpen,
  state,
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, fallback?: string) => translations[key] ?? fallback ?? key,
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
vi.mock('@/utils/runtimeConfig', () => ({
  shouldEnableAnalyticsIntegrations: () => true,
}));
const UBadgeStub = {
  inheritAttrs: false,
  props: ['color', 'size', 'variant'],
  template: '<span v-bind="$attrs" :data-color="color"><slot /></span>',
};
const UButtonStub = {
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};
const mountBanner = async () => {
  const { default: AnalyticsConsentBanner } =
    await import('@/components/analytics/AnalyticsConsentBanner.vue');
  return mount(AnalyticsConsentBanner, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        UBadge: UBadgeStub,
        UButton: UButtonStub,
        UCard: { template: '<section><slot /></section>' },
      },
    },
  });
};
describe('AnalyticsConsentBanner', () => {
  beforeEach(() => {
    state.value = { status: 'unknown', updatedAt: null };
    isPromptOpen.value = true;
    accept.mockReset();
    accept.mockImplementation(() => {
      state.value = { status: 'accepted', updatedAt: '2026-08-10T00:00:00.000Z' };
    });
    closePreferences.mockReset();
    decline.mockReset();
    decline.mockImplementation(() => {
      state.value = { status: 'declined', updatedAt: '2026-08-10T00:00:00.000Z' };
    });
  });
  it('shows the status beside the analytics eyebrow and updates for both choices', async () => {
    const wrapper = await mountBanner();
    const eyebrowRow = wrapper.get('[data-testid="analytics-consent-eyebrow-row"]');
    const getStatus = () => eyebrowRow.get('[data-testid="analytics-consent-status"]');
    expect(eyebrowRow.get('p').text()).toBe('Analytics');
    expect(wrapper.get('h2').text()).toBe('Initial title');
    expect(eyebrowRow.classes()).toEqual(expect.arrayContaining(['flex', 'items-center', 'gap-2']));
    expect(getStatus().text()).toBe('Analytics Status: Disabled');
    expect(getStatus().attributes('data-color')).toBe('neutral');
    const allowButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Help us improve');
    expect(allowButton).toBeDefined();
    await allowButton?.trigger('click');
    expect(getStatus().text()).toBe('Analytics Status: Enabled');
    expect(getStatus().attributes('data-color')).toBe('success');
    const declineButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Keep analytics off');
    expect(declineButton).toBeDefined();
    await declineButton?.trigger('click');
    expect(getStatus().text()).toBe('Analytics Status: Disabled');
    expect(getStatus().attributes('data-color')).toBe('neutral');
  });
});
