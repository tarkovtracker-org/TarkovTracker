import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsDrawer from '@/components/ui/SettingsDrawer.vue';
import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const stubs = {
  UButton: {
    props: ['ariaLabel'],
    emits: ['click'],
    template: '<button :aria-label="ariaLabel" @click="$emit(\'click\')" />',
  },
};
const mountDrawer = (mode: 'overlay' | 'docked') =>
  mount(SettingsDrawer, {
    props: { pageKey: 'tasks', title: 'Task settings', mode },
    slots: { default: '<p>content</p>' },
    global: { stubs },
  });
describe('SettingsDrawer', () => {
  afterEach(() => {
    usePageSettingsDrawer('tasks').close();
  });
  it('labels an overlay as a modal dialog by its title', () => {
    const wrapper = mountDrawer('overlay');
    const aside = wrapper.get('aside');
    expect(aside.attributes('role')).toBe('dialog');
    expect(aside.attributes('aria-modal')).toBe('true');
    expect(wrapper.get(`#${aside.attributes('aria-labelledby')}`).text()).toBe('Task settings');
  });
  it('docks as a complementary region', () => {
    const aside = mountDrawer('docked').get('aside');
    expect(aside.attributes('role')).toBe('complementary');
    expect(aside.attributes('aria-modal')).toBeUndefined();
  });
  it('closes from the close button and from Escape', async () => {
    const drawer = usePageSettingsDrawer('tasks');
    drawer.open();
    const wrapper = mountDrawer('overlay');
    await wrapper.get('button[aria-label="common.close"]').trigger('click');
    expect(drawer.isOpen.value).toBe(false);
    drawer.open();
    await wrapper.get('aside').trigger('keydown', { key: 'Escape' });
    expect(drawer.isOpen.value).toBe(false);
  });
});
