// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ResourceCard from '@/features/resources/ResourceCard.vue';
import type { Resource } from '@/features/resources/resourceData';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback || key,
  }),
}));
const mountCard = (resource: Resource, showCategoryBadge = false) =>
  mount(ResourceCard, {
    props: { resource, showCategoryBadge },
    global: {
      stubs: {
        NuxtImg: { props: ['alt', 'src'], template: '<img :alt="alt" :src="src" />' },
        UButton: {
          props: ['href', 'label', 'to', 'trailingIcon', 'ariaLabel'],
          template: '<a :href="href || to" :aria-label="ariaLabel">{{ label }}</a>',
        },
        UBadge: {
          template: '<span><slot /></span>',
        },
        UDropdownMenu: {
          props: ['items'],
          template:
            '<div data-testid="more-menu"><slot /><div v-for="group in items" :key="group.length"><a v-for="item in group" :key="item.label" :href="item.href || item.to">{{ item.label }}</a></div></div>',
        },
        UIcon: true,
      },
    },
  });
describe('ResourceCard', () => {
  it('renders a primary setup guide, one secondary link, and a more menu for extras', () => {
    const wrapper = mountCard({
      slug: 'ratscanner',
      logo: '/img/logos/ratscannerlogo.webp',
      category: 'companion_apps',
      hasGuide: true,
      guide: { steps: 1, tips: 1, faq: 1 },
      primaryAction: 'guide',
      keywords: ['scanner'],
      links: [
        { type: 'website', url: 'https://ratscanner.com' },
        { type: 'github', url: 'https://github.com/RatScanner/RatScanner' },
        { type: 'discord', url: 'https://discord.gg/VagecDrcsW' },
      ],
    });
    expect(wrapper.get('img').attributes()).toMatchObject({
      alt: 'ratscanner',
      src: '/img/logos/ratscannerlogo.webp',
    });
    expect(wrapper.text()).not.toContain('Desktop App');
    expect(wrapper.get('a[href="/resources/ratscanner"]').text()).toBe('Setup guide');
    expect(wrapper.get('a[href="https://ratscanner.com"]').text()).toBe('Open website');
    expect(wrapper.get('[data-testid="more-menu"]').text()).toContain('View source');
    expect(wrapper.get('[data-testid="more-menu"]').text()).toContain('Community support');
  });
  it('prioritizes API documentation and tucks tertiary links into More', () => {
    const wrapper = mountCard(
      {
        slug: 'tarkovdev',
        logo: '/img/logos/tarkovdevlogo.webp',
        category: 'data_and_apis',
        hasGuide: true,
        guide: { steps: 1, tips: 1, faq: 1 },
        primaryAction: 'api',
        keywords: ['api'],
        links: [
          { type: 'api', url: 'https://api.tarkov.dev/' },
          { type: 'website', url: 'https://tarkov.dev/' },
          { type: 'github', url: 'https://github.com/the-hideout' },
        ],
      },
      true
    );
    expect(wrapper.text()).toContain('Data Platform');
    expect(wrapper.get('a[href="https://api.tarkov.dev/"]').text()).toBe('API documentation');
    expect(wrapper.get('a[href="/resources/tarkovdev"]').text()).toBe('Read guide');
    expect(wrapper.get('[data-testid="more-menu"]').text()).toContain('Open website');
    expect(wrapper.get('[data-testid="more-menu"]').text()).toContain('View source');
  });
  it('renders the placeholder icon and external primary action when configured', () => {
    const wrapper = mountCard({
      slug: 'cultistcircle',
      logo: null,
      category: 'calculators_and_reference',
      hasGuide: false,
      primaryAction: 'website',
      keywords: ['calculator'],
      links: [{ type: 'website', url: 'https://cultistcircle.com' }],
    });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('a[href="/resources/cultistcircle"]').exists()).toBe(false);
    expect(wrapper.get('a[href="https://cultistcircle.com"]').text()).toBe('Open calculator');
    expect(wrapper.find('[data-testid="more-menu"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'UIcon' }).exists()).toBe(true);
  });
});
