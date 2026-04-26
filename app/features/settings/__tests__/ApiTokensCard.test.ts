// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiTokensCard from '@/features/settings/ApiTokensCard.vue';
const mockState = {
  isLoggedIn: false,
};
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: {
      get loggedIn() {
        return mockState.isLoggedIn;
      },
    },
  },
}));
describe('ApiTokensCard', () => {
  beforeEach(() => {
    mockState.isLoggedIn = false;
    vi.clearAllMocks();
  });
  const createWrapper = () =>
    mount(ApiTokensCard, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          ApiTokens: { template: '<div data-testid="api-tokens" />' },
          GenericCard: {
            template: '<section><slot name="content" /></section>',
          },
          UAlert: {
            props: ['title'],
            template: '<div data-testid="login-warning">{{ title }}</div>',
          },
        },
      },
    });
  it('shows api tokens when logged in', () => {
    mockState.isLoggedIn = true;
    const wrapper = createWrapper();
    expect(wrapper.find('[data-testid="api-tokens"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-warning"]').exists()).toBe(false);
  });
  it('shows the login warning when logged out', () => {
    const wrapper = createWrapper();
    expect(wrapper.find('[data-testid="api-tokens"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-warning"]').text()).toBe(
      'page.settings.card.apitokens.not_logged_in'
    );
  });
});
