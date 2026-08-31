import { validateToken } from './auth';
import { ABUSE_GATE_PERIOD_SEC, DAILY_WINDOW_SEC, TIER_LIMITS, upgradeMessage } from './limits';
import { rateLimit } from './rateLimiter';
import { errorResponse, rateLimitHeaders, retryAfterSeconds } from './responses';
import { resolveTier } from './services/supporter';
import { recordUsage } from './services/usage';
import type { RateLimitResult } from './rateLimiter';
import type { ApiToken, Env, Permission } from './types';
type Action = 'progress-read' | 'progress-write' | 'token-info';
type UsageKind = 'read' | 'write';
type ApiTier = Awaited<ReturnType<typeof resolveTier>>;
type AuthSuccess = {
  validation: { valid: true; token: ApiToken };
  rlHeaders: Record<string, string>;
};
export type AuthenticationContext = {
  action: Action;
  ctx?: ExecutionContext;
  env: Env;
  envOrigin?: string;
  permission: Permission;
  rawToken: string;
  request: Request;
  requestOrigin?: string;
  userAgent?: string | null;
};
async function hashIp(ip: string, secret?: string): Promise<string | null> {
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function sanitizeLogValue(value: unknown, redactions: string[]): string {
  let sanitized: string;
  try {
    sanitized = String(value);
  } catch {
    return 'Unknown';
  }
  sanitized = sanitized.slice(0, 256);
  for (const redaction of redactions) {
    if (redaction.length === 0 || redaction.length > sanitized.length) continue;
    const escaped = redaction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sanitized = sanitized.replace(new RegExp(escaped, 'gi'), '[redacted]');
  }
  return sanitized.slice(0, 200);
}
function readErrorProperty(error: Error, property: 'name' | 'message'): unknown {
  try {
    return error[property];
  } catch {
    return 'Unknown';
  }
}
function errorInfo(
  error: unknown,
  redactions: string[]
): { error_name: string; error_message: string } {
  try {
    if (error instanceof Error) {
      return {
        error_name: sanitizeLogValue(readErrorProperty(error, 'name'), redactions),
        error_message: sanitizeLogValue(readErrorProperty(error, 'message'), redactions),
      };
    }
  } catch {
    return { error_name: 'Unknown', error_message: 'Unknown' };
  }
  return {
    error_name: sanitizeLogValue(typeof error, redactions),
    error_message: sanitizeLogValue(error, redactions),
  };
}
function createIpHashGetter(clientIp: string, secret?: string): () => Promise<string | null> {
  let cached: Promise<string | null> | null = null;
  return () => {
    cached ??= hashIp(clientIp, secret).catch(() => null);
    return cached;
  };
}
async function enforceAbuseGate(context: AuthenticationContext): Promise<Response | null> {
  const clientIp = context.request.headers.get('CF-Connecting-IP')?.trim() || null;
  if (!clientIp || !context.env.API_ABUSE_LIMITER) return null;
  const getIpHash = createIpHashGetter(clientIp, context.env.IP_HASH_SECRET);
  let result: { success: boolean } | null = null;
  try {
    result = await context.env.API_ABUSE_LIMITER.limit({ key: 'api:' + clientIp });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'abuse_gate_unavailable',
        action: context.action,
        ip_hash: await getIpHash(),
        reason: 'binding_error',
        ...errorInfo(error, [clientIp]),
      })
    );
  }
  if (!result || result.success) return null;
  console.warn(
    JSON.stringify({
      event: 'abuse_gate_429',
      action: context.action,
      ip_hash: await getIpHash(),
    })
  );
  return errorResponse('Too many requests', 429, context.envOrigin, context.requestOrigin, {
    'Retry-After': String(ABUSE_GATE_PERIOD_SEC),
  });
}
function trackUsage(
  context: AuthenticationContext,
  token: ApiToken,
  tier: ApiTier,
  kind: UsageKind,
  throttled: boolean
): void {
  const promise = recordUsage(context.env, {
    userId: token.user_id,
    tokenId: token.token_id,
    tier,
    kind,
    throttled,
    userAgent: context.userAgent ?? null,
  });
  context.ctx?.waitUntil(promise);
}
function unavailableQuotaResult(
  context: AuthenticationContext,
  token: ApiToken,
  tier: ApiTier,
  kind: UsageKind,
  daily: RateLimitResult
): AuthSuccess {
  console.warn(
    JSON.stringify({
      event: 'daily_quota_unavailable',
      action: context.action,
      user_id: token.user_id,
      token_id: token.token_id,
      reason: daily.reason,
    })
  );
  trackUsage(context, token, tier, kind, false);
  return { validation: { valid: true, token }, rlHeaders: {} };
}
function exceededQuotaResponse(
  context: AuthenticationContext,
  token: ApiToken,
  tier: ApiTier,
  kind: UsageKind,
  daily: RateLimitResult,
  headers: Record<string, string>
): Response {
  trackUsage(context, token, tier, kind, true);
  console.warn(
    JSON.stringify({
      event: 'daily_quota_429',
      action: context.action,
      kind,
      user_id: token.user_id,
      token_id: token.token_id,
      retry_after_s: typeof daily.resetAt === 'number' ? retryAfterSeconds(daily.resetAt) : null,
    })
  );
  const message = tier === 'free' ? upgradeMessage(kind) : daily.message || 'Rate limit exceeded';
  return errorResponse(message, 429, context.envOrigin, context.requestOrigin, headers);
}
async function enforceDailyQuota(
  context: AuthenticationContext,
  token: ApiToken
): Promise<AuthSuccess | Response> {
  const kind: UsageKind = context.action === 'progress-write' ? 'write' : 'read';
  const tier = await resolveTier(context.env, token.user_id);
  const limits = TIER_LIMITS[tier];
  const limit = kind === 'write' ? limits.writesPerDay : limits.readsPerDay;
  const daily = await rateLimit(
    context.env,
    'daily-' + kind + ':' + token.user_id,
    limit,
    DAILY_WINDOW_SEC,
    { anchor: 'utc-day' }
  );
  const headers = rateLimitHeaders(daily);
  if (daily.allowed) {
    trackUsage(context, token, tier, kind, false);
    return { validation: { valid: true, token }, rlHeaders: headers };
  }
  return daily.unavailable
    ? unavailableQuotaResult(context, token, tier, kind, daily)
    : exceededQuotaResponse(context, token, tier, kind, daily, headers);
}
export async function authenticateAndRateLimit(
  context: AuthenticationContext
): Promise<AuthSuccess | Response> {
  const abuseResponse = await enforceAbuseGate(context);
  if (abuseResponse) return abuseResponse;
  const validation = await validateToken(context.env, context.rawToken, context.permission);
  if (!validation.valid) {
    return errorResponse(
      validation.error,
      validation.status,
      context.envOrigin,
      context.requestOrigin
    );
  }
  return enforceDailyQuota(context, validation.token);
}
