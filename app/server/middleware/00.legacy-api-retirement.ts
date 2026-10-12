import { defineEventHandler, getRequestURL, sendWebResponse } from 'h3';
import { legacyApiRetirementResponse } from '@/server/utils/legacyApiRetirement';
// Nitro sorts middleware filenames: terminate before api-protection and the SPA renderer.
export default defineEventHandler((event) => {
  const response = legacyApiRetirementResponse({
    url: getRequestURL(event, { xForwardedHost: false, xForwardedProto: false }).href,
    method: event.method,
    headers: event.headers,
  });
  if (response) return sendWebResponse(event, response);
});
