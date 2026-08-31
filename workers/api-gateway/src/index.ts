import { handleGatewayRequest } from './router';
import type { Env } from './types';
export { ApiGatewayRateLimiter } from './rateLimiter';
export type { RateLimitState } from './rateLimiter';
export default {
  fetch: handleGatewayRequest,
} satisfies ExportedHandler<Env>;
