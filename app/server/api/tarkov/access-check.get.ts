import { defineEventHandler, setResponseHeader } from 'h3';
// Cloudflare must protect this path with the data rule. This response is not an
// application authorization token and makes no upstream or database requests.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store');
  return { ok: true };
});
