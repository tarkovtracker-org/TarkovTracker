// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { openPreferences, runtimeConfig } = vi.hoisted(() => ({
  openPreferences: vi.fn(),
  runtimeConfig: {
    public: {
      appUrl: 'https://tarkovtracker.org',
      appVersion: '1.2.3',
      googleAnalyticsMeasurementId: 'G-TEST',
      microsoftClarityProjectId: '',
    },
  },
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
mockNuxtImport('useAnalyticsConsent', () => () => ({ openPreferences }));
vi.mock('@/utils/runtimeConfig', () => ({
  shouldEnableAnalyticsIntegrations: () => true,
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const mountFooter = async () => {
  const { default: AppFooter } = await import('@/shell/AppFooter.vue');
  return mount(AppFooter, {
    global: {
      stubs: {
        AppFooterColumn: {
          props: ['title', 'items'],
          template:
            '<section :data-title="title"><button v-for="item in items" :key="item.label" @click="item.onClick?.()">{{ item.label }}</button></section>',
        },
        NuxtImg: true,
        NuxtLink: { template: '<a><slot /></a>' },
      },
    },
  });
};
describe('AppFooter', () => {
  beforeEach(() => openPreferences.mockReset());
  it('renders the navigation groups, version, and analytics preferences action', async () => {
    const wrapper = await mountFooter();
    expect(wrapper.text()).toContain('navigation_drawer.brand_name');
    expect(wrapper.text()).toContain('v1.2.3');
    expect(wrapper.findAll('section')).toHaveLength(3);
    const analyticsButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'footer.analytics_preferences');
    expect(analyticsButton).toBeDefined();
    await analyticsButton?.trigger('click');
    expect(openPreferences).toHaveBeenCalledOnce();
  });
});
