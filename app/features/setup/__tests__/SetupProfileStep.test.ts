import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createI18n } from 'vue-i18n';
import SetupModeSelector from '@/features/setup/SetupModeSelector.vue';
import SetupProfileStep from '@/features/setup/SetupProfileStep.vue';
import { invalidateStartupOwnership } from '@/stores/tarkov/startupOwnership';
import type { GameMode } from '@/utils/constants';
const state = vi.hoisted(() => ({
  currentMode: 'pvp' as GameMode,
  save: vi.fn<() => Promise<boolean>>(),
  switchMode: vi.fn<(mode: GameMode) => Promise<void>>(),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    pvp: {},
    pve: {},
    seasonal: {},
    getCurrentGameMode: () => state.currentMode,
    getGameEdition: () => 1,
    getModeDisplayName: () => '',
    setGameEdition: vi.fn(),
    saveProgressNow: state.save,
    $patch: vi.fn(),
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({ minPlayerLevel: 1, maxPlayerLevel: 79, editions: [] }),
}));
vi.mock('@/composables/useGameModeSwitch', () => ({
  useGameModeSwitch: () => ({ switchMode: state.switchMode, switchModeError: ref('') }),
}));
vi.mock(import('@/stores/tarkov/localStorage'), async (importOriginal) => ({
  ...(await importOriginal()),
  flushActiveProgressWrites: vi.fn().mockResolvedValue(undefined),
}));
const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false });
const mountProfile = () => shallowMount(SetupProfileStep, { global: { plugins: [i18n] } });
describe('SetupProfileStep', () => {
  beforeEach(() => {
    state.currentMode = 'pvp';
    state.save.mockReset().mockResolvedValue(true);
    state.switchMode.mockReset().mockResolvedValue(undefined);
  });
  it('stays on the profile after a rejected save and advances only after retry succeeds', async () => {
    state.save.mockResolvedValueOnce(false);
    const wrapper = mountProfile();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('finish')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toBe('setup.profile.save_failed');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(state.save).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted('finish')).toHaveLength(1);
    wrapper.unmount();
  });
  it('stays on the profile when switching to the requested primary mode fails', async () => {
    const wrapper = mountProfile();
    const selector = wrapper.getComponent(SetupModeSelector);
    selector.vm.$emit('toggle', 'pve');
    selector.vm.$emit('updatePrimary', 'pve');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(state.switchMode).toHaveBeenCalledWith('pve');
    expect(state.save).not.toHaveBeenCalled();
    expect(wrapper.emitted('finish')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toBe('settings.game_settings.switch_mode_failed');
    wrapper.unmount();
  });
  it('disables the form while saving and ignores acknowledgement after the session changes', async () => {
    const saving = Promise.withResolvers<boolean>();
    state.save.mockReturnValueOnce(saving.promise);
    const wrapper = mountProfile();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('fieldset').attributes()).toHaveProperty('disabled');
    invalidateStartupOwnership();
    saving.resolve(true);
    await flushPromises();
    expect(wrapper.emitted('finish')).toBeUndefined();
    expect(wrapper.get('fieldset').attributes()).not.toHaveProperty('disabled');
    wrapper.unmount();
  });
});
