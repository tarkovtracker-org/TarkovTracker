// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreditContributionCount from '@/features/credits/CreditContributionCount.vue';
import CreditMember from '@/features/credits/CreditMember.vue';
import CreditMemberList from '@/features/credits/CreditMemberList.vue';
import {
  creditMemberAvatarClasses,
  creditMemberAvatarSize,
  creditMemberClasses,
} from '@/features/credits/creditMemberStyles';
import { staticCreditSections } from '@/features/credits/creditSections';
const translation = vi.fn((key: string, params?: Record<string, unknown>, choice?: number) =>
  key === 'page.credits.contributors.contributions'
    ? `${params?.count} ${choice === 1 ? 'contribution' : 'contributions'}`
    : key
);
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: translation }),
}));
const global = {
  stubs: {
    NuxtImg: {
      props: ['src', 'alt', 'width', 'height'],
      template: '<img :src="src" :alt="alt" :width="width" :height="height" />',
    },
    UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  },
};
describe('credits member presentation', () => {
  beforeEach(() => translation.mockClear());
  it('renders singular and plural contribution labels for assistive technology', () => {
    const singular = mount(CreditContributionCount, { props: { count: 1 } });
    const plural = mount(CreditContributionCount, { props: { count: 4 } });
    expect(singular.text()).toContain('1 contribution');
    expect(plural.text()).toContain('4 contributions');
    expect(translation).toHaveBeenCalledWith(
      'page.credits.contributors.contributions',
      { count: 1 },
      1
    );
  });
  it('does not render a contribution count when it is absent', () => {
    expect(mount(CreditContributionCount).html()).toBe('<!--v-if-->');
  });
  it('renders linked row members with safe external-link attributes', () => {
    const wrapper = mount(CreditMember, {
      props: {
        member: {
          avatar: 'https://example.com/avatar.png',
          contributions: 2,
          link: 'https://example.com/profile',
          name: 'Contributor',
        },
        variant: 'row',
      },
      global,
    });
    const link = wrapper.get('a');
    expect(link.attributes()).toMatchObject({
      href: 'https://example.com/profile',
      rel: 'noopener noreferrer',
      target: '_blank',
    });
    expect(wrapper.get('img').attributes('alt')).toBe('');
    expect(wrapper.text()).toContain('common.opens_in_new_tab');
    expect(wrapper.get('[data-icon="i-mdi-open-in-new"]').attributes('data-icon')).toBe(
      'i-mdi-open-in-new'
    );
  });
  it('aligns an ordered rank inside the contributor row', () => {
    const wrapper = mount(CreditMember, {
      props: {
        member: {
          contributions: 20,
          link: 'https://example.com/profile',
          name: 'Contributor',
        },
        rank: 12,
        variant: 'grid',
      },
      global,
    });
    expect(wrapper.get('li').attributes('value')).toBe('12');
    const rank = wrapper.get('a > span');
    expect(rank.text()).toBe('12.');
    expect(rank.attributes('aria-hidden')).toBeUndefined();
    expect(rank.attributes('aria-label')).toBeUndefined();
    expect(wrapper.get('a').classes()).toContain('border-white/5');
  });
  it('renders unlinked grid members without an external-link icon', () => {
    const wrapper = mount(CreditMember, {
      props: { member: { name: 'Tester' }, variant: 'grid' },
      global,
    });
    expect(wrapper.get('div').attributes('title')).toBe('Tester');
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('[data-icon]').exists()).toBe(false);
  });
  it('selects ordered and unordered list semantics and variant classes', () => {
    const members = [{ name: 'One' }, { name: 'Two' }];
    const gridMembers = [members[0], { ...members[1], link: 'https://example.com/two' }];
    const ordered = mount(CreditMemberList, {
      props: { members, ordered: true, variant: 'grid' },
      global,
    });
    const unorderedGrid = mount(CreditMemberList, {
      props: { members: gridMembers, variant: 'grid' },
      global,
    });
    const unordered = mount(CreditMemberList, { props: { members }, global });
    expect(ordered.element.tagName).toBe('OL');
    expect(ordered.classes()).toContain('grid');
    expect(ordered.classes()).toContain('list-none');
    expect(ordered.classes()).toContain('gap-x-6');
    expect(ordered.classes()).toContain('gap-y-1');
    expect(ordered.classes()).not.toContain('gap-x-2');
    expect(unorderedGrid.classes()).toContain('gap-x-6');
    expect(unorderedGrid.classes()).toContain('gap-y-1');
    expect(unorderedGrid.classes()).not.toContain('gap-x-2');
    const unorderedGridItems = unorderedGrid.findAll('li');
    expect(unorderedGridItems.map((item) => item.get('a, div').element.tagName)).toEqual([
      'DIV',
      'A',
    ]);
    expect(
      unorderedGridItems.every((item) => item.get('a, div').classes().includes('border-white/5'))
    ).toBe(true);
    expect(ordered.findAll('li').map((item) => item.get('span').text())).toEqual(['1.', '2.']);
    expect(unordered.element.tagName).toBe('UL');
    expect(unordered.classes()).toContain('flex');
  });
  it('returns stable avatar dimensions and interactive classes', () => {
    expect(creditMemberAvatarSize('row')).toBe(36);
    expect(creditMemberAvatarSize('grid')).toBe(28);
    expect(creditMemberAvatarClasses('row')).toContain('h-9 w-9');
    expect(creditMemberAvatarClasses('grid')).toContain('h-7 w-7');
    expect(creditMemberClasses('row', true).join(' ')).toContain('hover:bg-white/10');
    expect(creditMemberClasses('grid', false).join(' ')).not.toContain('hover:');
    expect(creditMemberClasses('grid', false).join(' ')).not.toContain('focus-visible:');
    expect(creditMemberClasses('grid', false).join(' ')).toContain('min-h-10');
    expect(creditMemberClasses('grid', true).join(' ')).toContain('bg-white/[0.02]');
    expect(creditMemberClasses('grid', false).join(' ')).toContain('bg-white/[0.02]');
    expect(creditMemberClasses('grid', false).join(' ')).toContain('border-white/5');
    expect(creditMemberClasses('row', false).join(' ')).not.toContain('border-white/5');
  });
  it('keeps the static credit groups ordered and uniquely keyed', () => {
    expect(staticCreditSections.map((section) => section.key)).toEqual([
      'original_creator',
      'staff',
      'support_members',
      'beta_testers',
    ]);
    expect(new Set(staticCreditSections.map((section) => section.key)).size).toBe(
      staticCreditSections.length
    );
    expect(staticCreditSections.every((section) => section.members.length > 0)).toBe(true);
  });
});
