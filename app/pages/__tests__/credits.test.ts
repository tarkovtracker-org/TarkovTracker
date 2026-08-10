// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
const { seoMeta } = vi.hoisted(() => ({ seoMeta: vi.fn() }));
mockNuxtImport('useSeoMeta', () => seoMeta);
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
describe('credits page', () => {
  it('renders every static section and configures localized metadata', async () => {
    const { default: CreditsPage } = await import('@/pages/credits.vue');
    const wrapper = mount(CreditsPage, {
      global: {
        stubs: {
          ContributorsList: { template: '<div data-testid="contributors" />' },
          CreditMemberList: {
            props: ['members'],
            template:
              '<ul><li v-for="member in members" :key="member.name">{{ member.name }}</li></ul>',
          },
          UContainer: { template: '<main><slot /></main>' },
        },
      },
    });
    expect(wrapper.findAll('section')).toHaveLength(4);
    expect(wrapper.find('[data-testid="contributors"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('page.credits.sections.original_creator');
    expect(seoMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.any(Object),
        title: expect.any(Object),
      })
    );
  });
});
