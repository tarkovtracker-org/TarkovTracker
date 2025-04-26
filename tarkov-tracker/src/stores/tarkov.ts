import { defineStore } from 'pinia';
import { watch } from 'vue';
import { fireuser } from '@/plugins/firebase';
import { getters, actions, defaultState } from '@/shared_state';
import { initializeStore, wasDataMigrated } from '@/plugins/store-initializer';
import type { Pinia } from 'pinia';

console.log('swapTarkov store defined');

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
  state: () => JSON.parse(JSON.stringify(defaultState)),
  getters: getters as any, // Cast to any - Requires shared_state.ts for proper typing
  actions: actions as any, // Cast to any - Requires shared_state.ts for proper typing
});

// Type the store instance based on Pinia's inferred type
type TarkovStoreType = ReturnType<typeof useTarkovStore>;

// Manually add the fireswap property to the store definition's prototype or instance
// This is a workaround as Pinia doesn't natively support arbitrary properties in options store
(useTarkovStore as any).fireswap = [
  {
    path: '.',
    document: 'progress/{uid}',
    debouncems: 250,
    localKey: 'progress',
  },
] as FireswapConfig[];

// Type the store instance potentially returned by initializeStore
type StoreInstance = TarkovStoreType | null;

const getSafeStoreInstance = async (
  piniaInstance?: Pinia
): Promise<StoreInstance> => {
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

// Watch logic remains the same, using runtime checks for firebindAll/fireunbindAll
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
      // Runtime checks for fireswap methods remain necessary
      const canBind = typeof (tarkovStore as any).firebindAll === 'function';
      const canUnbind =
        typeof (tarkovStore as any).fireunbindAll === 'function';
      if (newValue) {
        const wasMigrated =
          wasDataMigrated() ||
          sessionStorage.getItem('tarkovDataMigrated') === 'true';
        if (wasMigrated) {
          if (canBind) {
            (tarkovStore as any).firebindAll();
          }
        } else {
          if (canBind) {
            console.debug('Binding remoteTarkov store');
            (tarkovStore as any).firebindAll();
          } else {
            console.debug('No remoteTarkov store to bind');
          }
        }
      } else {
        if (canUnbind) {
          console.debug('Unbinding remoteTarkov store');
          (tarkovStore as any).fireunbindAll();
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

// setTimeout logic remains the same
setTimeout(async () => {
  try {
    console.debug('Starting delayed initialization of tarkovStore');
    const tarkovStore = await getSafeStoreInstance();
    if (!tarkovStore) {
      throw new Error('Failed to get tarkovStore in delayed initialization');
    }
    const canBind = typeof (tarkovStore as any).firebindAll === 'function';
    const wasMigrated =
      wasDataMigrated() ||
      sessionStorage.getItem('tarkovDataMigrated') === 'true';
    if (wasMigrated) {
      if (canBind) {
        (tarkovStore as any).firebindAll();
      }
    } else if (fireuser.loggedIn && canBind) {
      (tarkovStore as any).firebindAll();
    }
  } catch (error) {
    console.error('Error in delayed store initialization:', error);
  }
}, 500);
