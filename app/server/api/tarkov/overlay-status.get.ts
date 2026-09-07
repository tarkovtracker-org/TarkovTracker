import { getPrecomputedStore } from '~/server/utils/precomputedTarkov';
export default defineEventHandler(async (event) => {
  const store = getPrecomputedStore(event);
  const manifest = await store?.get('overlay-precompute-manifest-json-v4', 'json');
  if (!manifest)
    throw createError({ statusCode: 503, statusMessage: 'Precompute manifest unavailable' });
  setHeader(event, 'Cache-Control', 'no-store');
  return manifest;
});
