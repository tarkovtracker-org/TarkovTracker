import {
  defineEventHandler,
  getRequestHost,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from 'h3';
import { useRuntimeConfig } from '#imports';
import { clientLogRequestStream } from '@/server/utils/clientLogRequestStream';
import { readProgressDiagnosticBody } from '@/server/utils/progressDiagnosticBody';
import { getProxyAwareClientIdentifier } from '@/server/utils/requestIdentity';
import {
  consumeSharedRateLimit,
  createSharedCacheHandle,
  getRateLimiterBinding,
  type SharedRateLimitStub,
} from '@/server/utils/sharedEdgeStore';
import { clientProgressDiagnostic } from '@/utils/progressDiagnosticEvent';
import type { ApiProtectionConfig } from '@/server/middleware/api-protection';
const collectorBinding = (event: H3Event): SharedRateLimitStub | null => {
  const binding = event.context.cloudflare?.env?.PROGRESS_DIAGNOSTICS as
    Partial<SharedRateLimitStub> | undefined;
  return typeof binding?.fetch === 'function' ? (binding as SharedRateLimitStub) : null;
};
const isCanonicalPath = (event: H3Event): boolean => {
  const path = event.node.req.originalUrl ?? event.node.req.url ?? '';
  return path.split('?')[0] === '/api/logs/progress';
};
const isProtectedHost = (event: H3Event, appUrl: unknown): boolean => {
  if (typeof appUrl !== 'string') return false;
  const canonical = new URL(appUrl);
  return (
    canonical.protocol === 'https:' &&
    getRequestHost(event, { xForwardedHost: false }).toLowerCase() === canonical.host
  );
};
const permitDiagnostic = async (event: H3Event): Promise<boolean> => {
  const config = useRuntimeConfig(event) as ReturnType<typeof useRuntimeConfig> &
    ApiProtectionConfig;
  if (!isProtectedHost(event, config.public?.appUrl)) return false;
  const limiter = getRateLimiterBinding(event);
  if (!limiter) return false;
  const handle = createSharedCacheHandle(config.public?.appUrl, limiter);
  const identity = getProxyAwareClientIdentifier(event, Boolean(config.apiProtection?.trustProxy));
  let failed = false;
  const allowed = await consumeSharedRateLimit(
    handle,
    'progress-diagnostics-rate',
    `progress-diagnostics:ip:${identity}`,
    10,
    60_000,
    () => {
      failed = true;
    }
  );
  return allowed && !failed;
};
const deliverDiagnostic = async (event: H3Event): Promise<void> => {
  if (!isCanonicalPath(event)) return;
  const collector = collectorBinding(event);
  if (!collector || !(await permitDiagnostic(event))) return;
  const body = await readProgressDiagnosticBody(clientLogRequestStream(event));
  const payload = clientProgressDiagnostic(body);
  // Fresh constant URL and headers: never forward the browser Request, cf metadata or headers.
  const response = await collector.fetch('https://progress-diagnostics.internal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await response.body?.cancel();
};
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
  setResponseStatus(event, 204);
  try {
    await deliverDiagnostic(event);
  } catch {
    // Diagnostics are best-effort. Never log errors that may contain request contents or identity.
  }
  return null;
});
