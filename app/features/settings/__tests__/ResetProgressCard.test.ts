// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import ResetProgressCard from '@/features/settings/ResetProgressCard.vue';
mockNuxtImport('useRoute', () => () => ({
  path: '/settings',
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
describe('ResetProgressCard', () => {
  it('renders GenericCard with the reset title', async () => {
    const wrapper = await mountSuspended(ResetProgressCard, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          GenericCard: {
            props: ['icon', 'iconColor', 'highlightColor', 'fillHeight', 'title', 'titleClasses'],
            template:
              '<div class="generic-card"><span class="card-title">{{ title }}</span><slot name="content" /></div>',
          },
          ResetProgressSection: {
            template: '<div class="reset-section" />',
          },
          'i18n-t': {
            template: '<span><slot /></span>',
          },
        },
      },
    });
    expect(wrapper.find('.card-title').text()).toBe('settings.data_management.reset_title');
    expect(wrapper.find('.reset-section').exists()).toBe(true);
  });
});
