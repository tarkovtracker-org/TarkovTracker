import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KeybindsCard from '@/features/settings/KeybindsCard.vue';
const { mockState, setKeybindOmnibarMock, setKeybindUndoMock } = vi.hoisted(() => ({
  mockState: {
    keybindOmnibar: 'ctrl+q',
    keybindUndo: 'ctrl+z',
  },
  setKeybindOmnibarMock: vi.fn(),
  setKeybindUndoMock: vi.fn(),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    get getKeybindOmnibar() {
      return mockState.keybindOmnibar;
    },
    get getKeybindUndo() {
      return mockState.keybindUndo;
    },
    setKeybindOmnibar: setKeybindOmnibarMock,
    setKeybindUndo: setKeybindUndoMock,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));
const UInput = {
  template:
    '<input :value="value" @focus="$emit(\'focus\')" @blur="$emit(\'blur\')" @keydown="$emit(\'keydown\', $event)" />',
  props: ['value', 'color', 'placeholder'],
  emits: ['focus', 'blur', 'keydown'],
};
describe('KeybindsCard double-bind prevention', () => {
  beforeEach(() => {
    mockState.keybindOmnibar = 'ctrl+q';
    mockState.keybindUndo = 'ctrl+z';
    setKeybindOmnibarMock.mockReset();
    setKeybindUndoMock.mockReset();
  });
  const createWrapper = () =>
    mount(KeybindsCard, {
      global: {
        stubs: {
          GenericCard: { template: '<div><slot name="content" /></div>' },
          USeparator: true,
          UButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          UInput,
        },
      },
    });
  const recordOn = async (
    wrapper: ReturnType<typeof createWrapper>,
    index: number,
    init: Partial<KeyboardEvent>
  ) => {
    const input = wrapper.findAll('input')[index]!;
    await input.trigger('focus');
    await input.trigger('keydown', init);
  };
  it('rejects binding the undo field to the omnibar shortcut and keeps the old value', async () => {
    const wrapper = createWrapper();
    // Undo is the second input. Try to record Ctrl+Q (already the omnibar bind).
    await recordOn(wrapper, 1, { key: 'q', ctrlKey: true });
    expect(setKeybindUndoMock).not.toHaveBeenCalled();
    const undoWarning = wrapper.findAll('span').find((s) => s.text().includes('conflict_rejected'));
    expect(undoWarning?.exists()).toBe(true);
  });
  it('accepts a non-conflicting binding', async () => {
    const wrapper = createWrapper();
    await recordOn(wrapper, 1, { key: 'u', ctrlKey: true });
    expect(setKeybindUndoMock).toHaveBeenCalledWith('ctrl+u');
  });
  it('rejects conflict regardless of modifier order', async () => {
    mockState.keybindOmnibar = 'ctrl+shift+k';
    const wrapper = createWrapper();
    // Record Shift+Ctrl+K on undo: same combo, different order.
    await recordOn(wrapper, 1, { key: 'k', ctrlKey: true, shiftKey: true });
    expect(setKeybindUndoMock).not.toHaveBeenCalled();
  });
});
