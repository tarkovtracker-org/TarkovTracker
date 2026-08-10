import { mountSuspended } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import DashboardMigrationBanner from '@/features/dashboard/DashboardMigrationBanner.vue';
import { usePreferencesStore } from '@/stores/usePreferences';
describe('DashboardMigrationBanner', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('links to the canonical guide and persists dismissal through the preferences store', async () => {
    const wrapper = await mountSuspended(DashboardMigrationBanner, {
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
    const preferences = usePreferencesStore();
    expect(wrapper.find('[data-to="/resources/tarkovtracker_org_vs_io"]').exists()).toBe(true);
    await wrapper.findAll('button')[1]!.trigger('click');
    expect(preferences.dashboardNoticeDismissed).toBe(true);
    expect(wrapper.find('[data-testid="dashboard-migration-banner"]').exists()).toBe(false);
  });
});
