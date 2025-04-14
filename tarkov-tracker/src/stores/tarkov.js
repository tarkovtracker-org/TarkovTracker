import { defineStore } from "pinia";
import { watch, nextTick } from "vue";
import { fireuser } from "@/plugins/firebase";
import { getters, actions, defaultState } from "@/shared_state.js";
import { initializeStore, wasDataMigrated } from "@/plugins/store-initializer";

export const useTarkovStore = defineStore("swapTarkov", {
  // Use the shared default state
  state: () => JSON.parse(JSON.stringify(defaultState)),
  getters: getters,
  actions: actions,
  fireswap: [
    {
      // The JSON path of the store to bind to
      path: ".",
      // {uid} will be replaced by the current auth'ed user's uid on bind
      document: "progress/{uid}",
      // The number of miliseconds to debounce changes to the firestore document
      debouncems: 250,
      // The local storage key to persist the store to when unbound
      localKey: "progress",
    },
  ],
});

// Use the store initializer to safely get the store instance
const getSafeStoreInstance = async () => {
  try {
    return await initializeStore("tarkov", useTarkovStore);
  } catch (error) {
    console.error("Could not initialize tarkov store:", error);
    return null;
  }
};

// Watch for fireuser state changing and bind/unbind the remoteTarkov store
// Using a debounced approach to ensure we don't have race conditions
let watchHandlerRunning = false;
watch(
  () => fireuser.loggedIn,
  async (newValue) => {
    // Prevent concurrent execution of this handler
    if (watchHandlerRunning) {
      console.log("Watch handler already running, skipping");
      return;
    }

    watchHandlerRunning = true;

    try {
      // Add a small delay to ensure all systems are ready
      await new Promise((resolve) => setTimeout(resolve, 100));
      const tarkovStore = await getSafeStoreInstance();

      if (!tarkovStore) {
        console.warn("Cannot bind/unbind store - store instance is null");
        watchHandlerRunning = false;
        return;
      }

      if (newValue) {
        // Check for migration flag (in-memory or from sessionStorage)
        const wasMigrated =
          wasDataMigrated() ||
          sessionStorage.getItem("tarkovDataMigrated") === "true";
        console.log("Checking for migration flag:", wasMigrated);

        if (wasMigrated) {
          console.log("Migration detected - forcing immediate rebind of data");
          // This is a post-migration load, force immediate rebind
          if (typeof tarkovStore.firebindAll === "function") {
            tarkovStore.firebindAll();
            console.log("Rebound store after migration");
          }
        } else {
          if (typeof tarkovStore.firebindAll === "function") {
            console.debug("Bound remoteTarkov store");
            tarkovStore.firebindAll();
          } else {
            console.debug("No remoteTarkov store to bind");
          }
        }
      } else {
        if (typeof tarkovStore.fireunbindAll === "function") {
          console.debug("Unbound remoteTarkov store");
          tarkovStore.fireunbindAll();
        } else {
          console.debug("No remoteTarkov store to unbind");
        }
      }
    } catch (error) {
      console.error("Error in fireuser watch handler:", error);
    } finally {
      watchHandlerRunning = false;
    }
  },
  { immediate: false }, // Keep as false to avoid running too early
);

// More robust delayed initialization with better error handling
setTimeout(async () => {
  try {
    console.debug("Starting delayed initialization of tarkovStore");
    const tarkovStore = await getSafeStoreInstance();

    if (!tarkovStore) {
      throw new Error("Failed to get tarkovStore in delayed initialization");
    }

    // Check if this is post-migration
    const wasMigrated =
      wasDataMigrated() ||
      sessionStorage.getItem("tarkovDataMigrated") === "true";
    console.log("Delayed init: checking migration flag:", wasMigrated);

    if (wasMigrated) {
      console.log("Post-migration detected in delayed init - forcing rebind");
      if (typeof tarkovStore.firebindAll === "function") {
        tarkovStore.firebindAll();
        console.log("Delayed init: rebound store after migration");
      }
    } else if (
      fireuser.loggedIn &&
      typeof tarkovStore.firebindAll === "function"
    ) {
      console.debug("Delayed initialization of remoteTarkov store binding");
      tarkovStore.firebindAll();
    }
  } catch (error) {
    console.error("Error in delayed store initialization:", error);
  }
}, 500); // Increased timeout for more reliable initialization
