// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { STORAGE_KEYS } from '@/utils/storageKeys';
const { items } = vi.hoisted(() => ({
  items: { value: [] as Array<{ date: string; label?: string; bullets: string[] }> },
}));
mockNuxtImport('useFetch', () => () => {
  const data = ref<unknown>(null);
  return {
    data,
    error: ref(null),
    refresh: vi.fn(async () => {
      data.value = { items: items.value };
    }),
  };
});
mockNuxtImport('useRuntimeConfig', () => () => ({ public: {} }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key, locale: ref('en') }));
const mountChangelog = async () => {
  const { default: Changelog } = await import('@/features/dashboard/DashboardChangelog.vue');
  const wrapper = mount(Changelog, {
    global: {
      stubs: {
        UPopover: {
          props: ['open'],
          emits: ['update:open'],
          template:
            '<div><div data-testid="trigger" @click="$emit(\'update:open\', !open)"><slot /></div><div v-if="open"><slot name="content" /></div></div>',
        },
        UButton: { template: '<button><slot /></button>' },
        NuxtLink: { props: ['to'], template: '<a :data-to="to"><slot /></a>' },
        UIcon: true,
      },
    },
  });
  await flushPromises();
  return wrapper;
};
afterEach(() => {
  localStorage.clear();
  items.value = [];
});
describe('DashboardChangelog', () => {
  it('flags unseen updates and clears the dot once opened', async () => {
    items.value = [
      { date: '2026-10-01', label: 'v1', bullets: ['Older'] },
      { date: '2026-10-18', label: 'v2', bullets: ['Newest'] },
    ];
    localStorage.setItem(STORAGE_KEYS.changelogLastSeen, '2026-10-01|seen');
    const wrapper = await mountChangelog();
    expect(wrapper.find('[data-testid="dashboard-changelog-unread"]').exists()).toBe(true);
    await wrapper.get('[data-testid="trigger"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Newest');
    expect(wrapper.find('[data-to="/changelog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dashboard-changelog-unread"]').exists()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.changelogLastSeen)).toMatch(/^2026-10-18\|/);
  });
  it('hides the dot once seen and shows it again for a same-day addition', async () => {
    items.value = [{ date: '2026-10-18', bullets: ['Newest'] }];
    const first = await mountChangelog();
    await first.get('[data-testid="trigger"]').trigger('click');
    await flushPromises();
    first.unmount();
    expect(
      (await mountChangelog()).find('[data-testid="dashboard-changelog-unread"]').exists()
    ).toBe(false);
    items.value = [{ date: '2026-10-18', bullets: ['Newest', 'Later the same day'] }];
    expect(
      (await mountChangelog()).find('[data-testid="dashboard-changelog-unread"]').exists()
    ).toBe(true);
  });
  it('shows the dot again when a second entry on the newest date changes', async () => {
    items.value = [
      { date: '2026-10-18', label: 'v2', bullets: ['Release'] },
      { date: '2026-10-18', bullets: ['First commit'] },
    ];
    const first = await mountChangelog();
    await first.get('[data-testid="trigger"]').trigger('click');
    await flushPromises();
    first.unmount();
    items.value = [
      { date: '2026-10-18', label: 'v2', bullets: ['Release'] },
      { date: '2026-10-18', bullets: ['First commit', 'Second commit'] },
    ];
    expect(
      (await mountChangelog()).find('[data-testid="dashboard-changelog-unread"]').exists()
    ).toBe(true);
  });
  it('does not flag an older entry when the feed falls back to stale data', async () => {
    items.value = [{ date: '2026-10-01', bullets: ['Older'] }];
    localStorage.setItem(STORAGE_KEYS.changelogLastSeen, '2026-10-18|seen');
    const wrapper = await mountChangelog();
    expect(wrapper.find('[data-testid="dashboard-changelog-unread"]').exists()).toBe(false);
  });
  it('limits the popover to the three most recent entries', async () => {
    items.value = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-0${i + 1}`,
      bullets: [`Entry ${i + 1}`],
    }));
    const wrapper = await mountChangelog();
    await wrapper.get('[data-testid="trigger"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Entry 7');
    expect(wrapper.text()).toContain('Entry 5');
    expect(wrapper.text()).not.toContain('Entry 4');
  });
});
