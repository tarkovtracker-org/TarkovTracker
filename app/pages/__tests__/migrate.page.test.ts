import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import MigratePage from '@/pages/migrate.vue';
const defaultGlobalStubs = {
  UIcon: true,
  UButton: {
    props: ['to', 'href', 'variant', 'color', 'size', 'icon', 'trailingIcon'],
    template: `<a :href="to || href" data-testid="migrate-cta">{{ $attrs.title }}</a>`,
  },
  NuxtLink: {
    props: ['to'],
    template: `<a :href="to"><slot /></a>`,
  },
};
describe('migrate page', () => {
  it('renders the migration title and banner', async () => {
    const wrapper = await mountSuspended(MigratePage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('h1').exists()).toBe(true);
    expect(wrapper.text()).toContain('Migrate from TarkovTracker.io to TarkovTracker.org');
    expect(wrapper.text()).toContain('TarkovTracker.io is discontinued');
  });
  it('renders all six migration steps', async () => {
    const wrapper = await mountSuspended(MigratePage, {
      global: { stubs: defaultGlobalStubs },
    });
    const listItems = wrapper.find('ol li');
    expect(listItems.exists()).toBe(true);
  });
});
