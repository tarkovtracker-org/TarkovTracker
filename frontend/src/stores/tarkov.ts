import { defineStore } from 'pinia';
import { watch } from 'vue';
import { fireuser, firestore } from '@/plugins/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getters, actions, defaultState, type UserState, type UserActions } from '@/shared_state';
import { initializeStore, wasDataMigrated } from '@/plugins/store-initializer';
import type { Pinia } from 'pinia';
import type { StoreWithFireswapExt } from '@/plugins/pinia-firestore';

// Define the Fireswap configuration type
interface FireswapConfig {
  path: string;
  document: string;
  debouncems: number;
  localKey: string;
}
// Define the store, letting Pinia infer the type
// Cast getters/actions to any for now due to JS import
export const useTarkovStore = defineStore('swapTarkov', {
  state: () => JSON.parse(JSON.stringify(defaultState)) as UserState,
  getters: getters,
  actions: {
    ...(actions as UserActions),
    async resetOnlineProfile() {
      if (!fireuser.uid) {
        console.error('User not logged in. Cannot reset online profile.');
        return;
      }
      const userProgressRef = doc(firestore, 'progress', fireuser.uid);
      try {
        // Set the Firestore document to a fresh defaultState
        const freshDefaultState = JSON.parse(JSON.stringify(defaultState));
        await setDoc(userProgressRef, freshDefaultState);
        // Reset the local Pinia store state to default using $patch
        // This ensures the in-memory state reflects the reset immediately.
        this.$patch(JSON.parse(JSON.stringify(defaultState)));
        console.log(
          'Online profile and local Pinia state reset. localStorage may update via fireswap.'
        );
      } catch (error) {
        console.error('Error resetting online profile:', error);
      }
    },
  },
  fireswap: [
    {
      path: '.',
      document: 'progress/{uid}',
      debouncems: 250,
      localKey: 'progress',
    },
  ] as FireswapConfig[],
});
// Type the store instance based on Pinia's inferred type
type TarkovStoreType = ReturnType<typeof useTarkovStore>;
// Type the store instance potentially returned by initializeStore
type StoreInstance = TarkovStoreType | null;
const getSafeStoreInstance = async (_piniaInstance?: Pinia): Promise<StoreInstance> => {
  try {
    const store = await initializeStore('tarkov', useTarkovStore);
    if (store && typeof store.$id === 'string') {
      return store as TarkovStoreType; // Cast to the inferred store type
    }
    console.warn('initializeStore did not return a valid store instance.');
    return null;
  } catch (error) {
    console.error('Could not initialize tarkov store:', error);
    return null;
  }
};
let watchHandlerRunning = false;
watch(
  () => fireuser.loggedIn,
  async (newValue: boolean) => {
    if (watchHandlerRunning) {
      return;
    }
    watchHandlerRunning = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const tarkovStore = await getSafeStoreInstance();
      if (!tarkovStore) {
        console.warn('Cannot bind/unbind store - store instance is null');
        watchHandlerRunning = false;
        return;
      }
      const extendedStore = tarkovStore as StoreWithFireswapExt<TarkovStoreType>;
      if (newValue) {
        const wasMigrated =
          wasDataMigrated() || sessionStorage.getItem('tarkovDataMigrated') === 'true';
        if (wasMigrated) {
          if (typeof extendedStore.firebindAll === 'function') {
            extendedStore.firebindAll();
          }
        } else {
          if (typeof extendedStore.firebindAll === 'function') {
            console.debug('Binding remoteTarkov store');
            extendedStore.firebindAll();
          } else {
            console.debug('No remoteTarkov store to bind');
          }
        }
      } else {
        if (typeof extendedStore.fireunbindAll === 'function') {
          console.debug('Unbinding remoteTarkov store');
          extendedStore.fireunbindAll();
        } else {
          console.debug('No remoteTarkov store to unbind');
        }
      }
    } catch (error) {
      console.error('Error in fireuser watch handler:', error);
    } finally {
      watchHandlerRunning = false;
    }
  },
  { immediate: false }
);
setTimeout(async () => {
  try {
    console.debug('Starting delayed initialization of tarkovStore');
    const tarkovStore = await getSafeStoreInstance();
    if (!tarkovStore) {
      throw new Error('Failed to get tarkovStore in delayed initialization');
    }
    const extendedStore = tarkovStore as StoreWithFireswapExt<TarkovStoreType>;
    const wasMigrated =
      wasDataMigrated() || sessionStorage.getItem('tarkovDataMigrated') === 'true';
    if (wasMigrated) {
      if (typeof extendedStore.firebindAll === 'function') {
        extendedStore.firebindAll();
      }
    } else if (fireuser.loggedIn && typeof extendedStore.firebindAll === 'function') {
      extendedStore.firebindAll();
    }
  } catch (error) {
    console.error('Error in delayed store initialization:', error);
  }
}, 500);
