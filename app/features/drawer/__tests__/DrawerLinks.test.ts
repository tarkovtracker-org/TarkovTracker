// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, nextTick } from 'vue';
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
    attachTo: document.body,
    props: { isCollapsed },
    global: {
      stubs: {
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
        UTooltip: { template: '<span><slot /></span>' },
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
  it('keeps the collapsed Resources group highlighted and marks only the hub as the current page', async () => {
    const wrapper = mountDrawerLinks(true);
    const resourcesLink = wrapper.get('a[href="/resources"]');
    expect(resourcesLink.attributes('aria-label')).toBe('navigation_drawer.resources');
    expect(resourcesLink.attributes('aria-current')).toBeUndefined();
    expect(wrapper.find('button[aria-label="navigation_drawer.resources_toggle"]').exists()).toBe(
      false
    );
    expect(wrapper.find('#drawer-resources-sublinks').exists()).toBe(false);
    routeState.path = '/resources';
    await nextTick();
    expect(resourcesLink.attributes('aria-current')).toBe('page');
    routeState.path = '/resources/seasonal-modifiers';
    await nextTick();
    expect(resourcesLink.classes()).toContain('border-primary-500');
    expect(resourcesLink.attributes('aria-current')).toBeUndefined();
    routeState.path = '/tasks';
    await nextTick();
    expect(resourcesLink.classes()).not.toContain('border-primary-500');
    expect(resourcesLink.attributes('aria-current')).toBeUndefined();
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
    const subList = wrapper.get('#drawer-resources-sublinks');
    expect(toggle.attributes('aria-controls')).toBe(subList.attributes('id'));
    expect(subList.isVisible()).toBe(false);
  });
  it('toggles important resource sub-pages without a redundant Resources overview item', async () => {
    const wrapper = mountDrawerLinks(false);
    const toggle = wrapper.get('button[aria-label="navigation_drawer.resources_toggle"]');
    const subList = wrapper.get('#drawer-resources-sublinks');
    expect(subList.isVisible()).toBe(false);
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(subList.isVisible()).toBe(true);
    const subLinks = subList.findAll('a');
    expect(subLinks).toHaveLength(1);
    expect(subLinks[0]?.attributes('href')).toBe('/resources/seasonal-modifiers');
    expect(subLinks[0]?.text()).toBe('page.seasonal_modifiers.title');
    expect(subList.text()).not.toContain('navigation_drawer.resources_overview');
    expect(subList.find('a[href="/resources"]').exists()).toBe(false);
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('#drawer-resources-sublinks').element).toBe(subList.element);
    expect(subList.isVisible()).toBe(false);
  });
  it('marks /resources active on the hub page while keeping sub-pages collapsed', () => {
    routeState.path = '/resources';
    const wrapper = mountDrawerLinks(false);
    const resourcesLink = wrapper.get('a[href="/resources"]');
    expect(resourcesLink.attributes('aria-current')).toBe('page');
    expect(resourcesLink.element.parentElement?.classList.contains('border-primary-500')).toBe(
      true
    );
    expect(wrapper.get('#drawer-resources-sublinks').isVisible()).toBe(false);
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
  });
  it('auto-expands the sub-list when navigating to /resources/seasonal-modifiers after mount', async () => {
    const wrapper = mountDrawerLinks(false);
    expect(wrapper.get('#drawer-resources-sublinks').isVisible()).toBe(false);
    routeState.path = '/resources/seasonal-modifiers';
    await nextTick();
    const toggle = wrapper.get('button[aria-label="navigation_drawer.resources_toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    const modifierLink = wrapper.get(
      '#drawer-resources-sublinks a[href="/resources/seasonal-modifiers"]'
    );
    expect(modifierLink.attributes('aria-current')).toBe('page');
    expect(modifierLink.classes()).toContain('bg-surface-800/60');
    routeState.path = '/resources';
    await nextTick();
    expect(wrapper.get('a[href="/resources"]').attributes('aria-current')).toBe('page');
    expect(modifierLink.attributes('aria-current')).toBeUndefined();
  });
});
