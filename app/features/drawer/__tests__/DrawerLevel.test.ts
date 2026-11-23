import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DrawerLevel from '@/features/drawer/DrawerLevel.vue';
const { progress, setLevel } = vi.hoisted(() => ({
  progress: { mode: 'pvp', prestigeLevel: 0 },
  setLevel: vi.fn(),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => progress.mode,
    getCurrentProgressData: () => ({ prestigeLevel: progress.prestigeLevel }),
    playerLevel: () => 37,
    setLevel,
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    loading: false,
    minPlayerLevel: 1,
    maxPlayerLevel: 79,
    playerLevels: [],
    prestigeLevels: [
      { id: 'p1', level: 1, prestigeLevel: 1, iconLink: 'https://assets.tarkov.dev/p1.webp' },
      { id: 'p2', level: 2, prestigeLevel: 2, iconLink: 'https://assets.tarkov.dev/p2.webp' },
    ],
  }),
}));
const stubs = {
  AppTooltip: { template: '<span><slot /></span>' },
  NuxtImg: { props: ['src'], template: '<img :src="src" />' },
  NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  UIcon: true,
  UTooltip: { props: ['text'], template: '<div :data-tooltip="text"><slot /></div>' },
};
const mountLevel = (isCollapsed = false) =>
  mountSuspended(DrawerLevel, { props: { isCollapsed }, global: { stubs } });
describe('manual drawer level', () => {
  beforeEach(() => {
    progress.mode = 'pvp';
    progress.prestigeLevel = 0;
    setLevel.mockClear();
  });
  it('keeps the editor open after the Enter press used to open it', async () => {
    const wrapper = await mountLevel();
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
  it('steps the level down and up from the stepper buttons', async () => {
    const wrapper = await mountLevel();
    await wrapper.get('[aria-label="Decrease level"]').trigger('click');
    await wrapper.get('[aria-label="Increase level"]').trigger('click');
    expect(setLevel.mock.calls).toEqual([[36], [38]]);
  });
  it('links the current prestige and its emblem to prestige settings', async () => {
    progress.prestigeLevel = 2;
    const wrapper = await mountLevel();
    const link = wrapper.get('a[href="/prestige"]');
    expect(link.text()).toContain('Prestige 2');
    expect(link.get('img').attributes('src')).toBe('https://assets.tarkov.dev/p2.webp');
  });
  it('shows no prestige emblem before the first prestige', async () => {
    const wrapper = await mountLevel();
    const link = wrapper.get('a[href="/prestige"]');
    expect(link.text()).toContain('No Prestige');
    expect(link.find('img').exists()).toBe(false);
  });
  it('hides prestige in Seasonal mode, which has none', async () => {
    progress.mode = 'seasonal';
    progress.prestigeLevel = 2;
    const wrapper = await mountLevel();
    expect(wrapper.find('a[href="/prestige"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Prestige');
  });
  it('summarizes level and prestige in the collapsed rail', async () => {
    progress.prestigeLevel = 1;
    const wrapper = await mountLevel(true);
    expect(wrapper.get('[data-tooltip]').attributes('data-tooltip')).toBe('Level 37 · Prestige 1');
    expect(wrapper.text()).toContain('37');
    expect(wrapper.get('img').attributes('src')).toBe('https://assets.tarkov.dev/p1.webp');
  });
});
