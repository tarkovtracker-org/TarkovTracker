import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import DrawerGameSettings from '@/features/drawer/DrawerGameSettings.vue';
import { ACTIVE_SEASON, GAME_MODES, type GameMode } from '@/utils/constants';
const switchGameModeMock = vi.fn(async () => undefined);
const setPMCFactionMock = vi.fn();
const metadataLoading = ref(false);
const currentGameMode = ref<GameMode>(GAME_MODES.PVP);
const fetchAllDataMock = vi.fn(async () => undefined);
const setLoadingMock = vi.fn((value: boolean) => {
  metadataLoading.value = value;
});
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    fetchAllData: fetchAllDataMock,
    loading: metadataLoading,
    setLoading: setLoadingMock,
    updateLanguageAndGameMode: vi.fn(),
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => currentGameMode.value,
    getPMCFaction: () => 'USEC',
    setPMCFaction: setPMCFactionMock,
    switchGameMode: switchGameModeMock,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (
      key: string,
      paramsOrFallback?: Record<string, string | number> | string,
      fallback?: string
    ) => {
      const params = typeof paramsOrFallback === 'object' ? paramsOrFallback : {};
      const template = typeof paramsOrFallback === 'string' ? paramsOrFallback : (fallback ?? key);
      return Object.entries(params).reduce(
        (result, [name, value]) => result.replace(`{${name}}`, String(value)),
        template
      );
    },
  }),
}));
describe('DrawerGameSettings', () => {
  beforeEach(() => {
    currentGameMode.value = GAME_MODES.PVP;
    metadataLoading.value = false;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('shows all three modes and switches to PvE from its badge button', async () => {
    const wrapper = mount(DrawerGameSettings);
    const group = wrapper.get('[role="group"][aria-label="Select game mode"]');
    const buttons = group.findAll('button');
    expect(buttons.map((button) => button.text())).toEqual(['PvP', 'PvE', 'Seasonal']);
    expect(buttons.map((button) => button.get('img').attributes('src'))).toEqual([
      '/img/game-modes/pvp.png',
      '/img/game-modes/pve.png',
      '/img/game-modes/seasonal.png',
    ]);
    expect(group.get('[aria-pressed="true"]').text()).toBe('PvP');
    await buttons[1]!.trigger('click');
    await vi.waitFor(() => expect(switchGameModeMock).toHaveBeenCalledWith(GAME_MODES.PVE));
    expect(fetchAllDataMock).toHaveBeenCalled();
    currentGameMode.value = GAME_MODES.PVE;
    await wrapper.vm.$nextTick();
    expect(group.get('[aria-pressed="true"]').text()).toBe('PvE');
    wrapper.unmount();
  });
  it('renders BEAR before USEC with their matching emblems', async () => {
    const wrapper = mount(DrawerGameSettings);
    const group = wrapper.get('[role="group"][aria-label="Select faction"]');
    const buttons = group.findAll('button');
    expect(buttons.map((button) => button.text())).toEqual(['BEAR', 'USEC']);
    expect(buttons[0]!.get('[aria-hidden="true"]').attributes('style')).toContain(
      '/img/factions/BEAR.webp'
    );
    expect(buttons[1]!.get('[aria-hidden="true"]').attributes('style')).toContain(
      '/img/factions/USEC.webp'
    );
    expect(buttons[1]!.attributes('aria-pressed')).toBe('true');
    await buttons[0]!.trigger('click');
    expect(setPMCFactionMock).toHaveBeenCalledWith('BEAR');
    wrapper.unmount();
  });
  it('colors each selected mode with its own mode tone', () => {
    const wrapper = mount(DrawerGameSettings);
    const buttons = wrapper.get('[role="group"][aria-label="Select game mode"]').findAll('button');
    expect(buttons[0]!.classes()).toContain('aria-pressed:border-pvp-500/70');
    expect(buttons[1]!.classes()).toContain('aria-pressed:border-pve-500/70');
    expect(buttons[2]!.classes()).toContain('aria-pressed:border-warning-500/70');
    wrapper.unmount();
  });
  it('marks PvP selected for an unrecognized saved mode', () => {
    currentGameMode.value = 'unknown' as GameMode;
    const wrapper = mount(DrawerGameSettings);
    const group = wrapper.get('[role="group"][aria-label="Select game mode"]');
    expect(group.get('[aria-pressed="true"]').text()).toBe('PvP');
    wrapper.unmount();
  });
  it('shows the active-season countdown and exact end timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T13:44:00.000Z'));
    currentGameMode.value = GAME_MODES.SEASONAL;
    const wrapper = mount(DrawerGameSettings);
    const countdown = wrapper.get('time');
    expect(countdown.text()).toBe('Season 1 ends in 123d 20h 16m');
    expect(countdown.attributes('datetime')).toBe(ACTIVE_SEASON.endsAt);
    wrapper.unmount();
  });
  it('runs the countdown timer only while Seasonal mode is active', async () => {
    vi.useFakeTimers();
    const wrapper = mount(DrawerGameSettings);
    expect(vi.getTimerCount()).toBe(0);
    currentGameMode.value = GAME_MODES.SEASONAL;
    await wrapper.vm.$nextTick();
    expect(vi.getTimerCount()).toBe(1);
    currentGameMode.value = GAME_MODES.PVE;
    await wrapper.vm.$nextTick();
    expect(vi.getTimerCount()).toBe(0);
    wrapper.unmount();
  });
});
