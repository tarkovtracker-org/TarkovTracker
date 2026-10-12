// Nuxt resolves this installed adapter through the alias in nuxt.config.ts; Fallow cannot
// resolve that transitive package subpath. Typecheck and the compiled-workerd test verify it.
// fallow-ignore-next-line unresolved-import
import nitroWorker from 'nitropack/presets/cloudflare/runtime/cloudflare-pages';
import { legacyApiRetirementResponse } from '@/server/utils/legacyApiRetirement';
// Nitro's Pages adapter buffers request bodies before middleware. Retired addresses must
// terminate before that adapter; all other requests retain Nitro's existing implementation.
export default {
  ...nitroWorker,
  async fetch(...args: Parameters<typeof nitroWorker.fetch>) {
    const response = legacyApiRetirementResponse(args[0]);
    return response ?? nitroWorker.fetch(...args);
  },
};
