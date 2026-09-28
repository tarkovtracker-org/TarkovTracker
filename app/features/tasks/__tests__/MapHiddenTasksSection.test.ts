import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MapHiddenTasksSection from '@/features/tasks/MapHiddenTasksSection.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const mountSection = () =>
  mount(MapHiddenTasksSection, {
    props: { count: 2 },
    slots: { default: '<div class="hidden-card" />' },
    global: {
      stubs: {
        UIcon: true,
        UButton: {
          inheritAttrs: false,
          emits: ['click'],
          template:
            '<button :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });
describe('MapHiddenTasksSection', () => {
  it('starts collapsed and expands to show the hidden cards', async () => {
    const wrapper = mountSection();
    const toggle = wrapper.find('[data-testid="map-hidden-tasks-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.hidden-card').exists()).toBe(false);
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.hidden-card').exists()).toBe(true);
  });
  it('emits show-all', async () => {
    const wrapper = mountSection();
    await wrapper.find('[data-testid="map-hidden-tasks-show-all"]').trigger('click');
    expect(wrapper.emitted('show-all')).toHaveLength(1);
  });
});
