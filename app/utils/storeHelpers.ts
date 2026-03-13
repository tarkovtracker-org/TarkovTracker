import { logger } from '@/utils/logger';
import type { StateTree, Store } from 'pinia';
/**
 * Clears store properties that are not present in the new state
 * This ensures the store doesn't retain stale data when remote documents are updated
 */
export function clearStaleState<TState extends StateTree>(
  store: Store<string, TState>,
  newState?: Record<string, unknown>
): void {
  try {
    const currentState = store.$state;
    const missingProperties = Object.keys(currentState).filter((key) => {
      if (typeof newState === 'undefined') return true;
      try {
        return !Object.prototype.hasOwnProperty.call(newState, key);
      } catch (error) {
        logger.error(`[StoreHelpers] Error checking property ${key}:`, error);
        return true;
      }
    });
    if (missingProperties.length > 0) {
      const missingPropertiesObject = missingProperties.reduce<
        Partial<{ [K in keyof TState]: TState[K] | undefined }>
      >((acc, key) => {
        acc[key as keyof TState] = undefined;
        return acc;
      }, {});
      store.$patch(missingPropertiesObject);
    }
  } catch (error) {
    logger.error('[StoreHelpers] Error clearing stale state:', error);
  }
}
/**
 * Safely patches a store with new data
 */
export function safePatchStore<TState extends StateTree>(
  store: Store<string, TState>,
  data: Partial<TState>
): void {
  try {
    if (data && typeof data === 'object') {
      store.$patch(data);
    } else {
      if (import.meta.env.DEV) {
        logger.warn('[StoreHelpers] Invalid data provided to safePatchStore:', data);
      }
    }
  } catch (error) {
    logger.error('[StoreHelpers] Error patching store:', error);
  }
}
/**
 * Resets a store to empty state by clearing all properties
 */
export function resetStore<TState extends StateTree>(store: Store<string, TState>): void {
  try {
    clearStaleState(store, {});
  } catch (error) {
    logger.error('[StoreHelpers] Error resetting store:', error);
  }
}
