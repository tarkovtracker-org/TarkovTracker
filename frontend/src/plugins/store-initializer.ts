/**
 * store-initializer.ts
 *
 * This module helps manage the initialization of Pinia stores
 * and breaks potential circular dependencies by providing a central
 * place to load stores with the proper timing.
 */

import type { StoreGeneric } from 'pinia'; // Import base store type

// Interface for initialization status
interface InitializationStatus {
  initialized: boolean;
  initializing: boolean;
  error: Error | null;
}

// Store instances cache - Use StoreGeneric for base type
const storeInstances = new Map<string, StoreGeneric>();

// Store initialization status
const initializationStatus: InitializationStatus = {
  initialized: false,
  initializing: false,
  error: null,
};

/**
 * Mark the store system as initialized
 */
export function markInitialized(): void {
  initializationStatus.initialized = true;
  initializationStatus.initializing = false;
  initializationStatus.error = null;
}

/**
 * Check if the store system is initialized
 * @returns {boolean} True if initialized
 */
export function isInitialized(): boolean {
  return initializationStatus.initialized;
}

// Type for the store accessor function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreAccessor<T extends StoreGeneric = StoreGeneric> = () => T | any; // Allow any for flexibility if types aren't perfect

/**
 * Initialize a store with proper error handling and caching
 * @param {string} storeName The name of the store
 * @param {StoreAccessor<T>} storeAccessor The function to access the store (e.g., useTarkovStore)
 * @returns {Promise<T>} The store instance
 */
export async function initializeStore<T extends StoreGeneric>(
  storeName: string,
  storeAccessor: StoreAccessor<T>
): Promise<T> {
  // Return cached instance if available
  if (storeInstances.has(storeName)) {
    // Cast needed as Map stores StoreGeneric, but we want specific type T
    return storeInstances.get(storeName) as T;
  }

  // Wait for initialization to complete if in progress
  if (initializationStatus.initializing) {
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!initializationStatus.initializing) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
    });
    // After waiting, check cache again in case it was initialized by another call
    if (storeInstances.has(storeName)) {
      return storeInstances.get(storeName) as T;
    }
  }

  // Mark as initializing to prevent race conditions
  initializationStatus.initializing = true;
  let storeInstance: T | null = null;

  try {
    // Get store instance
    storeInstance = storeAccessor();
    if (!storeInstance) {
      throw new Error(
        `Store instance for ${storeName} is null after initialization`
      );
    }

    // Basic check if it's a valid store object (more specific checks could be added)
    if (typeof storeInstance !== 'object' || storeInstance === null) {
      throw new Error(`Store ${storeName} did not return a valid object`);
    }

    // Cache the instance
    storeInstances.set(storeName, storeInstance as StoreGeneric); // Store as base type

    // Initialization is complete for this attempt (might be retried)
    initializationStatus.initializing = false;
    initializationStatus.error = null; // Clear previous error if retry succeeds
    return storeInstance;
  } catch (error) {
    console.error(`Error initializing store ${storeName}:`, error);

    // Wait and retry once
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      storeInstance = storeAccessor();
      if (!storeInstance) {
        throw new Error(
          `Store instance for ${storeName} is null after retry initialization`
        );
      }
      if (typeof storeInstance !== 'object' || storeInstance === null) {
        throw new Error(
          `Store ${storeName} did not return a valid object on retry`
        );
      }
      storeInstances.set(storeName, storeInstance as StoreGeneric);
      initializationStatus.initializing = false;
      initializationStatus.error = null;
      return storeInstance;
    } catch (retryError) {
      console.error(
        `Failed to initialize store ${storeName} after retry:`,
        retryError
      );
      // Set error state
      initializationStatus.error =
        retryError instanceof Error
          ? retryError
          : new Error(String(retryError));
      initializationStatus.initializing = false;
      throw initializationStatus.error; // Throw the captured error
    }
  }
}

/**
 * Clear a specific store from the cache
 * @param {string} storeName The name of the store to clear
 */
export function clearStoreCache(storeName: string): void {
  if (storeInstances.has(storeName)) {
    storeInstances.delete(storeName);
  }
}

/**
 * Clear all stores from the cache
 */
export function clearAllStoreCaches(): void {
  storeInstances.clear();
}

/**
 * Get the initialization status
 * @returns {InitializationStatus} The initialization status object
 */
export function getInitializationStatus(): InitializationStatus {
  // Return a copy to prevent external modification
  return { ...initializationStatus };
}

/**
 * Force initialization of the store system
 */
export function forceInitialize(): void {
  // This function seems intended to just set the flag if not already set,
  // maybe as a failsafe during app startup.
  if (!initializationStatus.initialized) {
    markInitialized();
    console.debug('Store system force-marked as initialized.');
  }
}

// Ensure the window property type is available (already declared in main.ts)
// declare global {
//     interface Window {
//         __TARKOV_DATA_MIGRATED?: boolean;
//     }
// }

/**
 * Check if data has been recently migrated (checks window flag first, then sessionStorage)
 * @returns {boolean} True if data was migrated
 */
export function wasDataMigrated(): boolean {
  if (typeof window !== 'undefined') {
    if (window.__TARKOV_DATA_MIGRATED === true) {
      return true;
    }
    try {
      // Check sessionStorage as a fallback for persistence
      return sessionStorage.getItem('tarkovDataMigrated') === 'true';
    } catch (e) {
      // sessionStorage might be disabled or unavailable
      return false;
    }
  }
  return false; // Cannot determine without window object
}

/**
 * Mark data as migrated to help with persistence across reloads
 */
export function markDataMigrated(): void {
  if (typeof window !== 'undefined') {
    window.__TARKOV_DATA_MIGRATED = true;
    // Store in sessionStorage to persist across page reloads
    try {
      sessionStorage.setItem('tarkovDataMigrated', 'true');
    } catch (e) {
      console.warn('Could not save migration flag to sessionStorage', e);
    }
  }
}
