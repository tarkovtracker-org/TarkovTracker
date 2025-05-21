/**
 * This module helps manage the initialization of Pinia stores
 * and breaks potential circular dependencies by providing a central
 * place to load stores with the proper timing.
 */
import type { StoreGeneric } from 'pinia';
interface InitializationStatus {
  initialized: boolean;
  initializing: boolean;
  error: Error | null;
}
const storeInstances = new Map<string, StoreGeneric>();
const initializationStatus: InitializationStatus = {
  initialized: false,
  initializing: false,
  error: null,
};
export function markInitialized(): void {
  initializationStatus.initialized = true;
  initializationStatus.initializing = false;
  initializationStatus.error = null;
}
export function isInitialized(): boolean {
  return initializationStatus.initialized;
}
// Type for the store accessor function
// Allow unknown for flexibility if types aren't perfect
type StoreAccessor<T extends StoreGeneric = StoreGeneric> = () => T | unknown;
export async function initializeStore<T extends StoreGeneric>(
  storeName: string,
  storeAccessor: StoreAccessor<T>
): Promise<T> {
  if (storeInstances.has(storeName)) {
    return storeInstances.get(storeName) as T;
  }
  if (initializationStatus.initializing) {
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!initializationStatus.initializing) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
    });
    if (storeInstances.has(storeName)) {
      return storeInstances.get(storeName) as T;
    }
  }
  initializationStatus.initializing = true;
  let storeInstance: T | null = null;
  try {
    storeInstance = storeAccessor() as T;
    if (!storeInstance) {
      throw new Error(`Store instance for ${storeName} is null after initialization`);
    }
    if (typeof storeInstance !== 'object' || storeInstance === null) {
      throw new Error(`Store ${storeName} did not return a valid object`);
    }
    storeInstances.set(storeName, storeInstance as StoreGeneric);
    initializationStatus.initializing = false;
    initializationStatus.error = null;
    return storeInstance;
  } catch (error) {
    console.error(`Error initializing store ${storeName}:`, error);
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      storeInstance = storeAccessor() as T;
      if (!storeInstance) {
        throw new Error(`Store instance for ${storeName} is null after retry initialization`);
      }
      if (typeof storeInstance !== 'object' || storeInstance === null) {
        throw new Error(`Store ${storeName} did not return a valid object on retry`);
      }
      storeInstances.set(storeName, storeInstance as StoreGeneric);
      initializationStatus.initializing = false;
      initializationStatus.error = null;
      return storeInstance;
    } catch (retryError) {
      console.error(`Failed to initialize store ${storeName} after retry:`, retryError);
      initializationStatus.error =
        retryError instanceof Error ? retryError : new Error(String(retryError));
      initializationStatus.initializing = false;
      throw initializationStatus.error;
    }
  }
}
export function clearStoreCache(storeName: string): void {
  if (storeInstances.has(storeName)) {
    storeInstances.delete(storeName);
  }
}
export function clearAllStoreCaches(): void {
  storeInstances.clear();
}
export function getInitializationStatus(): InitializationStatus {
  return { ...initializationStatus };
}
export function forceInitialize(): void {
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
export function wasDataMigrated(): boolean {
  if (typeof window !== 'undefined') {
    if (window.__TARKOV_DATA_MIGRATED === true) {
      return true;
    }
    try {
      return sessionStorage.getItem('tarkovDataMigrated') === 'true';
    } catch {
      return false;
    }
  }
  return false; // Cannot determine without window object
}
export function markDataMigrated(): void {
  if (typeof window !== 'undefined') {
    window.__TARKOV_DATA_MIGRATED = true;
    try {
      sessionStorage.setItem('tarkovDataMigrated', 'true');
    } catch (e) {
      console.warn('Could not save migration flag to sessionStorage', e);
    }
  }
}
