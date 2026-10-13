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
        UPopover: {
          props: { mode: String, enableTouch: Boolean },
          template:
            '<div data-testid="popover" :data-mode="mode" :data-touch="enableTouch"><slot /><div data-testid="popover-content"><slot name="content" /></div></div>',
        },
        UButton: { template: '<button v-bind="$attrs"><slot /></button>' },
      },
    },
  });
const railHrefs = (wrapper: ReturnType<typeof mountGroup>) =>
  wrapper
    .findAll('a')
    .filter((link) => !link.element.closest('[data-testid="popover-content"]'))
    .map((link) => link.attributes('href'));
const menuHrefs = (wrapper: ReturnType<typeof mountGroup>) =>
  wrapper
    .get('[data-testid="drawer-group-menu"]')
    .findAll('a')
    .map((link) => link.attributes('href'));
describe('DrawerItemGroup', () => {
  beforeEach(() => {
    routeState.path = '/';
    appStore.drawerPinnedGroups.splice(0);
    appStore.toggleDrawerGroupPin.mockClear();
  });
  it('stays compact and offers every view in a hover and touch menu', () => {
    const wrapper = mountGroup();
    expect(railHrefs(wrapper)).toEqual(['/tasks']);
    const popover = wrapper.get('[data-testid="popover"]');
    expect(popover.attributes('data-mode')).toBe('hover');
    expect(popover.attributes('data-touch')).toBe('true');
    expect(menuHrefs(wrapper)).toEqual(allHrefs);
    const toggle = wrapper.get('[data-testid="drawer-group-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-label')).toBe('navigation_drawer.pin_subpages');
  });
  it('pins the views inline with the chevron and unpins them again', async () => {
    const wrapper = mountGroup();
    const toggle = wrapper.get('[data-testid="drawer-group-toggle"]');
    await toggle.trigger('click');
    expect(appStore.toggleDrawerGroupPin).toHaveBeenCalledTimes(1);
    expect(appStore.toggleDrawerGroupPin).toHaveBeenCalledWith('/tasks');
    expect(railHrefs(wrapper)).toEqual(allHrefs);
    expect(wrapper.find('[data-testid="popover"]').exists()).toBe(false);
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.attributes('aria-label')).toBe('navigation_drawer.unpin_subpages');
    expect(wrapper.get('a[href="/tasks/graph"]').element.closest('li')?.className).toContain(
      'hidden lg:block'
    );
    await toggle.trigger('click');
    expect(railHrefs(wrapper)).toEqual(['/tasks']);
  });
  it('keeps the menu on the collapsed rail and hides the pin toggle', () => {
    const wrapper = mountGroup(true);
    expect(railHrefs(wrapper)).toEqual(['/tasks']);
    expect(menuHrefs(wrapper)).toEqual(allHrefs);
    expect(wrapper.find('[data-testid="drawer-group-toggle"]').exists()).toBe(false);
  });
  it('lights up the compact group on any of its views', () => {
    routeState.path = '/tasks/maps';
    const trigger = mountGroup().get('[data-testid="popover"] > a');
    expect(trigger.find('i').attributes('data-color')).toBe('text-white light:text-surface-50');
    expect(trigger.attributes('aria-current')).toBeUndefined();
    expect(trigger.classes()).toContain('border-primary-500');
    routeState.path = '/settings';
    expect(mountGroup().get('[data-testid="popover"] > a i').attributes('data-color')).toContain(
      'text-surface-300'
    );
  });
  it('highlights only the pinned parent on its own route', () => {
    appStore.drawerPinnedGroups.push('/tasks');
    routeState.path = '/tasks/maps';
    expect(mountGroup().get('i').attributes('data-color')).toContain('text-surface-300');
    routeState.path = '/tasks';
    expect(mountGroup().get('i').attributes('data-color')).toBe('text-white light:text-surface-50');
  });
});
