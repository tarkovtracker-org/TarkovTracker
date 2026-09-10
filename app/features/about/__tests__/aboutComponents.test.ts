// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AboutMemberCard from '@/features/about/AboutMemberCard.vue';
import AboutMembersGroup from '@/features/about/AboutMembersGroup.vue';
import type { TeamMember } from '@/features/about/teamMembers';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const member: TeamMember = {
  id: 'maintainer',
  displayName: 'Maintainer',
  group: 'core',
  roleKey: 'page.about.roles.core_owner',
  githubUsername: 'maintainer',
};
const global = {
  stubs: {
    NuxtImg: { props: ['src', 'alt'], template: '<img :src="src" :alt="alt" />' },
    UIcon: { template: '<i />' },
  },
};
describe('about member presentation', () => {
  it('shows a decorative avatar and safe profile link, falling back after an image error', async () => {
    const wrapper = mount(AboutMemberCard, { props: { member }, global });
    expect(wrapper.get('img').attributes()).toMatchObject({
      src: 'https://github.com/maintainer.png?size=96',
      alt: '',
      loading: 'lazy',
    });
    expect(wrapper.get('a').attributes()).toMatchObject({
      href: 'https://github.com/maintainer',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(wrapper.text()).toContain(member.roleKey);
    expect(wrapper.get('span.border').classes()).toContain('text-primary-300');
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('span[aria-hidden="true"]').text()).toBe('M');
  });
  it('shows an unlinked monogram for support members without verified profiles', () => {
    const wrapper = mount(AboutMemberCard, {
      props: {
        member: {
          id: 'support',
          displayName: 'Support',
          group: 'support',
          roleKey: 'page.about.roles.discord_support',
        },
      },
      global,
    });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.get('span[aria-hidden="true"]').text()).toBe('S');
    expect(wrapper.get('span.border').classes()).toContain('text-surface-300');
  });
  it('renders partner project links with their localized label', () => {
    const wrapper = mount(AboutMemberCard, {
      props: {
        member: {
          id: 'partner',
          displayName: 'Partner',
          group: 'partner',
          roleKey: 'page.about.roles.tarkov_dev_maintainer',
          projectUrl: 'https://tarkov.dev/',
          projectLabelKey: 'page.about.projects.tarkov_dev',
        },
      },
      global,
    });
    expect(wrapper.get('a').attributes('href')).toBe('https://tarkov.dev/');
    expect(wrapper.get('a').text()).toContain('page.about.projects.tarkov_dev');
  });
  it('hides empty groups and reacts when members are added or removed', async () => {
    const wrapper = mount(AboutMembersGroup, {
      props: { labelKey: 'page.about.team.core_heading', members: [] },
      global,
    });
    expect(wrapper.find('h3').exists()).toBe(false);
    expect(wrapper.find('ul').exists()).toBe(false);
    await wrapper.setProps({ members: [member] });
    expect(wrapper.get('h3').text()).toBe('page.about.team.core_heading');
    expect(wrapper.findAll('li')).toHaveLength(1);
    expect(wrapper.text()).toContain('Maintainer');
    await wrapper.setProps({ members: [] });
    expect(wrapper.find('div').exists()).toBe(false);
  });
});
