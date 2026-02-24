import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import DrawerGameSettings from '@/features/drawer/DrawerGameSettings.vue';
import { GAME_MODES } from '@/utils/constants';
const switchGameModeMock = vi.fn(async () => undefined);
const metadataLoading = ref(false);
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
    getCurrentGameMode: () => GAME_MODES.PVP,
    getPMCFaction: () => 'USEC',
    setPMCFaction: vi.fn(),
    switchGameMode: switchGameModeMock,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
describe('DrawerGameSettings', () => {
  it('switches to pve mode and refreshes metadata', async () => {
    const wrapper = mount(DrawerGameSettings, {
      global: {
        stubs: {
          UIcon: true,
        },
      },
    });
    const buttons = wrapper.findAll('button');
    const pveButton = buttons.find((button) => button.text().includes('game_settings.pve'));
    expect(pveButton).toBeDefined();
    await pveButton!.trigger('click');
    expect(switchGameModeMock).toHaveBeenCalledWith(GAME_MODES.PVE);
    expect(fetchAllDataMock).toHaveBeenCalled();
    expect(setLoadingMock).toHaveBeenCalled();
  });
});
