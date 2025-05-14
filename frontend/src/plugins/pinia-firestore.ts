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
          fireswapSetting.defaultState = '{}'; // Fallback to empty object
        }
        // --- Load from Local Storage ---
        fireswapSetting.loadLocal = () => {
          fireswapSetting.lock = true;
          const localKey = fireswapSetting.localKey; // Use variable for clarity
          const localData = localStorage.getItem(localKey);
          try {
            let newStatePart: StateTree | undefined;
            if (localData) {
              newStatePart = JSON.parse(localData);
            } else {
              // No local data, use default state
              newStatePart = fireswapSetting.defaultState
                ? JSON.parse(fireswapSetting.defaultState)
                : {};
            }
            if (path !== '.') {
              store.$patch((state) => {
                set(state, path, newStatePart);
                if (fireswapSetting.localKey === 'progress') {
                }
              });
            } else {
              // Patching root state
              store.$patch((state) => {
                const previousState = JSON.stringify(state);
                Object.assign(state, newStatePart);
                if (fireswapSetting.localKey === 'progress') {
                }
              });
            }
          } catch (error) {
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
            }
          }
          fireswapSetting.lock = false;
        };
        fireswapSetting.loadLocal();
        // --- Firestore Binding ---
        if (!storeExt.firebind) storeExt.firebind = {};
        storeExt.firebind[fsIndex] = () => {
          // Unbind previous listener if exists
          storeExt.fireunbind?.[fsIndex]?.();
          try {
            const docRef = parseDoc(fireswapSetting.document);
            fireswapSetting.unsubscribe = onSnapshot(
              docRef,
              (snapshot) => {
                if (fireswapSetting.lock) {
                  return; // Ignore snapshot if lock is active
                }
                fireswapSetting.lock = true;
                const data = snapshot.data() || {};
                try {
                  const stateBeforePatch = JSON.stringify(
                    path !== '.' ? get(store.$state, path) : store.$state
                  );
                  if (path !== '.') {
                    store.$patch((state) => {
                      set(state, path, data);
                      if (fireswapSetting.localKey === 'progress') {
                      }
                    });
                  } else {
                    // Patching root state using function form for type safety
                    store.$patch((state) => {
                      Object.assign(state, data as any); // data is DocumentData, state is StateTree
                      if (fireswapSetting.localKey === 'progress') {
                      }
                    });
                  }
                  // Update local storage as well after Firestore sync
                  try {
                    const dataToStore =
                      path !== '.' ? get(store.$state, path) : store.$state;
                    const dataString = JSON.stringify(dataToStore);
                    localStorage.setItem(fireswapSetting.localKey, dataString);
                  } catch (lsError) {
                  }
                } catch (e) {
                }
                fireswapSetting.lock = false;
              },
              (error) => {
                // Consider unbinding or other error handling here
                fireswapSetting.lock = false; // Ensure lock is released on error
              }
            );
          } catch (error) {
          }
        };
        // --- Firestore Unbinding ---
        if (!storeExt.fireunbind) storeExt.fireunbind = {};
        storeExt.fireunbind[fsIndex] = () => {
          if (typeof fireswapSetting.unsubscribe === 'function') {
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
            const stateToSave =
              path !== '.'
                ? get(currentStateSnapshot, path)
                : currentStateSnapshot;
            if (!stateToSave) {
              fireswapSetting.lock = false;
              return;
            }
            const stateString = JSON.stringify(stateToSave);
            // Save to local storage regardless of login state
            try {
              localStorage.setItem(fireswapSetting.localKey, stateString);
            } catch (lsError) {
            }
            if (fireuser.loggedIn && fireuser.uid) {
              try {
                const docRef = parseDoc(fireswapSetting.document);
                setDoc(docRef, stateToSave, { merge: true }) // Use merge: true to avoid overwriting fields not in stateToSave
                  .then(() => {
                  })
                  .catch((error) => {
                  })
                  .finally(() => {
                    fireswapSetting.lock = false;
                  });
              } catch (error) {
                fireswapSetting.lock = false;
              }
            } else {
              fireswapSetting.lock = false;
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
              return;
            }
            // Pass a deep copy of the current state to the debounced function
            fireswapSetting.uploadDocument?.(JSON.parse(JSON.stringify(state)));
          },
          { detached: true, deep: true } // Use deep copy and run detached
        );
      } else {
      }
    });
    // --- Aggregate Bind/Unbind Methods ---
    storeExt.firebindAll = () => {
      Object.values(storeExt.firebind || {}).forEach((bindFn) => bindFn());
    };
    storeExt.fireunbindAll = () => {
      Object.values(storeExt.fireunbind || {}).forEach((unbindFn) =>
        unbindFn()
      );
    };
  }
}
