import { defineEventHandler, setResponseHeader, setResponseStatus } from 'h3';
// Keep unknown API paths out of the SPA renderer, even when the client accepts HTML.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store');
  setResponseStatus(event, 404, 'Not Found');
  return { statusCode: 404, statusMessage: 'Not Found' };
});
