// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';
import DrawerItemGroup from '@/features/drawer/DrawerItemGroup.vue';
const routeState = reactive({ path: '/' });
mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useState', () => (_key: string, init: () => unknown) => ref(init()));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const items = [
  { icon: 'i-mdi-map-outline', localeKey: 'common.maps', to: '/tasks/maps' },
  { icon: 'i-mdi-graph-outline', localeKey: 'graph', to: '/tasks/graph', class: 'hidden lg:block' },
];
const mountGroup = (isCollapsed = false) =>
  mount(DrawerItemGroup, {
    props: {
      icon: 'i-tasks',
      localeKey: 'common.tasks',
      to: '/tasks',
      items,
      isCollapsed,
    },
    global: {
      stubs: {
        DrawerItemIcon: { props: ['colorClass'], template: '<i :data-color="colorClass" />' },
        NuxtLink: { props: ['to'], template: '<a v-bind="$attrs" :href="to"><slot /></a>' },
        UTooltip: { template: '<span><slot /></span>' },
        UPopover: {
          props: ['mode'],
          template:
            '<div data-testid="popover" :data-mode="mode"><slot /><div data-testid="popover-content"><slot name="content" /></div></div>',
        },
        UButton: {
          inheritAttrs: false,
          template: '<button v-bind="$attrs" @click="$attrs.onClick"><slot /></button>',
        },
      },
    },
  });
const railHrefs = (wrapper: ReturnType<typeof mountGroup>) =>
  wrapper
    .findAll('a')
    .filter((link) => !link.element.closest('[data-testid="popover-content"]'))
    .map((link) => link.attributes('href'));
describe('DrawerItemGroup', () => {
  beforeEach(() => {
    routeState.path = '/';
  });
  it('shows the sub-pages in the expanded drawer and hides them with the toggle', async () => {
    const wrapper = mountGroup();
    const toggle = wrapper.get('[data-testid="drawer-group-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(railHrefs(wrapper)).toEqual(['/tasks', '/tasks/maps', '/tasks/graph']);
    expect(wrapper.get('a[href="/tasks/graph"]').element.closest('li')?.className).toContain(
      'hidden lg:block'
    );
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-label')).toBe('navigation_drawer.show_subpages');
    expect(railHrefs(wrapper)).toEqual(['/tasks']);
  });
  it('reopens a closed group when the route moves to one of its sub-pages', async () => {
    const wrapper = mountGroup();
    await wrapper.get('[data-testid="drawer-group-toggle"]').trigger('click');
    routeState.path = '/tasks/maps';
    await nextTick();
    expect(railHrefs(wrapper)).toContain('/tasks/maps');
  });
  it('offers every page in a hover menu on the collapsed rail', () => {
    const wrapper = mountGroup(true);
    expect(wrapper.get('[data-testid="popover"]').attributes('data-mode')).toBe('hover');
    const menuHrefs = wrapper
      .get('[data-testid="drawer-group-menu"]')
      .findAll('a')
      .map((link) => link.attributes('href'));
    expect(menuHrefs).toEqual(['/tasks', '/tasks/maps', '/tasks/graph']);
    expect(wrapper.find('[data-testid="drawer-group-toggle"]').exists()).toBe(false);
  });
  it('lists sub-page icons on the collapsed rail only inside the group', () => {
    expect(railHrefs(mountGroup(true))).toEqual(['/tasks']);
    routeState.path = '/tasks';
    expect(railHrefs(mountGroup(true))).toEqual(['/tasks', '/tasks/maps', '/tasks/graph']);
    routeState.path = '/tasks/graph';
    expect(railHrefs(mountGroup(true))).toEqual(['/tasks', '/tasks/maps', '/tasks/graph']);
  });
  it('highlights the parent icon only on its own route', () => {
    routeState.path = '/tasks';
    expect(mountGroup().get('i').attributes('data-color')).toBe('text-white light:text-surface-50');
    routeState.path = '/tasks/maps';
    expect(mountGroup().get('i').attributes('data-color')).toContain('text-surface-300');
  });
});
