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
      icon: 'i-mdi-cog',
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
      expect(wrapper.get('a').attributes('aria-current')).toBe('page');
      expect(wrapper.getComponent({ name: 'DrawerItemIcon' }).props('colorClass')).toBe(
        'text-white transition-opacity light:text-surface-50'
      );
    }
  );
  it('does not mark settings active outside the settings route group', () => {
    routeState.path = '/tasks';
    const wrapper = mountSettingsDrawerItem();
    expect(wrapper.get('a').classes()).not.toContain('border-primary-500');
    expect(wrapper.get('a').attributes('aria-current')).toBeUndefined();
    expect(wrapper.getComponent({ name: 'DrawerItemIcon' }).props('colorClass')).toBe(
      'text-surface-300 opacity-75 transition-opacity group-hover:text-white group-hover:opacity-100 light:group-hover:text-surface-50'
    );
  });
  it('translates the full locale key passed by the caller', () => {
    const wrapper = mountSettingsDrawerItem();
    expect(wrapper.text()).toContain('common.settings');
  });
});
