import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { RESOURCES } from '@/features/resources/resourceData';
import ResourceGuideArticle from '@/features/resources/ResourceGuideArticle.vue';
import ResourceGuideHeader from '@/features/resources/ResourceGuideHeader.vue';
import type { ResourceWithGuide } from '@/features/resources/resourceData';
const getResource = (slug: string): ResourceWithGuide => {
  const resource = RESOURCES.find((entry) => entry.slug === slug);
  if (!resource?.hasGuide) throw new Error(`${slug} guide missing`);
  return resource;
};
type RouteTarget = string | { path: string; query?: Record<string, string> };
const resolveToHref = (to?: RouteTarget) => {
  if (!to) return undefined;
  if (typeof to === 'string') return to;
  const search = to.query ? new URLSearchParams(to.query).toString() : '';
  return search ? `${to.path}?${search}` : to.path;
};
const NuxtLinkStub = defineComponent({
  props: {
    to: { type: [String, Object], required: true },
  },
  setup(props, { slots }) {
    return () => h('a', { href: resolveToHref(props.to as RouteTarget) }, slots.default?.());
  },
});
const UButtonStub = defineComponent({
  props: {
    href: { type: String, default: undefined },
    to: { type: [String, Object], default: undefined },
    label: { type: String, default: undefined },
  },
  setup(props, { slots }) {
    return () =>
      h('a', { href: props.href ?? resolveToHref(props.to as RouteTarget | undefined) }, [
        props.label,
        slots.default?.(),
      ]);
  },
});
const globalStubs = {
  NuxtImg: { props: ['src', 'alt'], template: '<img :src="src" :alt="alt" />' },
  NuxtLink: NuxtLinkStub,
  UButton: UButtonStub,
  UIcon: true,
};
describe('resource guide content', () => {
  it('renders setup steps before the video walkthrough on companion guides', async () => {
    const resource = getResource('tarkovmonitor');
    const wrapper = await mountSuspended(ResourceGuideArticle, {
      props: {
        resource,
        guideTitle: 'TarkovMonitor',
        overview: 'Companion overview',
      },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain('Companion overview');
    expect(wrapper.find('#video').exists()).toBe(true);
    expect(wrapper.find('#setup').exists()).toBe(true);
    expect(wrapper.find('#troubleshooting').exists()).toBe(true);
    expect(wrapper.find('#tips').exists()).toBe(true);
    expect(wrapper.find('#faq').exists()).toBe(true);
    const sectionIds = wrapper.findAll('section').map((section) => section.attributes('id'));
    expect(sectionIds.indexOf('setup')).toBeLessThan(sectionIds.indexOf('video'));
  });
  it('renders official-guide custom steps heading and internal quick actions', async () => {
    const resource = getResource('tarkovtracker_org_vs_io');
    const header = await mountSuspended(ResourceGuideHeader, {
      props: {
        resource,
        title: 'TarkovTracker.org vs TarkovTracker.io',
        description: 'Domain guide',
        categoryLabel: 'TarkovTracker.org Guides',
        metaLine: 'Maintained by the TarkovTracker.org team',
        compatibilityText: '',
      },
      global: { stubs: globalStubs },
    });
    expect(header.text()).toContain('TarkovTracker.org Guide');
    expect(header.text()).toContain('Maintained by the TarkovTracker.org team');
    expect(header.find('img').attributes('alt')).toBe('');
    const hrefs = header.findAll('a').map((link) => link.attributes('href'));
    expect(hrefs).toContain('/resources?category=tarkovtracker_guides');
    expect(hrefs).toContain('/settings#imports');
    expect(hrefs).toContain('/settings#api');
    expect(hrefs.some((href) => href?.startsWith('https://'))).toBe(false);
    const article = await mountSuspended(ResourceGuideArticle, {
      props: {
        resource,
        guideTitle: 'TarkovTracker.org vs TarkovTracker.io',
        overview: 'Use TarkovTracker.org.',
      },
      global: { stubs: globalStubs },
    });
    expect(article.get('#setup h2').text()).toBe('Move Your Progress to TarkovTracker.org');
  });
  it('renders companion actions, API quick action, and compatibility guidance', async () => {
    const resource = getResource('tarkovmonitor');
    const wrapper = await mountSuspended(ResourceGuideHeader, {
      props: {
        resource,
        title: 'TarkovMonitor',
        description: 'Automatic tracking',
        categoryLabel: 'Companion Apps',
        metaLine: 'Windows · 5-minute setup',
        compatibilityText: 'Use a read-write token.',
      },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain('Download latest release');
    expect(wrapper.text()).toContain('Create API token');
    expect(wrapper.text()).toContain('Use a read-write token.');
    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'));
    expect(hrefs).toContain('/resources?category=companion_apps');
    expect(hrefs).toContain('/settings#api');
  });
});
