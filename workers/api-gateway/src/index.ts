import { extractBearerToken, validateToken } from './auth';
import {
  handleGetProgress,
  handleUpdateTask,
  handleUpdateTasks,
  handleUpdateLevel,
  handleUpdateObjective,
} from './handlers/progress';
import { handleGetTeamProgress } from './handlers/team';
import { handleGetToken } from './handlers/token';
import { ABUSE_GATE_PERIOD_SEC, DAILY_WINDOW_SEC, TIER_LIMITS, upgradeMessage } from './limits';
import { OPENAPI_JSON } from './openapi';
import { resolveTier } from './services/supporter';
import { recordUsage } from './services/usage';
import { logger } from './utils/logger';
import { INBOUND_USER_AGENT_MIN_LENGTH, normalizeInboundUserAgent } from './utils/userAgent';
import type {
  ApiToken,
  Env,
  Permission,
  TaskState,
  BatchTaskUpdate,
  LegacyTokenResponse,
} from './types';
/**
 * Normalize task updates to support both legacy object and array formats
 * Legacy: { "taskId1": "completed", "taskId2": "failed" }
 * New: [{ id: "taskId1", state: "completed" }, ...]
 */
function normalizeTaskUpdates(body: unknown): BatchTaskUpdate[] | null {
  if (Array.isArray(body)) {
    // New array format
    for (const item of body) {
      if (typeof item !== 'object' || !item) return null;
      const { id, state } = item as Record<string, unknown>;
      if (typeof id !== 'string' || typeof state !== 'string') return null;
      if (!['completed', 'uncompleted', 'failed'].includes(state)) return null;
    }
    return body as BatchTaskUpdate[];
  }
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    // Legacy object format: { taskId: state, ... }
    const updates: BatchTaskUpdate[] = [];
    for (const [id, state] of Object.entries(body)) {
      if (typeof state !== 'string') return null;
      if (!['completed', 'uncompleted', 'failed'].includes(state)) return null;
      updates.push({ id, state: state as TaskState });
    }
    return updates;
  }
  return null;
}
type Action = 'progress-read' | 'progress-write' | 'token-info';
type UsageKind = 'read' | 'write';
type RateLimitAnchor = 'utc-day';
type RateLimitOptions = {
  anchor?: RateLimitAnchor;
};
export type RateLimitState = {
  count: number;
  resetAt: number;
  windowSec: number;
  anchor?: RateLimitAnchor;
  ephemeral?: boolean;
};
type RateLimitResponse = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};
type LimiterUnavailableReason = 'http_status' | 'bad_json' | 'timeout' | 'fetch_error';
type RateLimitResult = {
  allowed: boolean;
  // Set when the limiter could not answer. Callers treat this as fail-open:
  // the quota is a product entitlement, not a database-integrity boundary, and
  // the pre-auth abuse gate still protects Supabase.
  unavailable?: boolean;
  reason?: LimiterUnavailableReason;
  message?: string;
  limit?: number;
  remaining?: number;
  resetAt?: number;
};
const RATE_LIMIT_TIMEOUT_MS = 3000;
const RATE_LIMIT_SLOW_MS = 200;
const DAY_MS = 86400000;
function nextUtcMidnight(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
}
// RFC 9745 Deprecation header value: structured-field Date for
// 2026-07-06T00:00:00Z, when the api.tarkovtracker.org migration shipped.
const LEGACY_API_DEPRECATION_DATE = '@1783296000';
export class ApiGatewayRateLimiter {
  private data?: RateLimitState;
  private loaded = false;
  constructor(private state: DurableObjectState) {}
  private json(body: RateLimitResponse) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  private async load() {
    if (this.loaded) return;
    try {
      const stored = await this.state.storage.get<RateLimitState>('state');
      this.loaded = true;
      this.data = stored && Date.now() < stored.resetAt ? stored : undefined;
    } catch (error) {
      logger.error('rate limiter storage load failed', { id: this.state.id.toString(), error });
      throw error;
    }
  }
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    let payload: {
      limit?: number;
      windowSec?: number;
      anchor?: string;
      retain?: boolean;
    };
    try {
      payload = (await request.json()) as {
        limit?: number;
        windowSec?: number;
        anchor?: string;
        retain?: boolean;
      };
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    const limit = Number(payload.limit);
    const windowSec = Number(payload.windowSec);
    if (!Number.isFinite(limit) || !Number.isFinite(windowSec) || limit <= 0 || windowSec <= 0) {
      return new Response('Bad Request', { status: 400 });
    }
    const anchor: RateLimitAnchor | undefined =
      payload.anchor === 'utc-day' ? 'utc-day' : undefined;
    // Cleanup is the default for high-cardinality callers (Pages, legacy, unknown).
    // Authenticated gateway quotas opt in to long retention via retain: true so a
    // Worker-first deploy never drops cleanup for keys that omit the flag.
    const ephemeral = payload.retain !== true;
    await this.load();
    const now = Date.now();
    const windowMs = windowSec * 1000;
    // Sliding-window state written by earlier deployments carries `mode` and
    // `timestamps`. It is treated as a config change and replaced with a fresh
    // fixed window rather than migrated.
    const configChanged =
      !this.data ||
      this.data.windowSec !== windowSec ||
      this.data.anchor !== anchor ||
      'timestamps' in this.data;
    if (configChanged || now >= this.data!.resetAt) {
      const resetAt = anchor === 'utc-day' ? nextUtcMidnight(now) : now + windowMs;
      this.data = { count: 0, resetAt, windowSec, anchor, ...(ephemeral && { ephemeral: true }) };
    } else if (ephemeral) {
      // Re-stamp cleanup eligibility on an existing window so a pre-flag stored
      // state still reschedules when its alarm fires mid-window.
      this.data!.ephemeral = true;
    }
    if (ephemeral) await this.scheduleCleanup(this.data!.resetAt);
    if (this.data!.count >= limit) {
      return this.json({
        allowed: false,
        remaining: 0,
        resetAt: this.data!.resetAt,
      });
    }
    this.data!.count += 1;
    await this.state.storage.put('state', this.data);
    return this.json({
      allowed: true,
      remaining: Math.max(limit - this.data!.count, 0),
      resetAt: this.data!.resetAt,
    });
  }
  // Schedule self-cleanup by default for high-cardinality keys (IP-derived,
  // requester-target-mode combinations from Pages endpoints) so abandoned
  // objects do not retain billable storage forever. The alarm fires shortly
  // after the window resets and wipes all storage.
  // Bounded authenticated keys (daily-* keyed by user_id) pass retain: true
  // so they skip alarms; load() treats expired state as absent
  // for rate-limiting correctness.
  // Alarms from previous deployments without the ephemeral flag in stored
  // state are drained without rescheduling while the window is still active.
  private async scheduleCleanup(resetAt: number): Promise<void> {
    const cleanupAt = resetAt + 1000;
    const existingAlarm = await this.state.storage.getAlarm();
    if (existingAlarm !== cleanupAt) {
      await this.state.storage.setAlarm(cleanupAt);
    }
  }
  async alarm(): Promise<void> {
    try {
      const stored = await this.state.storage.get<RateLimitState>('state');
      const now = Date.now();
      if (stored && now < stored.resetAt) {
        if (stored.ephemeral === true) {
          await this.state.storage.setAlarm(stored.resetAt + 1000);
          return;
        }
        this.data = undefined;
        this.loaded = false;
        return;
      }
      this.data = undefined;
      this.loaded = false;
      await this.state.storage.deleteAlarm();
      await this.state.storage.deleteAll();
    } catch (error) {
      logger.error('rate limiter alarm cleanup failed', { id: this.state.id.toString(), error });
      throw error;
    }
  }
}
async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  const action = key.split(':', 1)[0] || 'unknown';
  const id = env.API_GATEWAY_LIMITER.idFromName(key);
  const stub = env.API_GATEWAY_LIMITER.get(id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_LIMIT_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await stub.fetch('https://rate-limit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        limit,
        windowSec,
        anchor: options?.anchor,
        retain: true,
      }),
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    if (durationMs >= RATE_LIMIT_SLOW_MS) {
      console.log('rateLimit slow', { action, durationMs, ok: res.ok });
    }
    if (!res.ok) {
      return {
        allowed: false,
        unavailable: true,
        reason: 'http_status',
        message: 'Rate limiter unavailable',
      };
    }
    let data: { allowed?: boolean; remaining?: number; resetAt?: number } = {};
    try {
      data = (await res.json()) as {
        allowed?: boolean;
        remaining?: number;
        resetAt?: number;
      };
    } catch {
      return {
        allowed: false,
        unavailable: true,
        reason: 'bad_json',
        message: 'Rate limiter unavailable',
      };
    }
    const remaining = typeof data.remaining === 'number' ? data.remaining : undefined;
    const resetAt = typeof data.resetAt === 'number' ? data.resetAt : undefined;
    const now = Date.now();
    if (
      (data.allowed !== true && data.allowed !== false) ||
      remaining === undefined ||
      !Number.isInteger(remaining) ||
      remaining < 0 ||
      remaining > limit ||
      (data.allowed === false ? remaining !== 0 : remaining >= limit) ||
      resetAt === undefined ||
      !Number.isFinite(resetAt) ||
      resetAt <= now ||
      resetAt > now + windowSec * 1000
    ) {
      return {
        allowed: false,
        unavailable: true,
        reason: 'bad_json',
        message: 'Rate limiter unavailable',
      };
    }
    if (data.allowed === false) {
      return {
        allowed: false,
        message: 'Rate limit exceeded',
        limit,
        remaining: remaining ?? 0,
        resetAt,
      };
    }
    return { allowed: true, limit, remaining, resetAt };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('rateLimit timeout', { action, durationMs, timeoutMs: RATE_LIMIT_TIMEOUT_MS });
      return {
        allowed: false,
        unavailable: true,
        reason: 'timeout',
        message: 'Rate limiter unavailable',
      };
    }
    console.error('rateLimit error', { action, durationMs, error });
    return {
      allowed: false,
      unavailable: true,
      reason: 'fetch_error',
      message: 'Rate limiter unavailable',
    };
  } finally {
    clearTimeout(timeout);
  }
}
function resolveOrigin(envOrigin?: string, requestOrigin?: string): string {
  if (!envOrigin || envOrigin === '*') return '*';
  const list = envOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!list.length) return '*';
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return list[0];
}
function corsHeaders(envOrigin?: string, requestOrigin?: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(envOrigin, requestOrigin),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers':
      'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
  };
}
function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}
function rateLimitHeaders(rl: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof rl.limit === 'number') {
    headers['X-RateLimit-Limit'] = String(rl.limit);
  }
  if (typeof rl.remaining === 'number') {
    headers['X-RateLimit-Remaining'] = String(rl.remaining);
  }
  if (typeof rl.resetAt === 'number') {
    headers['X-RateLimit-Reset'] = String(Math.ceil(rl.resetAt / 1000));
    if (!rl.allowed) {
      headers['Retry-After'] = String(retryAfterSeconds(rl.resetAt));
    }
  }
  return headers;
}
function docsResponse(envOrigin?: string, requestOrigin?: string): Response {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TarkovTracker API Docs</title>
    <link rel="icon" href="https://tarkovtracker.org/favicon.ico" />
  </head>
  <body style="margin:0;min-height:100vh;background:#0e0f12;">
    <div id="app"></div>
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.43.1"
      integrity="sha384-HjTUYHbvChA/watX+X7iQtuhwMhsCYU600qyfXPYC90fYr/2Y/Mg7ybHlvkp+eUW"
      crossorigin="anonymous"
    ></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/openapi.json'
      });
    </script>
  </body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
    },
  });
}
function openApiResponse(envOrigin?: string, requestOrigin?: string): Response {
  return new Response(OPENAPI_JSON, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
/**
 * Create a flat response for token endpoint (legacy format - no data wrapper)
 */
function tokenFlatResponse(
  tokenData: LegacyTokenResponse,
  envOrigin?: string,
  requestOrigin?: string,
  extraHeaders?: Record<string, string>
): Response {
  const body = { success: true, ...tokenData };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  });
}
/**
 * Create a success response with legacy envelope format
 */
function successResponse(
  data: unknown,
  meta?: Record<string, unknown>,
  status = 200,
  envOrigin?: string,
  requestOrigin?: string,
  extraHeaders?: Record<string, string>
): Response {
  const body: Record<string, unknown> = { success: true };
  // If data has its own data/meta structure, flatten it
  if (data && typeof data === 'object' && 'data' in data) {
    body.data = (data as Record<string, unknown>).data;
    body.meta = (data as Record<string, unknown>).meta || meta;
  } else {
    body.data = data;
    if (meta) body.meta = meta;
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  });
}
/**
 * Create an error response with legacy envelope format
 */
function errorResponse(
  error: string,
  status = 500,
  envOrigin?: string,
  requestOrigin?: string,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  });
}
type AuthSuccess = {
  validation: { valid: true; token: ApiToken };
  rlHeaders: Record<string, string>;
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
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
function sanitizeLogValue(value: unknown, redactions: string[]): string {
  let sanitized: string;
  try {
    sanitized = String(value);
  } catch {
    return 'Unknown';
  }
  // Cap before redaction but leave headroom beyond the final 200-char limit so
  // an IP straddling the boundary is fully present for replacement (a partial
  // match would leak a fragment). 256 = 200 + max IPv6 length (45) with margin.
  sanitized = sanitized.slice(0, 256);
  for (const redaction of redactions) {
    if (redaction.length === 0 || redaction.length > sanitized.length) continue;
    // Case-insensitive: a rate-limit binding may canonicalize an IPv6 address's
    // hex digits to a different case before echoing it in an exception, so an
    // exact match would leave the normalized form in the log.
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
async function authenticateAndRateLimit(
  env: Env,
  request: Request,
  rawToken: string,
  permission: Permission,
  action: Action,
  envOrigin?: string,
  requestOrigin?: string,
  ctx?: ExecutionContext,
  userAgent?: string | null
): Promise<AuthSuccess | Response> {
  // Pre-authentication abuse gate: keyed on CF-Connecting-IP to shield
  // the api_tokens lookup (and therefore Supabase) from token-rotation floods.
  // Counters are per-Cloudflare-location and eventually consistent — this is
  // infrastructure protection, not a customer quota.
  const clientIp = request.headers.get('CF-Connecting-IP')?.trim() || null;
  if (clientIp && env.API_ABUSE_LIMITER) {
    // Fail open: the abuse gate is infrastructure protection for Supabase,
    // not a customer quota. A binding/runtime failure must not turn into a
    // 500 outage for valid requests — the daily quota still enforces the
    // customer entitlement downstream. Log the HMAC-hashed IP only: raw IPs
    // must never reach Worker logs (see docs/RATE_LIMITING.md).
    const getIpHash = (() => {
      let cached: Promise<string | null> | null = null;
      return () => {
        if (!cached) {
          cached = hashIp(clientIp, env.IP_HASH_SECRET).catch(() => null);
        }
        return cached;
      };
    })();
    let abuseResult: { success: boolean } | null = null;
    try {
      abuseResult = await env.API_ABUSE_LIMITER.limit({ key: `api:${clientIp}` });
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'abuse_gate_unavailable',
          action,
          ip_hash: await getIpHash(),
          reason: 'binding_error',
          ...errorInfo(error, [clientIp]),
        })
      );
    }
    if (abuseResult && !abuseResult.success) {
      console.warn(
        JSON.stringify({
          event: 'abuse_gate_429',
          action,
          ip_hash: await getIpHash(),
        })
      );
      return errorResponse('Too many requests', 429, envOrigin, requestOrigin, {
        'Retry-After': String(ABUSE_GATE_PERIOD_SEC),
      });
    }
  }
  const validation = await validateToken(env, rawToken, permission);
  if (!validation.valid) {
    return errorResponse(validation.error, validation.status, envOrigin, requestOrigin);
  }
  const token = validation.token;
  const kind: UsageKind = action === 'progress-write' ? 'write' : 'read';
  const tier = await resolveTier(env, token.user_id);
  const limits = TIER_LIMITS[tier];
  const dailyLimit = kind === 'write' ? limits.writesPerDay : limits.readsPerDay;
  const track = (throttled: boolean) => {
    const promise = recordUsage(env, {
      userId: token.user_id,
      tokenId: token.token_id,
      tier,
      kind,
      throttled,
      userAgent: userAgent ?? null,
    });
    if (ctx) {
      ctx.waitUntil(promise);
    }
  };
  // Daily quota: a single fixed-window DO call keyed by user_id so extra
  // tokens do not multiply a user's quota. The quota counts authenticated
  // requests admitted for processing — downstream Supabase failures do not
  // trigger refunds (see docs/RATE_LIMITING.md).
  const dailyKey = `daily-${kind}:${token.user_id}`;
  const daily = await rateLimit(env, dailyKey, dailyLimit, DAILY_WINDOW_SEC, {
    anchor: 'utc-day',
  });
  const dailyHeaders = rateLimitHeaders(daily);
  if (!daily.allowed) {
    if (daily.unavailable) {
      console.warn(
        JSON.stringify({
          event: 'daily_quota_unavailable',
          action,
          user_id: token.user_id,
          token_id: token.token_id,
          reason: daily.reason,
        })
      );
      // Fail open: the daily quota is a product entitlement, not a
      // database-integrity boundary. The abuse gate still protects Supabase.
      track(false);
      return { validation, rlHeaders: {} };
    }
    track(true);
    console.warn(
      JSON.stringify({
        event: 'daily_quota_429',
        action,
        kind,
        user_id: token.user_id,
        token_id: token.token_id,
        retry_after_s: typeof daily.resetAt === 'number' ? retryAfterSeconds(daily.resetAt) : null,
      })
    );
    const message = tier === 'free' ? upgradeMessage(kind) : daily.message || 'Rate limit exceeded';
    return errorResponse(message, 429, envOrigin, requestOrigin, dailyHeaders);
  }
  track(false);
  return { validation, rlHeaders: dailyHeaders };
}
function decodeUrlParam(
  raw: string,
  label: string,
  envOrigin?: string,
  requestOrigin?: string
): string | Response {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw).trim();
  } catch {
    return errorResponse(`Invalid ${label} in URL`, 400, envOrigin, requestOrigin);
  }
  if (!decoded) {
    return errorResponse(`Missing ${label} in URL`, 400, envOrigin, requestOrigin);
  }
  return decoded;
}
async function parseJsonObjectBody(
  request: Request,
  envOrigin?: string,
  requestOrigin?: string,
  extraHeaders?: Record<string, string>
): Promise<Record<string, unknown> | Response> {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, envOrigin, requestOrigin, extraHeaders);
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    return errorResponse(
      'Invalid request body (expected object)',
      400,
      envOrigin,
      requestOrigin,
      extraHeaders
    );
  }
  return parsedBody as Record<string, unknown>;
}
export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const path = '/' + url.pathname.split('/').filter(Boolean).join('/');
    const origin = env.ALLOWED_ORIGIN;
    const reqOrigin = request.headers.get('Origin') || undefined;
    const headers = corsHeaders(origin, reqOrigin);
    const apiHost = (env.API_HOST || 'api.tarkovtracker.org').trim().toLowerCase();
    const isApiHost = host === apiHost;
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    // Health check
    if (path === '/health') {
      return successResponse(
        {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '2.0.0',
          service: 'tarkovtracker-api',
        },
        undefined,
        200,
        origin,
        reqOrigin
      );
    }
    if (isApiHost && (path === '/' || path === '/docs')) {
      return docsResponse(origin, reqOrigin);
    }
    if (isApiHost && path === '/openapi.json') {
      return openApiResponse(origin, reqOrigin);
    }
    // robots.txt — keep crawlers off the API surface; docs/openapi remain public
    if (isApiHost && path === '/robots.txt') {
      const body = 'User-agent: *\nDisallow: /\n\nSitemap: https://tarkovtracker.org/sitemap.xml\n';
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
          ...headers,
        },
      });
    }
    // Extract the API path based on host
    let apiPath: string | null = null;
    if (isApiHost) {
      // On api subdomain, support clean URLs without /api or /v2 prefix
      // Strip any existing prefix for backwards compatibility
      if (path.startsWith('/api/v2/') || path === '/api/v2') {
        apiPath = path.slice(7) || '/';
      } else if (path.startsWith('/api/') || path === '/api') {
        apiPath = path.slice(4) || '/';
      } else if (path.startsWith('/v2/') || path === '/v2') {
        apiPath = path.slice(3) || '/';
      } else {
        apiPath = path;
      }
    } else {
      // On other hosts, require /api or /api/v2 prefix
      const apiMatch = path.match(/^\/api(?:\/v2)?(.*)$/);
      if (apiMatch) {
        apiPath = apiMatch[1] || '/';
      }
    }
    if (!apiPath) {
      return new Response('Not Found', { status: 404, headers });
    }
    // Validate inbound User-Agent before any routing/redirect so legacy
    // /api and /api/v2 entrypoints cannot bypass enforcement via 308.
    const inboundUserAgent = normalizeInboundUserAgent(request.headers.get('User-Agent'));
    if (!inboundUserAgent || inboundUserAgent.length < INBOUND_USER_AGENT_MIN_LENGTH) {
      return errorResponse(
        'User-Agent must be 5-200 characters (e.g. "AppName/1.0 (+https://your-app.com)")',
        400,
        origin,
        reqOrigin
      );
    }
    // Host migration: once LEGACY_API_REDIRECT is flipped to "true",
    // legacy /api and /api/v2 routes permanently redirect to the api
    // subdomain. Clients should migrate proactively: some HTTP stacks
    // (e.g. .NET HttpClient) drop Authorization on cross-host redirects.
    if (!isApiHost && (env.LEGACY_API_REDIRECT || '').trim().toLowerCase() === 'true') {
      const target = `https://${apiHost}${apiPath}${url.search}`;
      return new Response(null, {
        status: 308,
        headers: {
          ...headers,
          Location: target,
          Deprecation: LEGACY_API_DEPRECATION_DATE,
          Link: `<${target}>; rel="successor-version"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    // Extract and validate token
    const authHeader = request.headers.get('Authorization');
    const rawToken = extractBearerToken(authHeader);
    if (!rawToken) {
      return errorResponse('Unauthorized', 401, origin, reqOrigin);
    }
    try {
      // GET /token - Token info
      if (apiPath === '/token' && request.method === 'GET') {
        const auth = await authenticateAndRateLimit(
          env,
          request,
          rawToken,
          'GP',
          'token-info',
          origin,
          reqOrigin,
          ctx,
          inboundUserAgent
        );
        if (auth instanceof Response) return auth;
        const { validation, rlHeaders } = auth;
        const tokenResponse = handleGetToken(validation.token, rawToken);
        return tokenFlatResponse(tokenResponse, origin, reqOrigin, rlHeaders);
      }
      // GET /progress - Player progress
      if (apiPath === '/progress' && request.method === 'GET') {
        const auth = await authenticateAndRateLimit(
          env,
          request,
          rawToken,
          'GP',
          'progress-read',
          origin,
          reqOrigin,
          ctx,
          inboundUserAgent
        );
        if (auth instanceof Response) return auth;
        const { validation, rlHeaders } = auth;
        const effectiveGameMode = validation.token.game_mode;
        const progress = await handleGetProgress(env, validation.token, effectiveGameMode);
        return successResponse(progress, undefined, 200, origin, reqOrigin, rlHeaders);
      }
      // GET /team/progress - Team progress (requires TP permission)
      if (apiPath === '/team/progress' && request.method === 'GET') {
        const auth = await authenticateAndRateLimit(
          env,
          request,
          rawToken,
          'TP',
          'progress-read',
          origin,
          reqOrigin,
          ctx,
          inboundUserAgent
        );
        if (auth instanceof Response) return auth;
        const { validation, rlHeaders } = auth;
        const effectiveGameMode = validation.token.game_mode;
        const teamProgress = await handleGetTeamProgress(env, validation.token, effectiveGameMode);
        return successResponse(teamProgress, undefined, 200, origin, reqOrigin, rlHeaders);
      }
      // POST /progress/level/:levelValue - Update player level
      const levelMatch = apiPath.match(/^\/progress\/level\/(\d+)$/);
      if (levelMatch && request.method === 'POST') {
        const auth = await authenticateAndRateLimit(
          env,
          request,
          rawToken,
          'WP',
          'progress-write',
          origin,
          reqOrigin,
          ctx,
          inboundUserAgent
        );
        if (auth instanceof Response) return auth;
        const { validation, rlHeaders } = auth;
        const level = parseInt(levelMatch[1], 10);
        if (isNaN(level) || level < 1 || level > 79) {
          return errorResponse(
            'Invalid level value (must be 1-79)',
            400,
            origin,
            reqOrigin,
            rlHeaders
          );
        }
        const effectiveGameMode = validation.token.game_mode;
        const result = await handleUpdateLevel(env, validation.token, level, effectiveGameMode);
        return successResponse(result, undefined, 200, origin, reqOrigin, rlHeaders);
      }
      // POST /progress/task/objective/:objectiveId - Update task objective
      const objectiveMatch = apiPath.match(/^\/progress\/task\/objective\/([^/]+)$/);
      if (objectiveMatch && request.method === 'POST') {
        const objectiveId = decodeUrlParam(objectiveMatch[1], 'objective ID', origin, reqOrigin);
        if (objectiveId instanceof Response) return objectiveId;
        const auth = await authenticateAndRateLimit(
          env,
          request,
          rawToken,
          'WP',
          'progress-write',
          origin,
          reqOrigin,
          ctx,
          inboundUserAgent
        );
        if (auth instanceof Response) return auth;
        const { validation, rlHeaders } = auth;
        const parsedBody = await parseJsonObjectBody(request, origin, reqOrigin, rlHeaders);
        if (parsedBody instanceof Response) return parsedBody;
        const body = parsedBody as { state?: unknown; count?: unknown };
        if (body.state === undefined && body.count === undefined) {
          return errorResponse('Must provide state or count', 400, origin, reqOrigin, rlHeaders);
        }
        if (
          body.state !== undefined &&
          (typeof body.state !== 'string' || !['completed', 'uncompleted'].includes(body.state))
        ) {
          return errorResponse(
            `Invalid state "${typeof body.state === 'string' ? body.state : String(body.state ?? '')}" (must be completed or uncompleted)`,
            400,
            origin,
            reqOrigin,
            rlHeaders
          );
        }
        if (
          body.count !== undefined &&
          (typeof body.count !== 'number' || !Number.isFinite(body.count) || body.count < 0)
        ) {
          return errorResponse(
            'Invalid count (must be a non-negative number)',
            400,
            origin,
            reqOrigin,
            rlHeaders
          );
        }
        const effectiveGameMode = validation.token.game_mode;
        const result = await handleUpdateObjective(
          env,
          validation.token,
          objectiveId,
          {
            ...(body.state !== undefined && { state: body.state as string }),
            ...(body.count !== undefined && { count: body.count as number }),
          },
          effectiveGameMode
        );
        return successResponse(result, undefined, 200, origin, reqOrigin, rlHeaders);
      }
      // POST /progress/task/:taskId - Update single task
      const taskMatch = apiPath.match(/^\/progress\/task\/([^/]+)$/);
      if (taskMatch && request.method === 'POST') {
        const taskId = decodeUrlParam(taskMatch[1], 'task ID', origin, reqOrigin);
        if (taskId instanceof Response) return taskId;
        const auth = await authenticateAndRateLimit(
          env,
          request,
          rawToken,
          'WP',
          'progress-write',
          origin,
          reqOrigin,
          ctx,
          inboundUserAgent
        );
        if (auth instanceof Response) return auth;
        const { validation, rlHeaders } = auth;
        const parsedBody = await parseJsonObjectBody(request, origin, reqOrigin, rlHeaders);
        if (parsedBody instanceof Response) return parsedBody;
        const rawState = (parsedBody as { state?: unknown }).state;
        if (
          typeof rawState !== 'string' ||
          !['completed', 'uncompleted', 'failed'].includes(rawState)
        ) {
          return errorResponse(
            `Invalid state "${typeof rawState === 'string' ? rawState : String(rawState ?? '')}" (must be completed, uncompleted, or failed)`,
            400,
            origin,
            reqOrigin,
            rlHeaders
          );
        }
        const state = rawState as TaskState;
        const effectiveGameMode = validation.token.game_mode;
        const result = await handleUpdateTask(
          env,
          validation.token,
          taskId,
          state,
          effectiveGameMode
        );
        return successResponse(result, undefined, 200, origin, reqOrigin, rlHeaders);
      }
      // POST /progress/tasks - Batch update tasks
      if (apiPath === '/progress/tasks' && request.method === 'POST') {
        const auth = await authenticateAndRateLimit(
          env,
          request,
          rawToken,
          'WP',
          'progress-write',
          origin,
          reqOrigin,
          ctx,
          inboundUserAgent
        );
        if (auth instanceof Response) return auth;
        const { validation, rlHeaders } = auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return errorResponse('Invalid JSON body', 400, origin, reqOrigin, rlHeaders);
        }
        // Support both legacy object format and new array format
        const updates = normalizeTaskUpdates(body);
        if (!updates) {
          return errorResponse('Invalid request body', 400, origin, reqOrigin, rlHeaders);
        }
        const effectiveGameMode = validation.token.game_mode;
        const result = await handleUpdateTasks(env, validation.token, updates, effectiveGameMode);
        return successResponse(result, undefined, 200, origin, reqOrigin, rlHeaders);
      }
      // Route not found
      return errorResponse('Not Found', 404, origin, reqOrigin);
    } catch (error) {
      console.error('API error:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        500,
        origin,
        reqOrigin
      );
    }
  },
};
