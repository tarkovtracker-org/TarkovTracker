import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResetProgressSection from '@/features/settings/ResetProgressSection.vue';
const { resetAllDataMock, resetPvEDataMock, resetPvPDataMock, toastAddMock } = vi.hoisted(() => ({
  resetAllDataMock: vi.fn(async () => undefined),
  resetPvEDataMock: vi.fn(async () => undefined),
  resetPvPDataMock: vi.fn(async () => undefined),
  toastAddMock: vi.fn(),
}));
mockNuxtImport('useToast', () => () => ({
  add: toastAddMock,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    resetAllData: resetAllDataMock,
    resetPvEData: resetPvEDataMock,
    resetPvPData: resetPvPDataMock,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const UButton = {
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  props: ['disabled', 'loading'],
  emits: ['click'],
};
const UInput = {
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  props: ['modelValue'],
  emits: ['update:modelValue'],
};
const UModal = {
  template:
    '<div v-if="open"><slot name="header" /><slot name="body" /><slot name="footer" :close="close" /></div>',
  props: ['open'],
  emits: ['update:open', 'close'],
  setup(
    _props: unknown,
    { emit }: { emit: (event: 'update:open' | 'close', value?: false) => void }
  ) {
    const close = () => {
      emit('update:open', false);
      emit('close');
    };
    return { close };
  },
};
const findButtonByText = (wrapper: ReturnType<typeof mount>, text: string) => {
  return wrapper.findAll('button').find((button) => button.text().includes(text));
};
describe('ResetProgressSection', () => {
  beforeEach(() => {
    resetAllDataMock.mockClear();
    resetPvEDataMock.mockClear();
    resetPvPDataMock.mockClear();
    toastAddMock.mockClear();
  });
  const createWrapper = () =>
    mount(ResetProgressSection, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          'i18n-t': {
            template: '<span><slot /><slot name="word" /></span>',
          },
          UAlert: true,
          UButton,
          UIcon: true,
          UInput,
          UModal,
        },
      },
    });
  it('requires confirm word before resetting all data', async () => {
    const wrapper = createWrapper();
    const openResetAllButton = findButtonByText(wrapper, 'settings.data_management.reset_all_data');
    expect(openResetAllButton).toBeTruthy();
    await openResetAllButton!.trigger('click');
    const confirmButton = findButtonByText(wrapper, 'settings.data_management.reset_confirm');
    const input = wrapper.find('input');
    expect(confirmButton).toBeTruthy();
    expect(confirmButton!.attributes('disabled')).toBeDefined();
    await input.setValue('wrong');
    expect(confirmButton!.attributes('disabled')).toBeDefined();
    await input.setValue('settings.danger_zone.confirm_word');
    expect(confirmButton!.attributes('disabled')).toBeUndefined();
    await confirmButton!.trigger('click');
    await flushPromises();
    expect(resetAllDataMock).toHaveBeenCalledTimes(1);
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: 'settings.reset_all.success_title',
      })
    );
  });
  it('resets PvP data from the confirmation dialog', async () => {
    const wrapper = createWrapper();
    const openButton = findButtonByText(wrapper, 'settings.data_management.reset_pvp_data');
    expect(openButton).toBeTruthy();
    await openButton!.trigger('click');
    const confirmButton = findButtonByText(wrapper, 'settings.data_management.reset_confirm');
    expect(confirmButton).toBeTruthy();
    await confirmButton!.trigger('click');
    await flushPromises();
    expect(resetPvPDataMock).toHaveBeenCalledTimes(1);
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: 'settings.reset_pvp.success_title',
      })
    );
  });
  it('resets PvE data from the confirmation dialog', async () => {
    const wrapper = createWrapper();
    const openButton = findButtonByText(wrapper, 'settings.data_management.reset_pve_data');
    expect(openButton).toBeTruthy();
    await openButton!.trigger('click');
    const confirmButton = findButtonByText(wrapper, 'settings.data_management.reset_confirm');
    expect(confirmButton).toBeTruthy();
    await confirmButton!.trigger('click');
    await flushPromises();
    expect(resetPvEDataMock).toHaveBeenCalledTimes(1);
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: 'settings.reset_pve.success_title',
      })
    );
  });
});
