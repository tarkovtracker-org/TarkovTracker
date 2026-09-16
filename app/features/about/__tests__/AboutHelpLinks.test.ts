// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
describe('AboutHelpLinks', () => {
  it('links support resources externally with safe rels and credits internally', async () => {
    const { default: AboutHelpLinks } = await import('@/features/about/AboutHelpLinks.vue');
    const wrapper = mount(AboutHelpLinks, {
      global: {
        stubs: {
          NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
          UIcon: { template: '<i />' },
        },
      },
    });
    const discordLink = wrapper.get('a[href="https://discord.gg/M8nBgA2sT6"]');
    expect(discordLink.attributes('target')).toBe('_blank');
    expect(discordLink.attributes('rel')).toBe('noopener noreferrer');
    const securityLink = wrapper.get(
      'a[href="https://github.com/tarkovtracker-org/TarkovTracker/security/policy"]'
    );
    expect(securityLink.attributes('rel')).toBe('noopener noreferrer');
    expect(wrapper.get('a[href="/credits"]').text()).toContain('page.about.help.credits_link');
  });
});
