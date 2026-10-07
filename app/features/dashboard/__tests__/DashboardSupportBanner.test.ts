// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { STORAGE_KEYS } from '@/utils/storageKeys';
const { supporter, loadedUserId, trackEvent } = vi.hoisted(() => ({
  supporter: { value: null as unknown },
  loadedUserId: { value: 'user-1' as string | null },
  trackEvent: vi.fn(),
}));
vi.mock('@/composables/useSupporter', () => ({
  useSupporter: () => ({ supporter: ref(supporter.value), loadedUserId: ref(loadedUserId.value) }),
}));
vi.mock('@/composables/useAnalyticsEvents', () => ({ useAnalyticsEvents: () => ({ trackEvent }) }));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: { id: 'user-1', loggedIn: true, createdAt: '2020-01-01T00:00:00Z' },
  },
}));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
const mountBanner = async () => {
  const { default: Banner } = await import('@/features/dashboard/DashboardSupportBanner.vue');
  return mount(Banner, {
    props: { completedTasks: 0 },
    global: {
      stubs: {
        UButton: {
          props: ['to', 'ariaLabel'],
          template:
            '<button :data-to="to" :aria-label="ariaLabel" @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
      },
    },
  });
};
afterEach(() => {
  localStorage.clear();
  supporter.value = null;
  trackEvent.mockReset();
});
describe('DashboardSupportBanner', () => {
  it('links to the supporter page and remembers dismissal', async () => {
    const wrapper = await mountBanner();
    expect(wrapper.text()).toContain('page.dashboard.support_banner.new_title');
    await wrapper.find('[data-to="/supporter"]').trigger('click');
    expect(trackEvent).toHaveBeenCalledWith('support_banner_click', { variant: 'new' });
    await wrapper.find('[aria-label="common.close"]').trigger('click');
    expect(trackEvent).toHaveBeenCalledWith('support_banner_dismiss', { variant: 'new' });
    expect(localStorage.getItem(STORAGE_KEYS.supportBannerDismissedAt)).toBeTruthy();
    expect(wrapper.find('[data-testid="dashboard-support-banner"]').exists()).toBe(false);
  });
  it('stays hidden for active supporters', async () => {
    supporter.value = { status: 'active', expiresAt: null, hasEverSupported: true };
    const wrapper = await mountBanner();
    expect(wrapper.find('[data-testid="dashboard-support-banner"]').exists()).toBe(false);
  });
});
