import { defineEventHandler, setResponseHeaders } from 'h3';
import { readTarkovCacheMeta } from '~/server/utils/tarkovCachePurge';
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
  Vary: 'Origin',
};
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, CACHE_HEADERS);
  return readTarkovCacheMeta(event);
});
