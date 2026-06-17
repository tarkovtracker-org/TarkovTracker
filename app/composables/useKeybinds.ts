import { useActionHistoryStore } from '@/stores/useActionHistoryStore';
import { usePreferencesStore } from '@/stores/usePreferences';
import { queueIdleTask } from '@/utils/idleScheduler';
import { DEFAULT_KEYBINDS, keybindsConflict, matchesKeybind } from '@/utils/keybinds';
import { logger } from '@/utils/logger';
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
        (activeEl instanceof HTMLElement && activeEl.isContentEditable))
    ) {
      return;
    }
    const matchesShortcut = (shortcut: string) => matchesKeybind(event, shortcut);
    const undoShortcut = preferencesStore.getKeybindUndo || DEFAULT_KEYBINDS.undo;
    const omnibarShortcut = preferencesStore.getKeybindOmnibar || DEFAULT_KEYBINDS.omnibar;
    // If two actions are bound to the same combination, firing either one would be
    // ambiguous (e.g. undoing while the user meant to search). Skip both and let the
    // settings UI surface the conflict for the user to resolve.
    if (keybindsConflict(undoShortcut, omnibarShortcut) && matchesShortcut(undoShortcut)) {
      logger.warn(
        '[useKeybinds] Ignoring ambiguous shortcut bound to multiple actions:',
        undoShortcut
      );
      return;
    }
    if (matchesShortcut(undoShortcut)) {
      event.preventDefault();
      void actionHistoryStore.undoLastAction();
      return;
    }
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
