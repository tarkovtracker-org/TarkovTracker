// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
const { seoMeta } = vi.hoisted(() => ({ seoMeta: vi.fn() }));
mockNuxtImport('useSeoMeta', () => seoMeta);
vi.mock('@/features/credits/creditSections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/credits/creditSections')>();
  return {
    ...actual,
    staticCreditSections: [
      {
        key: 'original_creator',
        members: [{ name: 'Thaddeus' }],
        fullWidth: true,
      },
      {
        key: 'beta_testers',
        members: [{ name: 'Adealia' }],
        fullWidth: false,
        compact: true,
      },
    ],
  };
});
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
    const sections = wrapper.findAll('section');
    expect(sections).toHaveLength(2);
    expect(sections[0]?.classes()).toContain('md:col-span-2');
    expect(sections[1]?.classes()).not.toContain('md:col-span-2');
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
    expect(metadata.ogUrl).toBeUndefined();
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
