import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import DashboardProgressSummary from '@/features/dashboard/DashboardProgressSummary.vue';
const state = vi.hoisted(() => ({ filtersActive: false }));
vi.mock('@/composables/useDashboardFilters', () => ({
  useDashboardFilters: () => ({ hasDashboardFiltersActive: computed(() => state.filtersActive) }),
}));
mockNuxtImport('useDashboardStats', () => () => ({
  completedTasks: ref(25),
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
  it('points to the profile for the full breakdown', () => {
    const link = mountSummary().get('[data-testid="profile-link"]');
    expect(link.attributes('data-to')).toBe('/profile');
    expect(link.text()).toContain('page.dashboard.progress.view_full_progress');
  });
  it('flags filtered stats only while dashboard filters are active', () => {
    state.filtersActive = false;
    expect(mountSummary().find('[data-testid="dashboard-filter-notice"]').exists()).toBe(false);
    state.filtersActive = true;
    expect(mountSummary().find('[data-testid="dashboard-filter-notice"]').exists()).toBe(true);
  });
});
