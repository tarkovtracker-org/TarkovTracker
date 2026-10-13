// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import DrawerItemGroup from '@/features/drawer/DrawerItemGroup.vue';
const routeState = reactive({ path: '/' });
mockNuxtImport('useRoute', () => () => routeState);
const appStore = reactive({
  drawerPinnedGroups: [] as string[],
  toggleDrawerGroupPin: vi.fn((group: string) => {
    const index = appStore.drawerPinnedGroups.indexOf(group);
    if (index === -1) appStore.drawerPinnedGroups.push(group);
    else appStore.drawerPinnedGroups.splice(index, 1);
  }),
});
vi.mock('@/stores/useApp', () => ({ useAppStore: () => appStore }));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const items = [
  { icon: 'i-mdi-account-group-outline', localeKey: 'common.traders', to: '/tasks/traders' },
  { icon: 'i-mdi-map-outline', localeKey: 'common.maps', to: '/tasks/maps' },
  { icon: 'i-mdi-graph-outline', localeKey: 'graph', to: '/tasks/graph', class: 'hidden lg:block' },
];
const allHrefs = ['/tasks', '/tasks/traders', '/tasks/maps', '/tasks/graph'];
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
        UPopover: { template: '<div data-testid="popover"><slot /></div>' },
        UButton: { template: '<button v-bind="$attrs"><slot /></button>' },
      },
    },
  });
const isExpanded = (wrapper: ReturnType<typeof mountGroup>) =>
  wrapper.get('[data-testid="drawer-group-toggle"]').attributes('aria-expanded') === 'true';
describe('DrawerItemGroup', () => {
  beforeEach(() => {
    routeState.path = '/';
    appStore.drawerPinnedGroups.splice(0);
    appStore.toggleDrawerGroupPin.mockClear();
  });
  it('expands inline on hover and closes when leaving the whole group', async () => {
    const wrapper = mountGroup();
    expect(isExpanded(wrapper)).toBe(false);
    expect(wrapper.find('[data-testid="popover"]').exists()).toBe(false);
    await wrapper.get('[data-testid="drawer-group"]').trigger('mouseenter');
    expect(isExpanded(wrapper)).toBe(true);
    expect(
      wrapper
        .get('[data-testid="drawer-group-menu"]')
        .findAll('a')
        .map((a) => a.attributes('href'))
    ).toEqual(allHrefs.slice(1));
    await wrapper.get('[data-testid="drawer-group"]').trigger('mouseleave');
    expect(isExpanded(wrapper)).toBe(false);
    expect(wrapper.get('[data-testid="drawer-group-menu"]').attributes('inert')).toBeDefined();
  });
  it('pins on the chevron and stays expanded after leaving and navigating', async () => {
    const wrapper = mountGroup();
    await wrapper.get('[data-testid="drawer-group"]').trigger('mouseenter');
    await wrapper.get('[data-testid="drawer-group-toggle"]').trigger('click');
    await wrapper.get('[data-testid="drawer-group"]').trigger('mouseleave');
    await wrapper.get('a[href="/tasks/maps"]').trigger('click');
    routeState.path = '/tasks/maps';
    await wrapper.vm.$nextTick();
    expect(isExpanded(wrapper)).toBe(true);
    expect(appStore.toggleDrawerGroupPin).toHaveBeenCalledWith('/tasks');
    expect(wrapper.get('[data-testid="drawer-group-toggle"]').attributes('aria-label')).toBe(
      'navigation_drawer.unpin_subpages'
    );
    await wrapper.get('[data-testid="drawer-group-toggle"]').trigger('click');
    expect(isExpanded(wrapper)).toBe(false);
  });
  it('closes an unpinned dropdown on selection, including the current route', async () => {
    const wrapper = mountGroup();
    routeState.path = '/tasks/maps';
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="drawer-group"]').trigger('mouseenter');
    await wrapper.get('a[href="/tasks/maps"]').trigger('click');
    expect(isExpanded(wrapper)).toBe(false);
    await wrapper.get('[data-testid="drawer-group"]').trigger('mouseenter');
    routeState.path = '/tasks/traders';
    await wrapper.vm.$nextTick();
    expect(isExpanded(wrapper)).toBe(false);
  });
  it('opens for keyboard focus and closes when focus leaves the group', async () => {
    const wrapper = mountGroup();
    const group = wrapper.get('[data-testid="drawer-group"]');
    await group.trigger('focusin');
    expect(isExpanded(wrapper)).toBe(true);
    await group.trigger('focusout', {
      relatedTarget: wrapper.get('a[href="/tasks/maps"]').element,
    });
    expect(isExpanded(wrapper)).toBe(true);
    await group.trigger('focusout', { relatedTarget: null });
    expect(isExpanded(wrapper)).toBe(false);
  });
  it('expands inline on the collapsed rail without a separate menu', async () => {
    const wrapper = mountGroup(true);
    expect(wrapper.find('[data-testid="popover"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawer-group-toggle"]').exists()).toBe(false);
    await wrapper.get('[data-testid="drawer-group"]').trigger('mouseenter');
    expect(wrapper.get('[data-testid="drawer-group-menu"]').attributes('aria-hidden')).toBe(
      'false'
    );
  });
  it('highlights the closed parent for child routes and only the parent while open', async () => {
    routeState.path = '/tasks/maps';
    const wrapper = mountGroup();
    expect(wrapper.get('a[href="/tasks"] i').attributes('data-color')).toBe(
      'text-white light:text-surface-50'
    );
    await wrapper.get('[data-testid="drawer-group"]').trigger('mouseenter');
    expect(wrapper.get('a[href="/tasks"] i').attributes('data-color')).toContain(
      'text-surface-300'
    );
    expect(wrapper.get('a[href="/tasks/graph"]').element.closest('li')?.className).toContain(
      'hidden lg:block'
    );
  });
});
