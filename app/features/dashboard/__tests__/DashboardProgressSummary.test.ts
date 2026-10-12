import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import DashboardProgressSummary from '@/features/dashboard/DashboardProgressSummary.vue';
const filtersActive = ref(false);
const completed = ref(25);
vi.mock('@/composables/useDashboardFilters', () => ({
  useDashboardFilters: () => ({ hasDashboardFiltersActive: computed(() => filtersActive.value) }),
}));
mockNuxtImport('useDashboardStats', () => () => ({
  completedTasks: completed,
  totalTasks: ref(100),
  completedKappaTasks: ref(12),
  totalKappaTasks: ref(200),
  completedHideoutItems: ref(199),
  totalHideoutItems: ref(200),
}));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
const mountSummary = () =>
  mount(DashboardProgressSummary, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AppTooltip: { template: '<span><slot /></span>' },
        NuxtLink: {
          props: ['to'],
          template: '<a data-testid="profile-link" :data-to="to"><slot /></a>',
        },
        UIcon: true,
      },
    },
  });
describe('DashboardProgressSummary', () => {
  it('shows compact task, Kappa, and hideout progress', () => {
    const wrapper = mountSummary();
    expect(wrapper.get('[data-testid="summary-tasks"]').text()).toBe('25%');
    expect(wrapper.get('[data-testid="summary-kappa"]').text()).toBe('12/200');
    expect(wrapper.get('[data-testid="summary-hideout"]').text()).toBe('99%');
  });
  it('floors percentages without float drift (29/100 is 29%)', () => {
    completed.value = 29;
    expect(mountSummary().get('[data-testid="summary-tasks"]').text()).toBe('29%');
    completed.value = 25;
  });
  it('points to the profile for the full breakdown', () => {
    const link = mountSummary().get('[data-testid="profile-link"]');
    expect(link.attributes('data-to')).toBe('/profile');
    expect(link.text()).toContain('page.dashboard.progress.view_full_progress');
  });
  it('flags filtered stats only while dashboard filters are active', async () => {
    filtersActive.value = false;
    const wrapper = mountSummary();
    expect(wrapper.find('[data-testid="dashboard-filter-notice"]').exists()).toBe(false);
    filtersActive.value = true;
    await nextTick();
    expect(wrapper.find('[data-testid="dashboard-filter-notice"]').exists()).toBe(true);
  });
});
