import { toRef, type Ref } from 'vue';
import { app as fireapp, firestore, fireuser } from '@/plugins/firebase'; // Assuming firebase.ts is correct
import {
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
  type DocumentReference,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { debounce, set, get } from 'lodash-es';
import type { DebouncedFunc } from 'lodash-es';
import type {
  PiniaPluginContext,
  Store,
  StateTree,
  SubscriptionCallbackMutation,
  _StoreWithState, // Import helper type if needed
} from 'pinia';

const db: Firestore = firestore;

// --- Type Definitions ---

interface FireswapSettingInternal {
  document: string;
  localKey: string;
  path?: string;
  debouncems?: number;
  // Internal properties added by the plugin
  defaultState?: string;
  lock?: boolean;
  unsubscribe?: Unsubscribe;
  loadLocal?: () => void;
  uploadDocument?: DebouncedFunc<(state: StateTree) => void>;
}

// Extend Pinia's options type to include our custom 'fireswap' option
declare module 'pinia' {
  export interface DefineStoreOptionsBase<S, Store> {
    fireswap?: FireswapSettingInternal[];
  }
}

// Type for the methods added to the store instance by this plugin
interface FireswapStoreExtensions {
  firebind?: { [key: number]: () => void };
  firebindAll?: () => void;
  fireunbind?: { [key: number]: () => void };
  fireunbindAll?: () => void;
}

// Helper type for store instance with extensions
type StoreWithFireswapExt<StoreType extends Store> = StoreType &
  FireswapStoreExtensions;

// --- Helper Functions ---

// Replace template variables in the doc path like user ID
function parseDoc(docString: string): DocumentReference<DocumentData> {
  const uid = fireuser?.uid;
  if (!uid) {
    // Handle cases where user is not logged in - maybe return a dummy ref or throw?
    // For now, throwing an error seems safest if a UID is expected.
    throw new Error('Cannot parse Firestore path: User not logged in.');
  }
  return doc(db, docString.replace('{uid}', uid));
}

// --- Pinia Plugin ---

export function PiniaFireswap(context: PiniaPluginContext): void {
  // Use the store directly from the context
  const store = context.store;

  // Check if the fireswap option exists
  if (context.options.fireswap && Array.isArray(context.options.fireswap)) {
    const fireswapSettings = context.options.fireswap;
    // Use type assertion when adding/accessing custom properties
    const storeExt = store as StoreWithFireswapExt<typeof store>;

    fireswapSettings.forEach((fireswapSetting, fsIndex) => {
      console.debug('Processing fireswapSetting', fsIndex, fireswapSetting);

      if (fireswapSetting.document && fireswapSetting.localKey) {
        const path = fireswapSetting.path || '.'; // Default path to root
        const debouncems = fireswapSetting.debouncems || 250;

        // --- Default State Handling ---
        try {
          if (path !== '.') {
            // Access $state from the correctly typed store
            fireswapSetting.defaultState = JSON.stringify(
              get(store.$state, path)
            );
          } else {
            fireswapSetting.defaultState = JSON.stringify(store.$state);
          }
        } catch (e) {
          console.error(
            // Access $id from the correctly typed store
            `[PiniaFireswap ${store.$id}] Failed to stringify default state for path '${path}':`,
            e
          );
          fireswapSetting.defaultState = '{}'; // Fallback to empty object
        }

        // --- Load from Local Storage ---
        fireswapSetting.loadLocal = () => {
          fireswapSetting.lock = true;
          console.debug(
            `[PiniaFireswap ${store.$id}] Set lock=true (loadLocal fsIndex ${fsIndex})`
          );
          const localData = localStorage.getItem(fireswapSetting.localKey);

          try {
            let newStatePart: StateTree | undefined;
            if (localData) {
              console.debug(
                `[PiniaFireswap ${store.$id}] Loading local version: ${fireswapSetting.localKey}`
              );
              newStatePart = JSON.parse(localData);
            } else {
              // No local data, use default state
              console.debug(
                `[PiniaFireswap ${store.$id}] No local version found, using default state for ${fireswapSetting.localKey}`
              );
              newStatePart = fireswapSetting.defaultState
                ? JSON.parse(fireswapSetting.defaultState)
                : {};
            }

            if (path !== '.') {
              // Use $patch from the correctly typed store
              store.$patch((state) => {
                set(state, path, newStatePart);
              });
            } else {
              // Patching root state
              store.$patch((state) => {
                // Assign new properties, potentially overwriting existing ones
                Object.assign(state, newStatePart);
              });
            }
          } catch (error) {
            console.error(
              `[PiniaFireswap ${store.$id}] Error loading/parsing state for ${fireswapSetting.localKey}:`,
              error
            );
            // Attempt to reset to default state as a fallback
            try {
              const defaultStateParsed = fireswapSetting.defaultState
                ? JSON.parse(fireswapSetting.defaultState)
                : {};
              if (path !== '.') {
                store.$patch((state) => set(state, path, defaultStateParsed));
              } else {
                store.$patch(defaultStateParsed);
              }
            } catch (resetError) {
              console.error(
                `[PiniaFireswap ${store.$id}] Failed to reset store after load error:`,
                resetError
              );
            }
          }

          console.debug(
            `[PiniaFireswap ${store.$id}] Set lock=false (loadLocal fsIndex ${fsIndex})`
          );
          fireswapSetting.lock = false;
        };

        // Run loadLocal at startup
        fireswapSetting.loadLocal();

        // --- Firestore Binding ---
        if (!storeExt.firebind) storeExt.firebind = {};

        storeExt.firebind[fsIndex] = () => {
          // Unbind previous listener if exists
          storeExt.fireunbind?.[fsIndex]?.();

          try {
            const docRef = parseDoc(fireswapSetting.document);
            console.debug(
              `[PiniaFireswap ${store.$id}] Binding to Firestore: ${fireswapSetting.document} (fsIndex ${fsIndex})`
            );

            fireswapSetting.unsubscribe = onSnapshot(
              docRef,
              (snapshot) => {
                console.debug(
                  `[PiniaFireswap ${store.$id}] Snapshot received for ${fireswapSetting.document}`
                );
                if (fireswapSetting.lock) {
                  console.debug(
                    `[PiniaFireswap ${store.$id}] Locked, ignoring snapshot (fsIndex ${fsIndex})`
                  );
                  return; // Ignore snapshot if lock is active
                }

                fireswapSetting.lock = true;
                console.debug(
                  `[PiniaFireswap ${store.$id}] Set lock=true (onSnapshot fsIndex ${fsIndex})`
                );

                const data = snapshot.data() || {};

                try {
                  if (path !== '.') {
                    store.$patch((state) => {
                      set(state, path, data);
                    });
                  } else {
                    // Use function form for root patch, similar to loadLocal
                    store.$patch((state) => {
                      // Assign data properties onto the existing state object
                      Object.assign(state, data);
                    });
                  }
                  // Update local storage as well after Firestore sync
                  localStorage.setItem(
                    fireswapSetting.localKey,
                    JSON.stringify(data)
                  );
                } catch (e) {
                  console.error(
                    `[PiniaFireswap ${store.$id}] Error patching state from snapshot:`,
                    e
                  );
                }

                console.debug(
                  `[PiniaFireswap ${store.$id}] Set lock=false (onSnapshot fsIndex ${fsIndex})`
                );
                fireswapSetting.lock = false;
              },
              (error) => {
                console.error(
                  `[PiniaFireswap ${store.$id}] Error onSnapshot for ${fireswapSetting.document}:`,
                  error
                );
                // Consider unbinding or other error handling here
                fireswapSetting.lock = false; // Ensure lock is released on error
              }
            );
          } catch (error) {
            console.error(
              `[PiniaFireswap ${store.$id}] Failed to setup binding for ${fireswapSetting.document}:`,
              error
            );
          }
        };

        // --- Firestore Unbinding ---
        if (!storeExt.fireunbind) storeExt.fireunbind = {};

        storeExt.fireunbind[fsIndex] = () => {
          if (typeof fireswapSetting.unsubscribe === 'function') {
            console.debug(
              `[PiniaFireswap ${store.$id}] Unbinding from Firestore: ${fireswapSetting.document} (fsIndex ${fsIndex})`
            );
            fireswapSetting.unsubscribe();
            fireswapSetting.unsubscribe = undefined;
            // Load local storage version after unbinding
            fireswapSetting.loadLocal?.();
          }
        };

        // --- Debounced Firestore Upload ---
        fireswapSetting.uploadDocument = debounce(
          (stateToUpload: StateTree) => {
            console.debug(
              `[PiniaFireswap ${store.$id}] Debounced upload triggered for ${fireswapSetting.document}`
            );
            try {
              const docRef = parseDoc(fireswapSetting.document);
              // Create a clean copy, removing undefined values potentially introduced by patches
              const stateCopy = JSON.parse(JSON.stringify(stateToUpload));
              setDoc(docRef, stateCopy).catch((e) => {
                console.error(
                  `[PiniaFireswap ${store.$id}] Error in setDoc for ${fireswapSetting.document}:`,
                  e
                );
              });
            } catch (error) {
              console.error(
                `[PiniaFireswap ${store.$id}] Error preparing/parsing doc for upload ${fireswapSetting.document}:`,
                error
              );
            }
          },
          debouncems
        );

        // --- Store Subscription ---
        store.$subscribe(
          (
            mutation: SubscriptionCallbackMutation<StateTree>,
            state: StateTree
          ) => {
            if (fireswapSetting.lock) {
              console.debug(
                `[PiniaFireswap ${store.$id}] Locked, ignoring $subscribe (fsIndex ${fsIndex})`
              );
              return; // Do nothing if locked
            }

            // Determine the relevant part of the state
            let relevantState: StateTree | undefined;
            try {
              relevantState = path !== '.' ? get(state, path) : state;
            } catch (e) {
              console.error(
                `[PiniaFireswap ${store.$id}] Error getting relevant state path '${path}' for subscription:`,
                e
              );
              return;
            }

            if (relevantState === undefined) {
              // This can happen if the path is invalid or leads to undefined
              console.warn(
                `[PiniaFireswap ${store.$id}] Relevant state for path '${path}' is undefined. Skipping sync.`
              );
              return;
            }

            if (fireswapSetting.unsubscribe) {
              console.debug(
                `[PiniaFireswap ${store.$id}] $subscribe -> Queuing Firestore upload for ${fireswapSetting.document} (fsIndex ${fsIndex})`
              );
              // If bound, queue Firestore upload
              fireswapSetting.uploadDocument?.(relevantState);
            } else {
              console.debug(
                `[PiniaFireswap ${store.$id}] $subscribe -> Saving to localStorage: ${fireswapSetting.localKey} (fsIndex ${fsIndex})`
              );
              // If not bound, update local storage
              try {
                localStorage.setItem(
                  fireswapSetting.localKey,
                  JSON.stringify(relevantState)
                );
              } catch (e) {
                console.error(
                  `[PiniaFireswap ${store.$id}] Error saving to localStorage ${fireswapSetting.localKey}:`,
                  e
                );
              }
            }
          }
        );
      } else {
        console.error(
          `[PiniaFireswap ${store.$id}] Fireswap setting (index ${fsIndex}) requires both 'document' and 'localKey'`,
          fireswapSetting
        );
      }
    });

    // --- Aggregate Bind/Unbind Methods ---
    storeExt.firebindAll = () => {
      console.debug(`[PiniaFireswap ${store.$id}] Calling firebindAll`);
      Object.values(storeExt.firebind || {}).forEach((bindFn) => bindFn());
    };

    storeExt.fireunbindAll = () => {
      console.debug(`[PiniaFireswap ${store.$id}] Calling fireunbindAll`);
      Object.values(storeExt.fireunbind || {}).forEach((unbindFn) =>
        unbindFn()
      );
    };
  }
}
