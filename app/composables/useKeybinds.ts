import { useActionHistoryStore } from '@/stores/useActionHistoryStore';
import { usePreferencesStore } from '@/stores/usePreferences';
export function useKeybinds() {
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
    const matchesShortcut = (shortcut: string) => {
      const parts = shortcut.toLowerCase().split('+');
      const hasCtrl = parts.includes('ctrl') || parts.includes('control');
      const hasAlt = parts.includes('alt');
      const hasShift = parts.includes('shift');
      const key = parts.find((p) => !['ctrl', 'control', 'alt', 'shift'].includes(p));
      if (!key) return false;
      const matchCtrl = event.ctrlKey === hasCtrl;
      const matchAlt = event.altKey === hasAlt;
      const matchShift = event.shiftKey === hasShift;
      let eventKey = event.key.toLowerCase();
      if (eventKey === ' ') eventKey = 'space';
      return matchCtrl && matchAlt && matchShift && eventKey === key;
    };
    const undoShortcut = preferencesStore.getKeybindUndo || 'ctrl+z';
    if (matchesShortcut(undoShortcut)) {
      event.preventDefault();
      void actionHistoryStore.undoLastAction();
      return;
    }
    const omnibarShortcut = preferencesStore.getKeybindOmnibar || 'ctrl+q';
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
    window.addEventListener('keydown', handleKeydown);
  });
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
}
