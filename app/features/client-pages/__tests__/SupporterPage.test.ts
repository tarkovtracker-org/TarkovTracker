// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { fetchStatus, replace, add, query, user } = vi.hoisted(() => ({
  fetchStatus: vi.fn(),
  replace: vi.fn(),
  add: vi.fn(),
  query: { thanks: 'one_time', keep: 'value' } as Record<string, string>,
  user: { id: 'test-user' as string | null },
}));
vi.mock('@/composables/useSupporter', () => ({ useSupporter: () => ({ fetchStatus }) }));
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { user } }));
mockNuxtImport('useRoute', () => () => ({ query }));
mockNuxtImport('useRouter', () => () => ({ replace }));
mockNuxtImport('useToast', () => () => ({ add }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
afterEach(() => {
  vi.useRealTimers();
  user.id = 'test-user';
  query.thanks = 'one_time';
});
const mountPage = async () => {
  const { default: Page } = await import('@/features/client-pages/SupporterPage.client.vue');
  return mount(Page, {
    global: {
      stubs: {
        SupporterStatusBanner: true,
        SupporterBillingToggle: true,
        SupporterTierCard: true,
        SupporterOneTime: true,
        SupporterAltPayments: true,
      },
    },
  });
};
describe('supporter return flow', () => {
  it('cancels return polling when navigating away', async () => {
    vi.useFakeTimers();
    const wrapper = await mountPage();
    expect(fetchStatus).toHaveBeenCalledExactlyOnceWith('test-user');
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
  it('refreshes the current account once and polls only a still-authenticated account', async () => {
    vi.useFakeTimers();
    const wrapper = await mountPage();
    expect(fetchStatus).toHaveBeenCalledExactlyOnceWith('test-user');
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'page.supporter.thanks_one_time_title' })
    );
    expect(replace).toHaveBeenCalledExactlyOnceWith({ query: { keep: 'value' } });
    user.id = null;
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('leaves ordinary supporter visits free of return polling and notices', async () => {
    delete query.thanks;
    const wrapper = await mountPage();
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
