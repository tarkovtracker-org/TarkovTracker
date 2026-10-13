// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DrawerItem from '@/features/drawer/DrawerItem.vue';
const routeState = {
  path: '/settings',
};
mockNuxtImport('useRoute', () => () => ({
  get path() {
    return routeState.path;
  },
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const mountSettingsDrawerItem = (extraProps: Record<string, unknown> = {}) => {
  return mount(DrawerItem, {
    props: {
      icon: 'i-mdi-cog-outline',
      isCollapsed: false,
      localeKey: 'common.settings',
      to: '/settings',
      ...extraProps,
    },
    global: {
      stubs: {
        DrawerItemIcon: true,
        NuxtLink: {
          props: ['to'],
          template: '<a v-bind="$attrs" :href="to"><slot /></a>',
        },
        UTooltip: {
          template: '<span><slot /></span>',
        },
      },
    },
  });
};
describe('DrawerItem', () => {
  const originalPath = routeState.path;
  beforeEach(() => {
    routeState.path = '/settings';
  });
  afterEach(() => {
    routeState.path = originalPath;
  });
  it.each(['/settings', '/account', '/prestige', '/preferences', '/progression'])(
    'marks settings active on %s',
    (path) => {
      routeState.path = path;
      const wrapper = mountSettingsDrawerItem();
      expect(wrapper.get('a').classes()).toContain('border-primary-500');
      expect(wrapper.getComponent({ name: 'DrawerItemIcon' }).props('colorClass')).toBe(
        'text-white light:text-surface-50'
      );
    }
  );
  it('does not mark settings active outside the settings route group', () => {
    routeState.path = '/tasks';
    const wrapper = mountSettingsDrawerItem();
    expect(wrapper.get('a').classes()).not.toContain('border-primary-500');
    expect(wrapper.getComponent({ name: 'DrawerItemIcon' }).props('colorClass')).toBe(
      'text-surface-300 group-hover:text-white light:group-hover:text-surface-50'
    );
  });
  it('translates the full locale key passed by the caller', () => {
    const wrapper = mountSettingsDrawerItem();
    expect(wrapper.text()).toContain('common.settings');
  });
  it('indents a nested sub-item only while the drawer is expanded', () => {
    const topLevel = mountSettingsDrawerItem().get('a').classes();
    const nested = mountSettingsDrawerItem({ nested: true }).get('a').classes();
    const nestedCollapsed = mountSettingsDrawerItem({ nested: true, isCollapsed: true })
      .get('a')
      .classes();
    expect(topLevel).toContain('min-h-10');
    expect(topLevel).not.toContain('pl-8');
    expect(nested).toEqual(expect.arrayContaining(['min-h-8', 'pl-8']));
    expect(nestedCollapsed).toContain('min-h-8');
    expect(nestedCollapsed).not.toContain('pl-8');
  });
});
