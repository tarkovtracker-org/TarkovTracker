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
  ({ id, name, iconLink: `https://img/${id}.png`, wikiLink: `https://wiki/${id}` }) as TarkovItem;
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
    expect(links[0]?.attributes('href')).toBe('https://wiki/a');
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
