// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
const { hiddenGroups } = vi.hoisted(() => ({ hiddenGroups: new Set<string>() }));
vi.mock('@/features/about/teamMembers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/about/teamMembers')>();
  return {
    ...actual,
    membersByGroup: (group: Parameters<typeof actual.membersByGroup>[0]) =>
      hiddenGroups.has(group) ? [] : actual.membersByGroup(group),
  };
});
afterEach(() => hiddenGroups.clear());
const mountAbout = async () => {
  const { default: AboutPage } = await import('@/pages/about.vue');
  return mount(AboutPage, {
    global: {
      stubs: {
        AboutMemberCard: {
          props: ['member'],
          template:
            '<li data-testid="member-card" :data-group="member.group">{{ member.displayName }}</li>',
        },
        AboutMembersGroup: {
          props: ['labelKey', 'members'],
          template:
            '<div data-testid="member-group" :data-label="labelKey">' +
            '<span v-for="m in members" :key="m.id">{{ m.displayName }}</span></div>',
        },
        AboutHelpLinks: { template: '<div data-testid="help-links" />' },
        NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        UContainer: { template: '<main><slot /></main>' },
        UIcon: { template: '<i />' },
      },
    },
  });
};
describe('about page', () => {
  it.each([['core'], ['support'], ['core', 'support', 'partner']])(
    'omits empty roster sections for hidden groups %j',
    async (...groups) => {
      groups.forEach((group) => hiddenGroups.add(group));
      const wrapper = await mountAbout();
      expect(wrapper.find('section#team').exists()).toBe(
        !(hiddenGroups.has('core') && hiddenGroups.has('support'))
      );
      expect(wrapper.find('section#partners').exists()).toBe(!hiddenGroups.has('partner'));
      expect(wrapper.find('section#help').exists()).toBe(true);
    }
  );
  it('renders team, partners, and help sections with semantic headings', async () => {
    const wrapper = await mountAbout();
    expect(wrapper.get('h1').text()).toBe('page.about.title');
    expect(wrapper.get('section#team h2').text()).toBe('page.about.team.heading');
    expect(wrapper.get('section#partners h2').text()).toBe('page.about.partners.heading');
    expect(wrapper.get('section#help h2').text()).toBe('page.about.help.heading');
    const groups = wrapper.findAll('[data-testid="member-group"]');
    expect(groups.map((group) => group.attributes('data-label'))).toEqual([
      'page.about.team.core_heading',
      'page.about.team.support_heading',
    ]);
    expect(wrapper.text()).toContain('DysektAI');
    const partnerCards = wrapper
      .findAll('[data-testid="member-card"]')
      .filter((card) => card.attributes('data-group') === 'partner');
    expect(partnerCards.length).toBeGreaterThan(0);
    expect(wrapper.findAll('[data-testid="help-links"]')).toHaveLength(1);
  });
  it('leaves metadata ownership to the central route metadata', async () => {
    await mountAbout();
    expect(seoMeta).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
  });
});
