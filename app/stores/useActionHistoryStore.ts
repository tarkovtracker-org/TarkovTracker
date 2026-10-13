import { defineStore } from 'pinia';
import { useSafeToast } from '@/composables/useSafeToast';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
interface ReversibleAction {
  id: string;
  description: string;
  undo: () => void | Promise<void>;
  timestamp: number;
}
export const useActionHistoryStore = defineStore('actionHistory', () => {
  const { $supabase } = useNuxtApp();
  const tarkovStore = useTarkovStore();
  const undoStack = ref<ReversibleAction[]>([]);
  let generation = 0;
  const clearHistory = () => {
    generation += 1;
    undoStack.value = [];
  };
  // Pinia owns this watcher; it survives disposal of the registering component.
  watch(
    [() => $supabase.user.id, () => $supabase.user.loggedIn, () => tarkovStore.currentGameMode],
    clearHistory,
    { flush: 'sync' }
  );
  const pushAction = (action: Omit<ReversibleAction, 'timestamp'>) => {
    const capturedGeneration = generation;
    undoStack.value.push({
      ...action,
      undo: () => {
        if (capturedGeneration !== generation) return;
        return action.undo();
      },
      timestamp: Date.now(),
    });
    if (undoStack.value.length > 15) undoStack.value.shift();
  };
  const finishUndo = (action: ReversibleAction, capturedGeneration: number) => {
    if (capturedGeneration !== generation) return;
    showUndoToast({
      key: 'toast.action_undone.title',
      fallback: `Undid action: ${action.description}`,
      description: action.description,
      color: 'success',
    });
  };
  const failUndo = (
    action: ReversibleAction,
    capturedGeneration: number,
    index: number,
    error: unknown
  ) => {
    if (capturedGeneration !== generation) return;
    undoStack.value.splice(Math.min(index, undoStack.value.length), 0, action);
    if (undoStack.value.length > 15) undoStack.value.shift();
    logger.error('[ActionHistoryStore] Failed to undo action:', error);
    showUndoToast({
      key: 'toast.action_undo_failed.title',
      fallback: `Failed to undo action: ${action.description}`,
      description: action.description,
      color: 'error',
    });
  };
  const undoLastAction = async () => {
    const capturedGeneration = generation;
    const lastAction = undoStack.value.pop();
    if (!lastAction) return;
    const index = undoStack.value.length;
    try {
      await lastAction.undo();
      finishUndo(lastAction, capturedGeneration);
    } catch (error) {
      failUndo(lastAction, capturedGeneration, index, error);
    }
  };
  return { undoStack, pushAction, undoLastAction, clearHistory };
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
