// Pinia store
import { createPinia, type Pinia } from 'pinia'; // Import Pinia type
import { PiniaFireswap } from './pinia-firestore'; // Assume .ts conversion or types exist
import { markInitialized } from './store-initializer'; // Assume .ts conversion or types exist

// Explicitly type the pinia instance
const pinia: Pinia = createPinia();

// Use plugins - TypeScript should infer types for use() if plugins are typed correctly
pinia.use(PiniaFireswap);

// Mark the store system as initialized after a short delay to ensure everything is ready
setTimeout(() => {
  markInitialized();
  console.debug('Pinia store system marked as initialized');
}, 100);

export default pinia;
