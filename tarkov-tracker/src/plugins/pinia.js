// Pinia store
import { createPinia } from "pinia";
import { PiniaFireswap } from "./pinia-firestore";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { markInitialized } from "./store-initializer";

const pinia = createPinia();
pinia.use(PiniaFireswap);
pinia.use(piniaPluginPersistedstate);

// Mark the store system as initialized after a short delay to ensure everything is ready
setTimeout(() => {
  markInitialized();
  console.debug("Pinia store system marked as initialized");
}, 100);

export default pinia;
