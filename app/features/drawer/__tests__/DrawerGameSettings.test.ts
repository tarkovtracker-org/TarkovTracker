import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import DrawerGameSettings from '@/features/drawer/DrawerGameSettings.vue';
import { ACTIVE_SEASON, GAME_MODES, type GameMode } from '@/utils/constants';
const switchGameModeMock = vi.fn(async () => undefined);
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
    setPMCFaction: vi.fn(),
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
  it('switches to pve mode and refreshes metadata', async () => {
    const wrapper = mount(DrawerGameSettings, {
      global: {
        stubs: {
          UIcon: true,
          SelectMenuFixed: {
            template:
              '<button data-testid="mode-select" @click="$emit(\'update:modelValue\', \'pve\')">select</button>',
          },
        },
      },
    });
    await wrapper.get('[data-testid="mode-select"]').trigger('click');
    await vi.waitFor(() => expect(switchGameModeMock).toHaveBeenCalled());
    expect(switchGameModeMock).toHaveBeenCalledWith(GAME_MODES.PVE);
    expect(fetchAllDataMock).toHaveBeenCalled();
    expect(setLoadingMock).toHaveBeenCalled();
  });
  it('shows the active-season countdown and exact end timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T13:44:00.000Z'));
    currentGameMode.value = GAME_MODES.SEASONAL;
    const wrapper = mount(DrawerGameSettings, {
      global: {
        stubs: {
          UIcon: true,
          SelectMenuFixed: true,
        },
      },
    });
    const countdown = wrapper.get('time');
    expect(countdown.text()).toBe('Season 1 ends in 123d 20h 16m');
    expect(countdown.attributes('datetime')).toBe(ACTIVE_SEASON.endsAt);
    wrapper.unmount();
    vi.useRealTimers();
  });
});
