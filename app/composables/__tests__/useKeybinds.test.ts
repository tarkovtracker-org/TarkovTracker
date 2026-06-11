import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
const createPreferencesStore = (omnibar: string, undo: string) => ({
  getKeybindOmnibar: omnibar,
  getKeybindUndo: undo,
});
const setup = async (omnibar: string, undo: string) => {
  const preferencesStore = createPreferencesStore(omnibar, undo);
  const undoLastAction = vi.fn();
  vi.resetModules();
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/stores/useActionHistoryStore', () => ({
    useActionHistoryStore: () => ({ undoLastAction }),
  }));
  vi.doMock('@/utils/idleScheduler', () => ({
    queueIdleTask: (task: () => void) => {
      task();
      return Promise.resolve();
    },
  }));
  const { useKeybinds } = await import('@/composables/useKeybinds');
  const Component = defineComponent({
    setup() {
      useKeybinds();
      return () => h('div');
    },
  });
  const wrapper = mount(Component, { attachTo: document.body });
  await flushPromises();
  return { undoLastAction, wrapper };
};
describe('useKeybinds', () => {
  let toggleSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    toggleSpy = vi.fn();
    window.addEventListener('toggle-omnibar', toggleSpy as EventListener);
  });
  afterEach(() => {
    window.removeEventListener('toggle-omnibar', toggleSpy as EventListener);
    vi.restoreAllMocks();
  });
  const press = (init: Partial<KeyboardEvent>) => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        cancelable: true,
        ...init,
      })
    );
  };
  it('fires neither action when undo and omnibar share the same binding', async () => {
    const { undoLastAction, wrapper } = await setup('ctrl+q', 'ctrl+q');
    press({ key: 'q', ctrlKey: true });
    expect(undoLastAction).not.toHaveBeenCalled();
    expect(toggleSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('fires the matching action when bindings are distinct', async () => {
    const { undoLastAction, wrapper } = await setup('ctrl+q', 'ctrl+z');
    press({ key: 'z', ctrlKey: true });
    expect(undoLastAction).toHaveBeenCalledTimes(1);
    expect(toggleSpy).not.toHaveBeenCalled();
    press({ key: 'q', ctrlKey: true });
    expect(toggleSpy).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
