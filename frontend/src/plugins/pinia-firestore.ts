import { firestore, fireuser } from '@/plugins/firebase';
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
import type { PiniaPluginContext, Store, StateTree, SubscriptionCallbackMutation } from 'pinia';
import type { StateTree as PiniaStateTree } from 'pinia';
const db: Firestore = firestore;

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface DefineStoreOptionsBase<S extends PiniaStateTree, Store> {
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
export type StoreWithFireswapExt<StoreType extends Store> = StoreType & FireswapStoreExtensions;
// Helper Functions - Replace template variables in the doc path like user ID
function parseDoc(docString: string): DocumentReference<DocumentData> {
  const uid = fireuser?.uid;
  if (!uid) {
    // Handle cases where user is not logged in - maybe return a dummy ref or throw?
    // For now, throwing an error seems safest if a UID is expected.
    throw new Error('Cannot parse Firestore path: User not logged in.');
  }
  return doc(db, docString.replace('{uid}', uid));
}
// Pinia Plugin
export function PiniaFireswap(context: PiniaPluginContext): void {
  const store = context.store;
  if (context.options.fireswap && Array.isArray(context.options.fireswap)) {
    const fireswapSettings = context.options.fireswap;
    const storeExt = store as StoreWithFireswapExt<typeof store>;
    fireswapSettings.forEach((fireswapSetting, fsIndex) => {
      if (fireswapSetting.document && fireswapSetting.localKey) {
        const path = fireswapSetting.path || '.'; // Default path to root
        const debouncems = fireswapSetting.debouncems || 250;
        try {
          if (path !== '.') {
            fireswapSetting.defaultState = JSON.stringify(get(store.$state, path));
          } else {
            fireswapSetting.defaultState = JSON.stringify(store.$state);
          }
        } catch {
          fireswapSetting.defaultState = '{}';
        }
        fireswapSetting.loadLocal = () => {
          fireswapSetting.lock = true;
          const localKey = fireswapSetting.localKey;
          const localData = localStorage.getItem(localKey);
          try {
            let newStatePart: StateTree | undefined;
            if (localData) {
              newStatePart = JSON.parse(localData);
            } else {
              newStatePart = fireswapSetting.defaultState
                ? JSON.parse(fireswapSetting.defaultState)
                : {};
            }
            if (path !== '.') {
              store.$patch((state) => {
                set(state, path, newStatePart || {});
              });
            } else {
              store.$patch(newStatePart || {});
            }
          } catch {
            try {
              const defaultStateParsed = fireswapSetting.defaultState
                ? JSON.parse(fireswapSetting.defaultState)
                : {};
              if (path !== '.') {
                store.$patch((state) => set(state, path, defaultStateParsed));
              } else {
                store.$patch(defaultStateParsed);
              }
            } catch {
              /* Intentionally ignored */
            }
          }
          fireswapSetting.lock = false;
        };
        fireswapSetting.loadLocal();
        if (!storeExt.firebind) storeExt.firebind = {};
        storeExt.firebind[fsIndex] = () => {
          storeExt.fireunbind?.[fsIndex]?.();
          try {
            const docRef = parseDoc(fireswapSetting.document);
            fireswapSetting.unsubscribe = onSnapshot(
              docRef,
              (snapshot) => {
                if (fireswapSetting.lock) {
                  return;
                }
                fireswapSetting.lock = true;
                const data = snapshot.data() || {};
                try {
                  if (path !== '.') {
                    store.$patch((state) => {
                      set(state, path, data);
                    });
                  } else {
                    store.$patch((state) => {
                      Object.assign(state, data);
                    });
                  }
                  try {
                    const dataToStore = path !== '.' ? get(store.$state, path) : store.$state;
                    const dataString = JSON.stringify(dataToStore);
                    localStorage.setItem(fireswapSetting.localKey, dataString);
                  } catch {
                    /* Intentionally ignored */
                  }
                } catch {
                  /* Intentionally ignored */
                }
                fireswapSetting.lock = false;
              },
              (_error) => {
                fireswapSetting.lock = false;
              }
            );
          } catch {
            /* Intentionally ignored */
          }
        };
        if (!storeExt.fireunbind) storeExt.fireunbind = {};
        storeExt.fireunbind[fsIndex] = () => {
          if (typeof fireswapSetting.unsubscribe === 'function') {
            fireswapSetting.unsubscribe();
            fireswapSetting.unsubscribe = undefined;
            fireswapSetting.loadLocal?.();
          }
        };
        fireswapSetting.uploadDocument = debounce((currentStateSnapshot: StateTree) => {
          fireswapSetting.lock = true;
          // Ensure the 'saving' property is not part of the state to be saved.
          const stateToSave = path !== '.' ? get(currentStateSnapshot, path) : currentStateSnapshot;

          if (!Object.keys(stateToSave).length) {
            // Check if stateToSave is empty after destructuring
            fireswapSetting.lock = false;
            // Reset saving flags if the store has them, even if stateToSave is empty
            if (store.saving && typeof store.saving === 'object') {
              Object.keys(store.saving).forEach((k) => (store.saving[k] = false));
            }
            return;
          }
          const stateString = JSON.stringify(stateToSave);
          try {
            localStorage.setItem(fireswapSetting.localKey, stateString);
          } catch {
            /* Intentionally ignored */
          }
          if (fireuser.loggedIn && fireuser.uid) {
            try {
              const docRef = parseDoc(fireswapSetting.document);
              setDoc(docRef, stateToSave, { merge: true })
                .then(() => {
                  /* Intentionally ignored */
                })
                .catch(() => {
                  /* Intentionally ignored */
                })
                .finally(() => {
                  fireswapSetting.lock = false;
                  if (store.saving && typeof store.saving === 'object') {
                    Object.keys(store.saving).forEach((k) => (store.saving[k] = false));
                  }
                });
            } catch {
              /* Intentionally ignored: This is for parseDoc errors */
              // CRITICAL: If parseDoc fails, .finally() of setDoc is NOT called.
              // We need to reset lock and saving flags here.
              fireswapSetting.lock = false;
              if (store.saving && typeof store.saving === 'object') {
                Object.keys(store.saving).forEach((k) => (store.saving[k] = false));
              }
            }
          } else {
            // User is not logged in, Firestore call is skipped
            fireswapSetting.lock = false;
            // Reset saving flags because the .finally() from setDoc won't be called
            if (store.saving && typeof store.saving === 'object') {
              // Using setTimeout to ensure UI can briefly show spinner
              setTimeout(() => {
                Object.keys(store.saving).forEach((k) => (store.saving[k] = false));
              }, 50); // Adjust as necessary
            }
          }
        }, debouncems);
        store.$subscribe(
          (mutation: SubscriptionCallbackMutation<StateTree>, state: StateTree) => {
            if (fireswapSetting.lock) {
              return;
            }
            fireswapSetting.uploadDocument?.(JSON.parse(JSON.stringify(state)));
          },
          { detached: true, deep: true }
        );
      }
    });
    storeExt.firebindAll = () => {
      Object.values(storeExt.firebind || {}).forEach((bindFn) => bindFn());
    };
    storeExt.fireunbindAll = () => {
      Object.values(storeExt.fireunbind || {}).forEach((unbindFn) => unbindFn());
    };
  }
}
