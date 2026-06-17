import { defineStore } from 'pinia';
import { useSafeToast } from '@/composables/useSafeToast';
import { logger } from '@/utils/logger';
export interface ReversibleAction {
  id: string;
  description: string;
  undo: () => void | Promise<void>;
  timestamp: number;
}
export const useActionHistoryStore = defineStore('actionHistory', {
  state: () => ({
    undoStack: [] as ReversibleAction[],
  }),
  actions: {
    pushAction(action: Omit<ReversibleAction, 'timestamp'>) {
      this.undoStack.push({
        ...action,
        timestamp: Date.now(),
      });
      // Limit to last 15 actions to keep it light
      if (this.undoStack.length > 15) {
        this.undoStack.shift();
      }
    },
    async undoLastAction() {
      const lastAction = this.undoStack.at(-1);
      if (!lastAction) return;
      try {
        await lastAction.undo();
        this.undoStack.pop();
        showUndoToast({
          key: 'toast.action_undone.title',
          fallback: `Undid action: ${lastAction.description}`,
          description: lastAction.description,
          color: 'success',
        });
      } catch (error) {
        logger.error('[ActionHistoryStore] Failed to undo action:', error);
        showUndoToast({
          key: 'toast.action_undo_failed.title',
          fallback: `Failed to undo action: ${lastAction.description}`,
          description: lastAction.description,
          color: 'error',
        });
      }
    },
    clearHistory() {
      this.undoStack = [];
    },
  },
});
function showUndoToast(options: {
  key: string;
  fallback: string;
  description: string;
  color: 'success' | 'error';
}) {
  let title = options.fallback;
  try {
    const { $i18n } = useNuxtApp();
    if (typeof $i18n?.t === 'function') {
      title = $i18n.t(options.key, { description: options.description });
    }
  } catch (err) {
    logger.warn('[ActionHistoryStore] i18n translator unavailable for undo toast.', err);
  }
  useSafeToast()?.add({ title, color: options.color });
}
