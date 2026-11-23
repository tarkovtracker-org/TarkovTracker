// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import DrawerLinks from '@/features/drawer/DrawerLinks.vue';
mockNuxtImport('useRoute', () => () => ({ path: '/resources/seasonal-modifiers' }));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
describe('DrawerLinks Resources menu', () => {
  it.each([false, true])('labels the active trigger with collapsed=%s', (isCollapsed) => {
    const wrapper = mount(DrawerLinks, {
      props: { isCollapsed },
      global: {
        stubs: {
          DrawerItem: true,
          AppTooltip: {
            name: 'AppTooltip',
            props: ['text', 'disabled'],
            template: '<div><slot /></div>',
          },
          UDropdownMenu: {
            name: 'UDropdownMenu',
            props: ['items'],
            template: '<div><slot /></div>',
          },
          UButton: {
            props: ['label'],
            template: '<button v-bind="$attrs">{{ label }}</button>',
          },
        },
      },
    });
    const trigger = wrapper.get('button[aria-label="navigation_drawer.resources"]');
    expect(trigger.classes()).toContain('border-primary-500');
    expect(trigger.text()).toBe(isCollapsed ? '' : 'navigation_drawer.resources');
    expect(wrapper.getComponent({ name: 'AppTooltip' }).props()).toMatchObject({
      disabled: !isCollapsed,
      text: 'navigation_drawer.resources',
    });
    expect(wrapper.getComponent({ name: 'UDropdownMenu' }).props('items')).toContainEqual({
      to: '/resources/seasonal-modifiers',
      label: 'page.seasonal_modifiers.title',
    });
    wrapper.unmount();
  });
});
