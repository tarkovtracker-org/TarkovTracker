// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
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
  vi.useRealTimers();
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
  it('shows the returning banner when supporter activity expires without another state change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    supporter.value = {
      status: 'past_due',
      expiresAt: '2026-10-07T12:00:01Z',
      hasEverSupported: true,
    };
    const wrapper = await mountBanner();
    expect(wrapper.find('[data-testid="dashboard-support-banner"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await nextTick();
    expect(wrapper.text()).toContain('page.dashboard.support_banner.returning_title');
    wrapper.unmount();
  });
  it('shows the banner when the dismissal window expires without another state change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    const dismissed = new Date(Date.now() - 45 * 86_400_000 + 1000).toISOString();
    localStorage.setItem(STORAGE_KEYS.supportBannerDismissedAt, dismissed);
    const wrapper = await mountBanner();
    expect(wrapper.find('[data-testid="dashboard-support-banner"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await nextTick();
    expect(wrapper.text()).toContain('page.dashboard.support_banner.new_title');
    wrapper.unmount();
  });
  it('stays hidden for active supporters', async () => {
    supporter.value = { status: 'active', expiresAt: null, hasEverSupported: true };
    const wrapper = await mountBanner();
    expect(wrapper.find('[data-testid="dashboard-support-banner"]').exists()).toBe(false);
  });
});
