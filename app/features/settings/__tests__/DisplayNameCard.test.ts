import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DisplayNameCard from '@/features/settings/DisplayNameCard.vue';
const { mockState, setDisplayNameMock, toastAddMock } = vi.hoisted(() => ({
  mockState: {
    currentMode: 'pvp',
    displayName: 'CurrentName',
  },
  setDisplayNameMock: vi.fn(),
  toastAddMock: vi.fn(),
}));
mockNuxtImport('useToast', () => () => ({
  add: toastAddMock,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => mockState.currentMode,
    getDisplayName: () => mockState.displayName,
    setDisplayName: setDisplayNameMock,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'settings.display_name.max_error') {
        return `max ${String(params?.max ?? '')}`;
      }
      return key;
    },
  }),
}));
const UButton = {
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  props: ['disabled'],
  emits: ['click'],
};
const UInput = {
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup="$emit(\'keyup\', $event)" />',
  props: ['modelValue'],
  emits: ['update:modelValue', 'keyup'],
};
describe('DisplayNameCard', () => {
  beforeEach(() => {
    mockState.currentMode = 'pvp';
    mockState.displayName = 'CurrentName';
    setDisplayNameMock.mockReset();
    toastAddMock.mockReset();
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
          UButton,
          UIcon: true,
          UInput,
          UTooltip: {
            template: '<div><slot /></div>',
          },
        },
      },
    });
  it('saves display name and shows success toast', async () => {
    const wrapper = createWrapper();
    const input = wrapper.find('input');
    await input.setValue('NewName');
    await wrapper.find('button').trigger('click');
    expect(setDisplayNameMock).toHaveBeenCalledWith('NewName');
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: 'settings.display_name.saved_title',
      })
    );
  });
  it('shows validation toast when entering blank name via Enter key', async () => {
    const wrapper = createWrapper();
    const input = wrapper.find('input');
    await input.setValue('   ');
    await input.trigger('keyup', { key: 'Enter' });
    expect(setDisplayNameMock).not.toHaveBeenCalled();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        title: 'settings.display_name.validation_error',
      })
    );
  });
  it('shows max-length validation toast when name exceeds limit', async () => {
    const wrapper = createWrapper();
    const input = wrapper.find('input');
    await input.setValue('x'.repeat(100));
    await wrapper.find('button').trigger('click');
    expect(setDisplayNameMock).not.toHaveBeenCalled();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        description: expect.stringMatching(/^max \d+$/),
        title: 'settings.display_name.validation_error',
      })
    );
  });
  it('shows error toast when store update fails', async () => {
    setDisplayNameMock.mockImplementation(() => {
      throw new Error('save failed');
    });
    const wrapper = createWrapper();
    const input = wrapper.find('input');
    await input.setValue('BrokenName');
    await wrapper.find('button').trigger('click');
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        title: 'settings.display_name.save_failed_title',
      })
    );
  });
});
