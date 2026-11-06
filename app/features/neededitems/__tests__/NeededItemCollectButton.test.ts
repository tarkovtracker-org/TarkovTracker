import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import NeededItemCollectButton from '@/features/neededitems/NeededItemCollectButton.vue';
vi.mock('vue-i18n', async (original) => ({
  ...(await original<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
describe('NeededItemCollectButton', () => {
  it.each([false, true])('announces collected=%s and emits a toggle', async (collected) => {
    const wrapper = mount(NeededItemCollectButton, {
      props: { collected },
      global: { stubs: { AppTooltip: { template: '<div><slot /></div>' }, UIcon: true } },
    });
    const button = wrapper.get('button');
    expect(button.attributes('aria-pressed')).toBe(String(collected));
    expect(button.attributes('aria-label')).toBe(
      collected ? 'needed_items.collected' : 'needed_items.mark_collected'
    );
    await button.trigger('click');
    expect(wrapper.emitted('toggle')).toEqual([[]]);
    await wrapper.setProps({ collected: !collected });
    expect(button.attributes('aria-pressed')).toBe(String(!collected));
    expect(button.attributes('aria-label')).toBe(
      collected ? 'needed_items.mark_collected' : 'needed_items.collected'
    );
  });
});
