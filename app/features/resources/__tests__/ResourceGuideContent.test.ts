import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import { RESOURCES } from '@/features/resources/resourceData';
import ResourceGuideArticle from '@/features/resources/ResourceGuideArticle.vue';
import ResourceGuideHeader from '@/features/resources/ResourceGuideHeader.vue';
import type { ResourceWithGuide } from '@/features/resources/resourceData';
const getResource = (slug: string): ResourceWithGuide => {
  const resource = RESOURCES.find((entry) => entry.slug === slug);
  if (!resource?.hasGuide) throw new Error(`${slug} guide missing`);
  return resource;
};
const globalStubs = {
  NuxtImg: { props: ['src', 'alt'], template: '<img :src="src" :alt="alt" />' },
  NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  UButton: {
    props: ['href', 'label'],
    template: '<a :href="href">{{ label }}<slot /></a>',
  },
  UIcon: true,
};
describe('resource guide content', () => {
  it('renders every configured companion-guide section through the shared layout', async () => {
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
  });
  it('renders official-guide identity without an external primary action', async () => {
    const resource = getResource('tarkovtracker_org_vs_io');
    const wrapper = await mountSuspended(ResourceGuideHeader, {
      props: {
        resource,
        title: 'TarkovTracker.org vs TarkovTracker.io',
        description: 'Domain guide',
        categoryLabel: 'TarkovTracker.org Guides',
        metaLine: 'Official guide',
        compatibilityText: '',
      },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain('TarkovTracker.org Guide');
    expect(wrapper.text()).toContain('Official guide');
    expect(wrapper.find('img').attributes('alt')).toBe('TarkovTracker.org vs TarkovTracker.io');
    expect(wrapper.findAll('a')).toHaveLength(2);
  });
  it('renders companion actions and compatibility guidance', async () => {
    const resource = getResource('tarkovmonitor');
    const wrapper = await mountSuspended(ResourceGuideHeader, {
      props: {
        resource,
        title: 'TarkovMonitor',
        description: 'Automatic tracking',
        categoryLabel: 'Companion Apps',
        metaLine: 'Windows',
        compatibilityText: 'Use a read-write token.',
      },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain('Download latest release');
    expect(wrapper.text()).toContain('Use a read-write token.');
  });
});
