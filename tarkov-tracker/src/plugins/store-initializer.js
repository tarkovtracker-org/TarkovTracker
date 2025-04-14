/**
 * store-initializer.js
 *
 * This module helps manage the initialization of Pinia stores
 * and breaks potential circular dependencies by providing a central
 * place to load stores with the proper timing.
 */

// Store instances cache
const storeInstances = new Map();

// Store initialization status
const initializationStatus = {
  initialized: false,
  initializing: false,
  error: null,
};

/**
 * Mark the store system as initialized
 */
export function markInitialized() {
  console.log("Store system marked as initialized");
  initializationStatus.initialized = true;
  initializationStatus.initializing = false;
  initializationStatus.error = null;
}

/**
 * Check if the store system is initialized
 * @returns {boolean} True if initialized
 */
export function isInitialized() {
  return initializationStatus.initialized;
}

/**
 * Initialize a store with proper error handling and caching
 * @param {string} storeName The name of the store
 * @param {Function} storeAccessor The function to access the store (e.g., useTarkovStore)
 * @returns {Promise<Object>} The store instance
 */
export async function initializeStore(storeName, storeAccessor) {
  console.log(`Initializing store: ${storeName}`);

  // Return cached instance if available
  if (storeInstances.has(storeName)) {
    console.log(`Using cached instance of ${storeName} store`);
    return storeInstances.get(storeName);
  }

  // Wait for initialization to complete if in progress
  if (initializationStatus.initializing) {
    console.log(
      `Waiting for store system initialization before loading ${storeName}`,
    );
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!initializationStatus.initializing) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
    });
  }

  // Mark as initializing to prevent race conditions
  initializationStatus.initializing = true;

  try {
    // Get store instance
    console.log(`Creating store instance for ${storeName}`);
    const storeInstance = storeAccessor();

    if (!storeInstance) {
      throw new Error(
        `Store instance for ${storeName} is null after initialization`,
      );
    }

    // Check if store has expected methods
    const hasMethods = storeInstance && typeof storeInstance === "object";
    console.log(`Store ${storeName} has expected methods: ${hasMethods}`);

    if (!hasMethods) {
      throw new Error(`Store ${storeName} doesn't have expected methods`);
    }

    // Cache the instance
    storeInstances.set(storeName, storeInstance);
    console.log(`Store ${storeName} successfully initialized and cached`);

    // Initialization is complete
    initializationStatus.initializing = false;

    return storeInstance;
  } catch (error) {
    console.error(`Error initializing store ${storeName}:`, error);

    // Wait and retry once
    console.log(`Retrying initialization of ${storeName} after delay...`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      const storeInstance = storeAccessor();

      if (!storeInstance) {
        throw new Error(
          `Store instance for ${storeName} is null after retry initialization`,
        );
      }

      storeInstances.set(storeName, storeInstance);
      console.log(`Store ${storeName} successfully initialized on retry`);

      // Initialization is complete
      initializationStatus.initializing = false;

      return storeInstance;
    } catch (retryError) {
      console.error(
        `Failed to initialize store ${storeName} after retry:`,
        retryError,
      );

      // Set error state
      initializationStatus.error = retryError;
      initializationStatus.initializing = false;

      throw retryError;
    }
  }
}

/**
 * Clear a specific store from the cache
 * @param {string} storeName The name of the store to clear
 */
export function clearStoreCache(storeName) {
  if (storeInstances.has(storeName)) {
    storeInstances.delete(storeName);
    console.log(`Cleared cache for store ${storeName}`);
  }
}

/**
 * Clear all stores from the cache
 */
export function clearAllStoreCaches() {
  storeInstances.clear();
  console.log("Cleared all store caches");
}

/**
 * Get the initialization status
 * @returns {Object} The initialization status object
 */
export function getInitializationStatus() {
  return { ...initializationStatus };
}

/**
 * Force initialization of the store system
 */
export function forceInitialize() {
  if (!initializationStatus.initialized) {
    console.log("Forcing store system initialization");
    markInitialized();
  }
}

/**
 * Check if data has been recently migrated
 * @returns {boolean} True if data was migrated
 */
export function wasDataMigrated() {
  return window.__TARKOV_DATA_MIGRATED === true;
}

/**
 * Mark data as migrated to help with persistence across reloads
 */
export function markDataMigrated() {
  window.__TARKOV_DATA_MIGRATED = true;
  console.log("Data migration flag set to true");
  // Store in sessionStorage to persist across page reloads
  try {
    sessionStorage.setItem("tarkovDataMigrated", "true");
  } catch (e) {
    console.warn("Could not save migration flag to sessionStorage", e);
  }
}
