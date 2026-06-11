import { useActionHistoryStore } from '@/stores/useActionHistoryStore';
import { usePreferencesStore } from '@/stores/usePreferences';
import { queueIdleTask } from '@/utils/idleScheduler';
import { DEFAULT_KEYBINDS, matchesKeybind } from '@/utils/keybinds';
export function useKeybinds(): void {
  const preferencesStore = usePreferencesStore();
  const actionHistoryStore = useActionHistoryStore();
  const handleKeydown = (event: KeyboardEvent) => {
    // Ignore if typing in editable elements
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.hasAttribute('contenteditable'))
    ) {
      return;
    }
    const matchesShortcut = (shortcut: string) => matchesKeybind(event, shortcut);
    const undoShortcut = preferencesStore.getKeybindUndo || DEFAULT_KEYBINDS.undo;
    if (matchesShortcut(undoShortcut)) {
      event.preventDefault();
      void actionHistoryStore.undoLastAction();
      return;
    }
    const omnibarShortcut = preferencesStore.getKeybindOmnibar || DEFAULT_KEYBINDS.omnibar;
    if (matchesShortcut(omnibarShortcut)) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('toggle-omnibar'));
      return;
    }
    // Secondary global-search shortcut: "/" (GitHub-style), no modifiers
    if (event.key === '/' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('toggle-omnibar'));
      return;
    }
  };
  onMounted(() => {
    void queueIdleTask(
      () => {
        window.addEventListener('keydown', handleKeydown);
      },
      { timeout: 3000 }
    );
  });
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
}
