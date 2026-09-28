import {
  createError,
  defineEventHandler,
  getMethod,
  getRequestHeader,
  getRequestWebStream,
  readRawBody,
  setResponseHeader,
  type H3Event,
} from 'h3';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '@/server/utils/logger';
import { getClientAddress } from '@/server/utils/requestIdentity';
import {
  consumeSharedRateLimitWithReset,
  createSharedCacheHandle,
  getRateLimiterBinding,
} from '@/server/utils/sharedEdgeStore';
import {
  resolveTarkovAccessServerConfig,
  toPositiveInteger,
} from '@/server/utils/tarkovAccessConfig';
import { verifyTurnstileTokenStrict } from '@/server/utils/turnstile';
import type { ApiProtectionConfig } from '@/server/middleware/api-protection';
import type { StrictTurnstileFailureReason } from '@/server/utils/turnstile';
const logger = createLogger('TarkovVerify');
/**
 * POST /api/security/tarkov-verify — strict Siteverify relay for the Tarkov-data
 * browser-clearance handoff (contract in app/utils/tarkovApiFetch.ts).
 *
 * Hard rules, all fail-closed:
 * - The endpoint MINTS NO clearance. It only validates the widget token with Cloudflare
 *   siteverify; release happens when the browser re-probes /api/tarkov/access-check and
 *   Cloudflare itself stops mitigating (the cf_clearance stays Cloudflare-owned).
 * - Gate not fully strict-configured → 503 before touching the body: the token-verify
 *   surface only exists when a verification secret is actually deployed.
 * - Siteverify transport/server/malformed-success failure → 503 (never a bare
 *   "internal-error" 500, never ok) so the client parks instead of wrongly proceeding.
 * - Token/origin/action rejections → 4xx with static messages; the token is never
 *   echoed back or logged.
 * - Request body is capped at MAX_REQUEST_BODY_BYTES and read through a bounded
 *   chunk-wise reader: the installed h3@1.15.x does not export h3-v2's
 *   `assertBodySize`, so the cap is enforced while consuming the stream itself, and
 *   the reader is cancelled past the cap instead of buffering the whole payload.
 */
const TARKOV_VERIFY_RATE_LIMIT_PREFIX = 'tarkov-verify-rate';
const TARKOV_VERIFY_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_TARKOV_VERIFY_RATE_LIMIT_PER_MINUTE = 10;
const RETRY_AFTER_WINDOW_CAP_SECONDS = 60;
/** Turnstile tokens are ≤ ~2KB; 16 KiB bounds the whole JSON envelope with slack. */
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
// strict-context token rejections are client errors (400/403); outage-class reasons
// surface as 503 through the disruption branch of `throwVerificationFailure`.
const VERIFICATION_FAILURE_STATUS: Record<StrictTurnstileFailureReason, number> = {
  'missing-token': 400,
  'oversized-token': 400,
  'invalid-token': 403,
  'replayed-token': 403,
  'expired-token': 403,
  'hostname-mismatch': 403,
  'action-mismatch': 403,
  'siteverify-unavailable': 503,
  'siteverify-malformed': 503,
};
const SITEVERIFY_DISRUPTION_REASONS = new Set<StrictTurnstileFailureReason>([
  'siteverify-unavailable',
  'siteverify-malformed',
]);
interface TarkovVerifyRuntimeConfig extends ApiProtectionConfig {
  tarkovAccessSecretKey?: unknown;
  tarkovAccessExpectedHostnames?: unknown;
  tarkovVerifyRateLimitPerMinute?: unknown;
}
const logRateLimitCacheError = (failure: {
  action: 'read' | 'write';
  error: unknown;
  key: string;
  prefix: string;
}): void => {
  logger.warn('Tarkov verify rate-limit cache operation failed', {
    action: failure.action,
    error: failure.error instanceof Error ? failure.error.message : String(failure.error),
    key: failure.key,
    prefix: failure.prefix,
  });
};
const assertPostMethod = (event: H3Event): void => {
  if (getMethod(event) !== 'POST') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed',
      message: 'Verification endpoint accepts POST only',
    });
  }
};
const assertJsonContentType = (event: H3Event): void => {
  const mediaType = (getRequestHeader(event, 'content-type') ?? '').split(';')[0] ?? '';
  if (mediaType.trim().toLowerCase() !== 'application/json') {
    throw createError({
      statusCode: 415,
      statusMessage: 'Unsupported Media Type',
      message: 'Verification requires a JSON body',
    });
  }
};
type LimitedBodyRead =
  { status: 'ok'; text: string } | { status: 'oversize' } | { status: 'unreadable' };
type ChunkedBodyRead = { status: 'ok'; text: string } | { status: 'oversize' };
/**
 * Consumes the reader chunk by chunk; the byte cap is enforced against received bytes,
 * and the caller cancels the reader on `oversize`, so the upstream inflow stops beyond
 * the cap instead of the whole payload ever being buffered.
 */
const readChunkedText = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number
): Promise<ChunkedBodyRead> => {
  const decoder = new TextDecoder('utf-8');
  let receivedBytes = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { status: 'ok', text: text + decoder.decode() };
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) return { status: 'oversize' };
    text += decoder.decode(value, { stream: true });
  }
};
/** Bounded fallback for runtimes that expose the body only as a buffered raw body. */
const readRawBufferFallback = async (
  event: H3Event,
  maxBytes: number
): Promise<LimitedBodyRead> => {
  const rawBody = await readRawBody(event, false).catch(() => null);
  if (!rawBody) return { status: 'unreadable' };
  if (rawBody.byteLength > maxBytes) return { status: 'oversize' };
  return { status: 'ok', text: new TextDecoder('utf-8').decode(rawBody) };
};
const readBodyTextWithLimit = async (
  event: H3Event,
  maxBytes: number
): Promise<LimitedBodyRead> => {
  // Cheap header rejection first; the enforced stream read below does not trust the
  // header to cap a CHUNKED body, so a lying content-length cannot bypass the limit.
  const declaredLength = Number.parseInt(getRequestHeader(event, 'content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { status: 'oversize' };
  }
  const reader = getRequestWebStream(event)?.getReader();
  if (!reader) {
    return readRawBufferFallback(event, maxBytes);
  }
  try {
    return await readChunkedText(reader as ReadableStreamDefaultReader<Uint8Array>, maxBytes);
  } catch {
    return { status: 'unreadable' };
  } finally {
    await reader.cancel().catch(() => undefined);
  }
};
const BODY_READ_FAILURE = {
  oversize: {
    statusCode: 413,
    statusMessage: 'Payload Too Large',
    message: 'Verification payload is too large',
  },
  unreadable: {
    statusCode: 400,
    statusMessage: 'Bad Request',
    message: 'Verification body is unreadable',
  },
} as const;
const readVerificationBody = async (event: H3Event): Promise<string> => {
  const read = await readBodyTextWithLimit(event, MAX_REQUEST_BODY_BYTES);
  if (read.status !== 'ok') {
    const failure = BODY_READ_FAILURE[read.status];
    throw createError({
      statusCode: failure.statusCode,
      statusMessage: failure.statusMessage,
      message: failure.message,
    });
  }
  return read.text;
};
const extractVerificationToken = (bodyText: string): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Verification body is not valid JSON',
    });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Verification body must be a JSON object',
    });
  }
  const token = (parsed as Record<string, unknown>).token;
  if (typeof token !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Verification requires a string token',
    });
  }
  return token;
};
const throwVerificationFailure = (reason: StrictTurnstileFailureReason): never => {
  if (SITEVERIFY_DISRUPTION_REASONS.has(reason)) {
    logger.warn('Tarkov siteverify verification did not complete', { reason });
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Security verification is temporarily unavailable',
    });
  }
  logger.warn('Tarkov access token rejected', { reason });
  const statusCode = VERIFICATION_FAILURE_STATUS[reason];
  throw createError({
    statusCode,
    statusMessage: statusCode === 400 ? 'Bad Request' : 'Forbidden',
    message: statusCode === 400 ? 'Invalid verification request' : 'Security verification failed',
  });
};
/** A request without a resolved client address must not share one anonymous rate-limit bucket. */
const requireClientIp = (event: H3Event, config: TarkovVerifyRuntimeConfig): string => {
  const clientIp = getClientAddress(event, Boolean(config.apiProtection?.trustProxy));
  if (clientIp) return clientIp;
  logger.warn('Tarkov verify rejected: client address unavailable');
  throw createError({
    statusCode: 403,
    statusMessage: 'Forbidden',
    message: 'Security verification failed',
  });
};
/**
 * Consumes the shared strict-verify rate limit ahead of body parsing so the cheapest
 * checks act first. Resolves the client IP once for reuse as the siteverify remoteip.
 * `resetAt` (when finite) becomes an accurate capped Retry-After.
 */
const consumeVerificationRateLimit = async (
  event: H3Event,
  config: TarkovVerifyRuntimeConfig
): Promise<string> => {
  const rateLimitPerMinute = toPositiveInteger(
    config.tarkovVerifyRateLimitPerMinute,
    DEFAULT_TARKOV_VERIFY_RATE_LIMIT_PER_MINUTE
  );
  const clientIp = requireClientIp(event, config);
  const sharedCacheHandle = createSharedCacheHandle(
    config.public?.appUrl,
    getRateLimiterBinding(event)
  );
  const verdict = await consumeSharedRateLimitWithReset(
    sharedCacheHandle,
    TARKOV_VERIFY_RATE_LIMIT_PREFIX,
    `tarkov-verify:ip:${clientIp}`,
    rateLimitPerMinute,
    TARKOV_VERIFY_RATE_LIMIT_WINDOW_MS,
    logRateLimitCacheError
  );
  if (!verdict.allowed) {
    if (verdict.resetAt !== null && Number.isFinite(verdict.resetAt)) {
      setResponseHeader(
        event,
        'Retry-After',
        Math.min(
          RETRY_AFTER_WINDOW_CAP_SECONDS,
          Math.max(1, Math.ceil((verdict.resetAt - Date.now()) / 1000))
        )
      );
    }
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: 'Too many verification attempts',
    });
  }
  return clientIp;
};
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store');
  assertPostMethod(event);
  const typedConfig = useRuntimeConfig(event) as unknown as TarkovVerifyRuntimeConfig;
  // Fail closed before any body is consumed: an incomplete strict config cannot verify
  // any token minted against it, so the only truthful answer is explicit unavailability.
  const access = resolveTarkovAccessServerConfig(typedConfig);
  if (!access.enabled) {
    logger.warn('Tarkov verify unavailable: strict access config incomplete', {
      flagEnabled: access.flagEnabled,
    });
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Tarkov access verification is not available',
    });
  }
  assertJsonContentType(event);
  const clientIp = await consumeVerificationRateLimit(event, typedConfig);
  const token = extractVerificationToken(await readVerificationBody(event));
  const verification = await verifyTurnstileTokenStrict({
    secretKey: access.secretKey,
    token,
    expectedAction: access.expectedAction,
    expectedHostnames: access.expectedHostnames,
    remoteIp: clientIp,
  });
  if (!verification.ok) {
    throwVerificationFailure(verification.reason);
  }
  return { ok: true };
});
