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
      const lastAction = this.undoStack.pop();
      if (!lastAction) return;
      try {
        await lastAction.undo();
        const toast = useSafeToast();
        let title = `Undid action: ${lastAction.description}`;
        try {
          const { $i18n } = useNuxtApp();
          if (typeof $i18n?.t === 'function') {
            title = $i18n.t('toast.action_undone.title', { description: lastAction.description });
          }
        } catch (err) {
          logger.warn('[ActionHistoryStore] i18n translator unavailable for undo toast.', err);
        }
        toast?.add({
          title,
          color: 'success',
        });
      } catch (error) {
        logger.error('[ActionHistoryStore] Failed to undo action:', error);
        const toast = useSafeToast();
        let title = `Failed to undo action: ${lastAction.description}`;
        try {
          const { $i18n } = useNuxtApp();
          if (typeof $i18n?.t === 'function') {
            title = $i18n.t('toast.action_undo_failed.title', {
              description: lastAction.description,
            });
          }
        } catch (translatorError) {
          logger.warn(
            '[ActionHistoryStore] i18n translator unavailable for undo-failure toast.',
            translatorError
          );
        }
        toast?.add({
          title,
          color: 'error',
        });
      }
    },
    clearHistory() {
      this.undoStack = [];
    },
  },
});
