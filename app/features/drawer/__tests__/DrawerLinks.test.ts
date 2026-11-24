// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import DrawerLinks from '@/features/drawer/DrawerLinks.vue';
const routeState = reactive({
  path: '/tasks',
});
mockNuxtImport('useRoute', () => () => routeState);
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const mountDrawerLinks = (isCollapsed = false) =>
  mount(DrawerLinks, {
    props: { isCollapsed },
    global: {
      stubs: {
        DrawerItem: {
          name: 'DrawerItem',
          props: ['icon', 'iconSrc', 'localeKey', 'to', 'isCollapsed', 'badge'],
          template: '<li :data-to="to" :data-locale-key="localeKey" />',
        },
        DrawerItemIcon: {
          name: 'DrawerItemIcon',
          props: ['icon', 'colorClass', 'hasMargin'],
          template: '<span data-testid="drawer-item-icon" />',
        },
        NuxtLink: {
          name: 'NuxtLink',
          props: ['to'],
          template: '<a v-bind="$attrs" :href="to"><slot /></a>',
        },
        UIcon: {
          name: 'UIcon',
          props: ['name'],
          template: '<span :data-icon="name" />',
        },
      },
    },
  });
describe('DrawerLinks Resources navigation', () => {
  beforeEach(() => {
    routeState.path = '/tasks';
  });
  afterEach(() => {
    routeState.path = '/tasks';
  });
  it('renders a direct DrawerItem link to /resources when collapsed', () => {
    const wrapper = mountDrawerLinks(true);
    const items = wrapper.findAllComponents({ name: 'DrawerItem' });
    const resourcesItem = items.find((item) => item.props('to') === '/resources');
    expect(resourcesItem).toBeDefined();
    expect(resourcesItem?.props()).toMatchObject({
      icon: 'i-mdi-compass',
      localeKey: 'navigation_drawer.resources',
      to: '/resources',
      isCollapsed: true,
    });
    expect(wrapper.find('button[aria-label="navigation_drawer.resources_toggle"]').exists()).toBe(
      false
    );
    expect(wrapper.find('#drawer-resources-sublinks').exists()).toBe(false);
    wrapper.unmount();
  });
  it('renders a direct /resources link and collapsed sub-pages toggle when expanded on another route', () => {
    const wrapper = mountDrawerLinks(false);
    const resourcesLink = wrapper.get('a[href="/resources"]');
    expect(resourcesLink.text()).toBe('navigation_drawer.resources');
    expect(resourcesLink.attributes('aria-current')).toBeUndefined();
    const row = resourcesLink.element.parentElement;
    expect(row?.classList.contains('border-primary-500')).toBe(false);
    const toggle = wrapper.get('button[aria-label="navigation_drawer.resources_toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('#drawer-resources-sublinks').exists()).toBe(false);
    wrapper.unmount();
  });
  it('toggles important resource sub-pages without a redundant Resources overview item', async () => {
    const wrapper = mountDrawerLinks(false);
    const toggle = wrapper.get('button[aria-label="navigation_drawer.resources_toggle"]');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    const subList = wrapper.get('#drawer-resources-sublinks');
    const subLinks = subList.findAll('a');
    expect(subLinks).toHaveLength(1);
    expect(subLinks[0]?.attributes('href')).toBe('/resources/seasonal-modifiers');
    expect(subLinks[0]?.text()).toBe('page.seasonal_modifiers.title');
    expect(subList.text()).not.toContain('navigation_drawer.resources_overview');
    expect(subList.find('a[href="/resources"]').exists()).toBe(false);
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('#drawer-resources-sublinks').exists()).toBe(false);
    wrapper.unmount();
  });
  it('marks /resources active on the hub page while keeping sub-pages collapsed', () => {
    routeState.path = '/resources';
    const wrapper = mountDrawerLinks(false);
    const resourcesLink = wrapper.get('a[href="/resources"]');
    expect(resourcesLink.attributes('aria-current')).toBe('page');
    expect(resourcesLink.element.parentElement?.classList.contains('border-primary-500')).toBe(
      true
    );
    expect(wrapper.find('#drawer-resources-sublinks').exists()).toBe(false);
    wrapper.unmount();
  });
  it('auto-expands and marks Seasonal Modifiers active when on /resources/seasonal-modifiers', () => {
    routeState.path = '/resources/seasonal-modifiers';
    const wrapper = mountDrawerLinks(false);
    const resourcesLink = wrapper.get('a[href="/resources"]');
    expect(resourcesLink.attributes('aria-current')).toBeUndefined();
    expect(resourcesLink.element.parentElement?.classList.contains('border-primary-500')).toBe(
      true
    );
    const toggle = wrapper.get('button[aria-label="navigation_drawer.resources_toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    const modifierLink = wrapper.get(
      '#drawer-resources-sublinks a[href="/resources/seasonal-modifiers"]'
    );
    expect(modifierLink.attributes('aria-current')).toBe('page');
    expect(modifierLink.classes()).toContain('bg-surface-800/60');
    wrapper.unmount();
  });
});
