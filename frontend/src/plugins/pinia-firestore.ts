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
          const localKey = fireswapSetting.localKey; // Use variable for clarity
          const localData = localStorage.getItem(localKey);
          console.debug(
            `[PiniaFireswap ${store.$id}] loadLocal: Attempting to load from localStorage key '${localKey}'`
          );

          try {
            let newStatePart: StateTree | undefined;
            if (localData) {
              console.debug(
                `[PiniaFireswap ${store.$id}] loadLocal: Found data in localStorage key '${localKey}':`,
                localData
              );
              newStatePart = JSON.parse(localData);
            } else {
              // No local data, use default state
              console.debug(
                `[PiniaFireswap ${store.$id}] loadLocal: No data in localStorage key '${localKey}'. Using default state:`,
                fireswapSetting.defaultState
              );
              newStatePart = fireswapSetting.defaultState
                ? JSON.parse(fireswapSetting.defaultState)
                : {};
            }

            console.debug(
              `[PiniaFireswap ${store.$id}] loadLocal: Parsed state to apply for path '${path}':`,
              JSON.stringify(newStatePart)
            );

            if (path !== '.') {
              store.$patch((state) => {
                set(state, path, newStatePart);
                if (fireswapSetting.localKey === 'progress') {
                  console.debug(
                    `[PiniaFireswap ${store.$id}] After patch (path: ${path}) level:`,
                    state.level
                  );
                }
              });
            } else {
              // Patching root state
              store.$patch((state) => {
                const previousState = JSON.stringify(state);
                Object.assign(state, newStatePart);
                console.debug(
                  `[PiniaFireswap ${store.$id}] loadLocal: Patched root state. Previous: ${previousState}, New: ${JSON.stringify(state)}`
                );
                if (fireswapSetting.localKey === 'progress') {
                  console.debug(
                    `[PiniaFireswap ${store.$id}] After patch (root) level:`,
                    state.level
                  );
                }
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
        console.debug(
          `[PiniaFireswap ${store.$id}] Initializing loadLocal for fsIndex ${fsIndex}, localKey '${fireswapSetting.localKey}'`
        );
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
                  `[PiniaFireswap ${store.$id}] Firestore Snapshot received for ${fireswapSetting.document} (fsIndex ${fsIndex})`
                );
                if (fireswapSetting.lock) {
                  console.debug(
                    `[PiniaFireswap ${store.$id}] Locked, ignoring Firestore snapshot (fsIndex ${fsIndex})`
                  );
                  return; // Ignore snapshot if lock is active
                }

                fireswapSetting.lock = true;
                console.debug(
                  `[PiniaFireswap ${store.$id}] Set lock=true (onSnapshot fsIndex ${fsIndex})`
                );

                const data = snapshot.data() || {};
                console.debug(
                  `[PiniaFireswap ${store.$id}] Firestore Snapshot data (raw):`,
                  JSON.stringify(data)
                );

                // ---- START: Revised logic for displayName initialization ----
                // Initialize displayName from Firebase Auth only if it's undefined in Firestore doc
                // This should happen *before* patching the store with 'data'
                /* // ---- MODIFICATION: Commenting out auto-initialization from Firebase Auth displayName
                if (
                  store.$id === 'swapTarkov' &&
                  typeof data.displayName === 'undefined' && // Check if field is missing
                  fireuser.displayName &&
                  fireuser.displayName.trim() !== ''
                // Check if fireuser.displayName actually has a value
                // AND data.displayName is not already set to null (which would be a deliberate user choice)
                ) {
                  console.debug(
                    `[PiniaFireswap ${store.$id}] Firestore document for user ${fireuser.uid} has no displayName field. Initializing from Firebase Auth displayName ('${fireuser.displayName}'). This new displayName will be patched to the local store and subsequently saved back to Firestore.`
                  );
                  // Set it in the 'data' object that will be patched,
                  // so it gets saved back by uploadDocument if it's the first time.
                  data.displayName = fireuser.displayName;
                }
                */ // ---- END MODIFICATION ----
                // ---- END: Revised logic for displayName initialization ----

                try {
                  const stateBeforePatch = JSON.stringify(
                    path !== '.' ? get(store.$state, path) : store.$state
                  );
                  console.debug(
                    `[PiniaFireswap ${store.$id}] State BEFORE Firestore patch (path: '${path}'):`,
                    stateBeforePatch
                  );

                  if (path !== '.') {
                    store.$patch((state) => {
                      set(state, path, data);
                      if (fireswapSetting.localKey === 'progress') {
                        console.debug(
                          `[PiniaFireswap ${store.$id}] After Firestore patch (path: ${path}) level:`,
                          (get(state, path) as any)?.level
                        );
                      }
                    });
                  } else {
                    // Patching root state using function form for type safety
                    store.$patch((state) => {
                      Object.assign(state, data as any); // data is DocumentData, state is StateTree
                      if (fireswapSetting.localKey === 'progress') {
                        console.debug(
                          `[PiniaFireswap ${store.$id}] After Firestore patch (root) level:`,
                          (state as any)?.level
                        );
                      }
                    });
                  }
                  console.debug(
                    `[PiniaFireswap ${store.$id}] State AFTER Firestore patch (reflecting changes from path '${path}'):`,
                    JSON.stringify(
                      path !== '.' ? get(store.$state, path) : store.$state
                    )
                  );
                  // Update local storage as well after Firestore sync
                  try {
                    const dataToStore =
                      path !== '.' ? get(store.$state, path) : store.$state;
                    const dataString = JSON.stringify(dataToStore);
                    localStorage.setItem(fireswapSetting.localKey, dataString);
                    console.debug(
                      `[PiniaFireswap ${store.$id}] Updated localStorage key '${fireswapSetting.localKey}' after Firestore sync:`,
                      dataString
                    );
                  } catch (lsError) {
                    console.error(
                      `[PiniaFireswap ${store.$id}] Error updating localStorage after Firestore sync for key '${fireswapSetting.localKey}':`,
                      lsError
                    );
                  }
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
          (currentStateSnapshot: StateTree) => {
            fireswapSetting.lock = true; // Lock before potential async operations
            console.debug(
              `[PiniaFireswap ${store.$id}] Set lock=true (uploadDocument fsIndex ${fsIndex})`
            );
            console.debug(
              `[PiniaFireswap ${store.$id}] uploadDocument triggered for fsIndex ${fsIndex}, localKey '${fireswapSetting.localKey}', path '${path}'`
            );

            const stateToSave =
              path !== '.'
                ? get(currentStateSnapshot, path)
                : currentStateSnapshot;

            if (!stateToSave) {
              console.warn(
                `[PiniaFireswap ${store.$id}] No state found at path '${path}' to save.`
              );
              fireswapSetting.lock = false;
              console.debug(
                `[PiniaFireswap ${store.$id}] Set lock=false (uploadDocument - no state found fsIndex ${fsIndex})`
              );
              return;
            }

            const stateString = JSON.stringify(stateToSave);

            // Save to local storage regardless of login state
            try {
              localStorage.setItem(fireswapSetting.localKey, stateString);
              console.debug(
                `[PiniaFireswap ${store.$id}] Saved state to localStorage key '${fireswapSetting.localKey}':`,
                stateString
              );
            } catch (lsError) {
              console.error(
                `[PiniaFireswap ${store.$id}] Error saving state to localStorage key '${fireswapSetting.localKey}':`,
                lsError
              );
            }

            if (fireuser.loggedIn && fireuser.uid) {
              // User is logged in, save to Firestore
              console.debug(
                `[PiniaFireswap ${store.$id}] User logged in. Attempting to save state to Firestore doc '${fireswapSetting.document}':`,
                stateString
              );
              try {
                const docRef = parseDoc(fireswapSetting.document);
                setDoc(docRef, stateToSave, { merge: true }) // Use merge: true to avoid overwriting fields not in stateToSave
                  .then(() => {
                    console.debug(
                      `[PiniaFireswap ${store.$id}] Successfully saved state to Firestore doc '${fireswapSetting.document}'`
                    );
                  })
                  .catch((error) => {
                    console.error(
                      `[PiniaFireswap ${store.$id}] Error saving state to Firestore doc '${fireswapSetting.document}':`,
                      error
                    );
                  })
                  .finally(() => {
                    fireswapSetting.lock = false; // Unlock after Firestore operation completes
                    console.debug(
                      `[PiniaFireswap ${store.$id}] Set lock=false (uploadDocument - Firestore complete fsIndex ${fsIndex})`
                    );
                  });
              } catch (error) {
                console.error(
                  `[PiniaFireswap ${store.$id}] Error parsing Firestore doc path '${fireswapSetting.document}' or calling setDoc:`,
                  error
                );
                fireswapSetting.lock = false; // Unlock on error
                console.debug(
                  `[PiniaFireswap ${store.$id}] Set lock=false (uploadDocument - Firestore error fsIndex ${fsIndex})`
                );
              }
            } else {
              // User is logged out, only saved to local storage (already done above)
              console.debug(
                `[PiniaFireswap ${store.$id}] User logged out. State saved only to localStorage key '${fireswapSetting.localKey}'.`
              );
              fireswapSetting.lock = false; // Unlock since no Firestore operation
              console.debug(
                `[PiniaFireswap ${store.$id}] Set lock=false (uploadDocument - logged out fsIndex ${fsIndex})`
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
            console.debug(
              `[PiniaFireswap ${store.$id}] Store mutation detected:`,
              {
                storeId: mutation.storeId,
                type: mutation.type,
                // Avoid logging potentially large payloads unless needed
                // payload: JSON.stringify(mutation.payload),
              }
            );
            if (fireswapSetting.lock) {
              console.debug(
                `[PiniaFireswap ${store.$id}] Locked, ignoring store subscription mutation (fsIndex ${fsIndex})`
              );
              return; // Ignore if lock is active
            }

            console.debug(
              `[PiniaFireswap ${store.$id}] Calling uploadDocument due to mutation (fsIndex ${fsIndex})`
            );
            // Pass a deep copy of the current state to the debounced function
            fireswapSetting.uploadDocument?.(JSON.parse(JSON.stringify(state)));
          },
          { detached: true, deep: true } // Use deep copy and run detached
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
