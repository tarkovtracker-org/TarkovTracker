// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
const { seoMeta, head } = vi.hoisted(() => ({ seoMeta: vi.fn(), head: vi.fn() }));
mockNuxtImport('useSeoMeta', () => seoMeta);
mockNuxtImport('useHead', () => head);
mockNuxtImport('useRuntimeConfig', () => () => ({
  public: { appUrl: 'https://tarkovtracker.org' },
}));
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
          NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
          UContainer: { template: '<main><slot /></main>' },
          UIcon: { template: '<i />' },
        },
      },
    });
    expect(wrapper.findAll('section')).toHaveLength(2);
    expect(wrapper.find('[data-testid="contributors"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('page.credits.sections.original_creator');
    expect(seoMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.any(Object),
        title: expect.any(Object),
      })
    );
    const metadata = seoMeta.mock.calls[0]?.[0];
    expect(metadata.title.value).toBe('common.credits');
    expect(metadata.description.value).toBe(
      'Meet the beta testers and open source contributors behind Tarkov Tracker.'
    );
    expect(metadata.ogUrl).toBe('https://tarkovtracker.org/credits');
    const headConfig = head.mock.calls[0]?.[0]();
    expect(headConfig.link).toEqual(
      expect.arrayContaining([{ rel: 'canonical', href: 'https://tarkovtracker.org/credits' }])
    );
  });
  it('links to the about page for the team directory', async () => {
    const { default: CreditsPage } = await import('@/pages/credits.vue');
    const wrapper = mount(CreditsPage, {
      global: {
        stubs: {
          ContributorsList: { template: '<div />' },
          CreditMemberList: { template: '<ul />' },
          NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
          UContainer: { template: '<main><slot /></main>' },
          UIcon: { template: '<i />' },
        },
      },
    });
    const aboutLink = wrapper.get('a[href="/about"]');
    expect(aboutLink.text()).toContain('page.credits.team_link');
  });
});
