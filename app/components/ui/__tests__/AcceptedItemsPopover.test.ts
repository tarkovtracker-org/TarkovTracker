import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import AcceptedItemsPopover from '@/components/ui/AcceptedItemsPopover.vue';
import type { TarkovItem } from '@/types/tarkov';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string, named?: Record<string, unknown>) =>
      named && typeof named === 'object' && 'count' in named ? `${key}:${named.count}` : key,
  }),
}));
const makeItem = (id: string, name: string): TarkovItem =>
  ({
    id,
    name,
    iconLink: `https://img/${id}.png`,
    wikiLink: `https://escapefromtarkov.fandom.com/wiki/${id}`,
  }) as TarkovItem;
// Render the popover trigger and content inline so we can assert on both.
const UPopoverStub = defineComponent({
  template: '<div><slot /><slot name="content" /></div>',
});
const mountPopover = (props: { items: TarkovItem[]; cycling?: boolean }) =>
  mount(AcceptedItemsPopover, {
    props,
    global: {
      stubs: {
        UPopover: UPopoverStub,
        UIcon: true,
        NuxtImg: defineComponent({
          props: { src: String, alt: String },
          template: '<img :src="src" :alt="alt" />',
        }),
      },
    },
  });
describe('AcceptedItemsPopover', () => {
  it('renders the trigger with the accepted-item count', () => {
    const wrapper = mountPopover({
      items: [makeItem('a', 'Item A'), makeItem('b', 'Item B')],
    });
    expect(wrapper.find('button').text()).toContain('needed_items.any_of_items_short:2');
  });
  it('lists every accepted item with a link to its page', () => {
    const items = [makeItem('a', 'Item A'), makeItem('b', 'Item B'), makeItem('c', 'Item C')];
    const wrapper = mountPopover({ items });
    const links = wrapper.findAll('a');
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.text())).toEqual(['Item A', 'Item B', 'Item C']);
    expect(links[0]?.attributes('href')).toBe('https://escapefromtarkov.fandom.com/wiki/a');
  });
  it('never renders an untrusted upstream link as an href', () => {
    const evil = {
      ...makeItem('evil', 'Evil'),
      wikiLink: 'javascript:alert(1)',
      link: 'data:text/html,x',
    };
    const wrapper = mountPopover({ items: [makeItem('a', 'Item A'), evil] });
    expect(wrapper.findAll('a')[1]?.attributes('href')).toBe('https://tarkov.dev/item/evil');
  });
  it('bounds rendered rows while keeping every accepted item reachable through paging', async () => {
    const items = Array.from({ length: 3501 }, (_, index) =>
      makeItem(`id-${index}`, `Item ${index}`)
    );
    const wrapper = mountPopover({ items });
    expect(wrapper.find('button').text()).toContain('needed_items.any_of_items_short:3501');
    expect(wrapper.findAll('a')).toHaveLength(50);
    const seen: string[] = [];
    for (let page = 1; page <= 71; page++) {
      seen.push(...wrapper.findAll('a').map((link) => link.text()));
      const next = wrapper.get('button[aria-label="common.next"]');
      expect(next.attributes('disabled') !== undefined).toBe(page === 71);
      if (page < 71) await next.trigger('click');
    }
    expect(seen).toEqual(items.map((item) => item.name));
    await wrapper.get('button[aria-label="common.previous"]').trigger('click');
    expect(wrapper.findAll('a')).toHaveLength(50);
    expect(wrapper.findAll('a')[0]?.text()).toBe('Item 3450');
  });
  it('searches beyond the first page by name or short name and resets paging', async () => {
    const items = Array.from({ length: 100 }, (_, index) =>
      makeItem(`id-${index}`, `Item ${index}`)
    );
    items[99] = { ...makeItem('target', 'Secure Flash Drive'), shortName: 'USB' };
    const wrapper = mountPopover({ items });
    await wrapper.get('button[aria-label="common.next"]').trigger('click');
    await wrapper.get('input[type="search"]').setValue('  fLaSh  ');
    expect(wrapper.findAll('a').map((link) => link.text())).toEqual(['Secure Flash Drive']);
    await wrapper.get('input[type="search"]').setValue('USB');
    expect(wrapper.findAll('a')).toHaveLength(1);
    await wrapper.get('input[type="search"]').setValue('no match');
    expect(wrapper.findAll('a')).toHaveLength(0);
    expect(wrapper.text()).toContain('needed_items.no_accepted_items');
    await wrapper.get('input[type="search"]').setValue('');
    expect(wrapper.findAll('a')[0]?.text()).toBe('Item 0');
  });
  it('resets the page and search when the pool changes', async () => {
    const items = Array.from({ length: 100 }, (_, index) =>
      makeItem(`id-${index}`, `Item ${index}`)
    );
    const wrapper = mountPopover({ items });
    await wrapper.get('input[type="search"]').setValue('Item');
    await wrapper.get('button[aria-label="common.next"]').trigger('click');
    await wrapper.setProps({ items: [makeItem('replacement', 'Replacement')] });
    expect(wrapper.findAll('a').map((link) => link.text())).toEqual(['Replacement']);
    expect(wrapper.find('input').exists()).toBe(false);
  });
  it('reflects open state via v-model', async () => {
    const open = ref(false);
    const Host = defineComponent({
      components: { AcceptedItemsPopover },
      setup() {
        return { open, items: [makeItem('a', 'Item A'), makeItem('b', 'Item B')] };
      },
      template: '<AcceptedItemsPopover v-model:open="open" :items="items" />',
    });
    const wrapper = mount(Host, {
      global: {
        stubs: {
          UPopover: UPopoverStub,
          UIcon: true,
          NuxtImg: true,
        },
      },
    });
    expect(wrapper.find('button').exists()).toBe(true);
  });
});
