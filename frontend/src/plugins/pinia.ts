import { createPinia, type Pinia } from 'pinia';
import { PiniaFireswap } from './pinia-firestore';
import { markInitialized } from './store-initializer';
// Singleton guard for Pinia instance
let piniaInstance: Pinia | null = null;
const getPinia = () => {
  if (piniaInstance) {
    console.warn('Pinia is being initialized more than once!');
    return piniaInstance;
  }
  const pinia: Pinia = createPinia();
  pinia.use(PiniaFireswap);
  setTimeout(() => {
    markInitialized();
    console.debug('Pinia store system marked as initialized');
  }, 100);
  piniaInstance = pinia;
  return pinia;
};
export default getPinia();
