import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import DrawerLevel from '@/features/drawer/DrawerLevel.vue';
const { setLevel } = vi.hoisted(() => ({ setLevel: vi.fn() }));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({ playerLevel: () => 37, setLevel }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    loading: false,
    minPlayerLevel: 1,
    maxPlayerLevel: 79,
    playerLevels: [],
  }),
}));
describe('manual drawer level', () => {
  it('keeps the editor open after the Enter press used to open it', async () => {
    const wrapper = await mountSuspended(DrawerLevel, {
      props: { isCollapsed: false },
      global: { stubs: { AppTooltip: { template: '<span><slot /></span>' }, UIcon: true } },
    });
    const display = wrapper.get('[role="button"]');
    await display.trigger('keydown', { key: 'Enter' });
    const recipient = wrapper.find('input').exists() ? wrapper.get('input') : display;
    await recipient.trigger('keyup', { key: 'Enter' });
    expect(wrapper.find('input').exists()).toBe(true);
    expect(setLevel).not.toHaveBeenCalled();
    await wrapper.get('input').setValue(38);
    await wrapper.get('input').trigger('keyup', { key: 'Enter' });
    expect(setLevel).toHaveBeenCalledExactlyOnceWith(38);
    expect(wrapper.find('input').exists()).toBe(false);
  });
});
