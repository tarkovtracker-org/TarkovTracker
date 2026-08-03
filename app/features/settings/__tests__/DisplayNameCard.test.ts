import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DisplayNameCard from '@/features/settings/DisplayNameCard.vue';
const {
  mockState,
  setModeDisplayNameMock,
  toastAddMock,
  trackDisplayNameSavedMock,
  trackSettingChangedMock,
} = vi.hoisted(() => ({
  mockState: {
    currentMode: 'pvp',
    pvpDisplayName: 'CurrentPvP',
    pveDisplayName: 'CurrentPvE',
    gameEdition: 1,
  },
  setModeDisplayNameMock: vi.fn(),
  toastAddMock: vi.fn(),
  trackDisplayNameSavedMock: vi.fn(),
  trackSettingChangedMock: vi.fn(),
}));
mockNuxtImport('useToast', () => () => ({
  add: toastAddMock,
}));
mockNuxtImport('useProductAnalytics', () => () => ({
  trackDisplayNameSaved: trackDisplayNameSavedMock,
  trackSettingChanged: trackSettingChangedMock,
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    editions: [{ value: 1, title: 'Standard' }],
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => mockState.currentMode,
    getModeDisplayName: (mode: 'pvp' | 'pve') =>
      mode === 'pve' ? mockState.pveDisplayName : mockState.pvpDisplayName,
    setModeDisplayName: setModeDisplayNameMock,
    getGameEdition: () => mockState.gameEdition,
    setGameEdition: vi.fn(),
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'settings.display_name.max_error') {
        return `max ${String(params?.max ?? '')}`;
      }
      if (key === 'settings.display_name.saved_description') {
        return `saved ${String(params?.mode ?? '')}`;
      }
      return key;
    },
  }),
}));
const UButton = {
  template: '<button :disabled="disabled" :type="type"><slot /></button>',
  props: ['disabled', 'type'],
};
const UInput = {
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  props: ['modelValue'],
  emits: ['update:modelValue'],
};
describe('DisplayNameCard', () => {
  beforeEach(() => {
    mockState.currentMode = 'pvp';
    mockState.pvpDisplayName = 'CurrentPvP';
    mockState.pveDisplayName = 'CurrentPvE';
    mockState.gameEdition = 1;
    setModeDisplayNameMock.mockReset();
    toastAddMock.mockReset();
    trackDisplayNameSavedMock.mockReset();
    trackSettingChangedMock.mockReset();
  });
  const createWrapper = () =>
    mount(DisplayNameCard, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          GenericCard: {
            template: '<div><slot name="content" /></div>',
          },
          SelectMenuFixed: {
            template: '<select />',
          },
          UButton,
          UFormField: {
            template: '<div><slot /></div>',
          },
          UIcon: true,
          UInput,
          UTooltip: {
            template: '<div><slot /></div>',
          },
        },
      },
    });
  it('renders separate PvP and PvE inputs', () => {
    const wrapper = createWrapper();
    expect(wrapper.find('input[name="pvp-display-name"]').exists()).toBe(true);
    expect(wrapper.find('input[name="pve-display-name"]').exists()).toBe(true);
  });
  it('saves the PvP display name and shows a success toast', async () => {
    const wrapper = createWrapper();
    await wrapper.find('input[name="pvp-display-name"]').setValue('NewPvP');
    await wrapper.findAll('form')[0]!.trigger('submit.prevent');
    expect(setModeDisplayNameMock).toHaveBeenCalledWith('pvp', 'NewPvP');
    expect(trackDisplayNameSavedMock).toHaveBeenCalledWith({
      gameMode: 'pvp',
      length: 6,
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: 'settings.display_name.saved_title',
      })
    );
  });
  it('saves the PvE display name independently', async () => {
    const wrapper = createWrapper();
    await wrapper.find('input[name="pve-display-name"]').setValue('NewPvE');
    await wrapper.findAll('form')[1]!.trigger('submit.prevent');
    expect(setModeDisplayNameMock).toHaveBeenCalledWith('pve', 'NewPvE');
    expect(trackDisplayNameSavedMock).toHaveBeenCalledWith({
      gameMode: 'pve',
      length: 6,
    });
  });
  it('shows a validation toast when submitting a blank name', async () => {
    const wrapper = createWrapper();
    await wrapper.find('input[name="pvp-display-name"]').setValue('   ');
    await wrapper.findAll('form')[0]!.trigger('submit.prevent');
    expect(setModeDisplayNameMock).not.toHaveBeenCalled();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        title: 'common.validation_error',
      })
    );
  });
  it('shows an error toast when the store update fails', async () => {
    setModeDisplayNameMock.mockImplementation(() => {
      throw new Error('save failed');
    });
    const wrapper = createWrapper();
    await wrapper.find('input[name="pve-display-name"]').setValue('BrokenName');
    await wrapper.findAll('form')[1]!.trigger('submit.prevent');
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        title: 'settings.display_name.save_failed_title',
      })
    );
  });
});
