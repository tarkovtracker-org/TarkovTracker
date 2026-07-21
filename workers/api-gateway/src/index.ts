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
import {
  BURST_WINDOW_SEC,
  DAILY_WINDOW_SEC,
  IP_BACKSTOP_LIMITS,
  IP_BACKSTOP_WINDOW_SEC,
  TIER_LIMITS,
  upgradeMessage,
} from './limits';
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
type RateLimitMode = 'sliding';
type RateLimitOptions = {
  anchor?: RateLimitAnchor;
  mode?: RateLimitMode;
};
export type RateLimitState = {
  count: number;
  resetAt: number;
  windowSec: number;
  anchor?: RateLimitAnchor;
  mode?: RateLimitMode;
  timestamps?: number[];
  ephemeral?: boolean;
};
type RateLimitResponse = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  consumedAt?: number;
};
type RateLimitResult = {
  allowed: boolean;
  status?: number;
  message?: string;
  limit?: number;
  remaining?: number;
  resetAt?: number;
  consumedAt?: number;
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
      // Sliding-window resetAt is oldestTimestamp + windowMs, so it can elapse
      // while younger timestamps are still inside the window. Keep sliding
      // state for the fetch path to prune; only fixed windows may discard by
      // resetAt alone.
      if (stored) {
        if (stored.mode === 'sliding' || Date.now() < stored.resetAt) {
          this.data = stored;
        } else {
          this.data = undefined;
        }
      } else {
        this.data = undefined;
      }
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
      mode?: string;
      refund?: boolean;
      resetAt?: number;
      consumedAt?: number;
      retain?: boolean;
    };
    try {
      payload = (await request.json()) as {
        limit?: number;
        windowSec?: number;
        anchor?: string;
        mode?: string;
        refund?: boolean;
        resetAt?: number;
        consumedAt?: number;
        retain?: boolean;
      };
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    if (payload.refund === true) {
      // Return one previously consumed slot. For fixed-window buckets the
      // caller passes the resetAt of the window it consumed from so a refund
      // delayed past a UTC-day rollover cannot decrement the new day. For
      // sliding-window buckets the caller passes the consumedAt timestamp so
      // the exact entry can be removed from the log.
      await this.load();
      const now = Date.now();
      if (
        this.data &&
        this.data.mode === 'sliding' &&
        typeof payload.consumedAt === 'number' &&
        Array.isArray(this.data.timestamps)
      ) {
        const idx = this.data.timestamps.indexOf(payload.consumedAt);
        if (idx >= 0) {
          this.data.timestamps.splice(idx, 1);
          this.data.count = this.data.timestamps.length;
          if (this.data.timestamps.length > 0) {
            this.data.resetAt = this.data.timestamps[0] + this.data.windowSec * 1000;
          } else {
            this.data.resetAt = now + this.data.windowSec * 1000;
          }
          await this.state.storage.put('state', this.data);
          await this.scheduleCleanup(this.data.resetAt);
        }
        return this.json({ allowed: true, remaining: 0, resetAt: this.data.resetAt });
      }
      const expectedResetAt = payload.resetAt;
      if (
        this.data &&
        !this.data.mode &&
        now < this.data.resetAt &&
        this.data.count > 0 &&
        (typeof expectedResetAt !== 'number' || this.data.resetAt === expectedResetAt)
      ) {
        this.data.count -= 1;
        await this.state.storage.put('state', this.data);
      }
      return this.json({ allowed: true, remaining: 0, resetAt: this.data?.resetAt ?? now });
    }
    const limit = Number(payload.limit);
    const windowSec = Number(payload.windowSec);
    if (!Number.isFinite(limit) || !Number.isFinite(windowSec) || limit <= 0 || windowSec <= 0) {
      return new Response('Bad Request', { status: 400 });
    }
    const anchor: RateLimitAnchor | undefined =
      payload.anchor === 'utc-day' ? 'utc-day' : undefined;
    const mode: RateLimitMode | undefined = payload.mode === 'sliding' ? 'sliding' : undefined;
    // Cleanup is the default for high-cardinality callers (Pages, legacy, unknown).
    // Authenticated gateway quotas opt in to long retention via retain: true so a
    // Worker-first deploy never drops cleanup for keys that omit the flag.
    const ephemeral = payload.retain !== true;
    await this.load();
    const now = Date.now();
    const windowMs = windowSec * 1000;
    if (mode === 'sliding') {
      // Sliding-window log: bounded by `limit` entries, so short bursts across
      // a fixed-window boundary are not spuriously throttled.
      const cutoff = now - windowMs;
      const timestamps = (this.data?.timestamps ?? []).filter((ts) => ts > cutoff);
      const resetAt = timestamps.length ? timestamps[0] + windowMs : now + windowMs;
      if (timestamps.length >= limit) {
        // Deny path: refresh in-memory state but skip the storage write. The
        // pruned timestamps/resetAt are recomputed from storage on the next
        // load, so persisting on every throttled hit would only add Durable
        // Object write amplification under sustained bursts.
        this.data = {
          count: timestamps.length,
          resetAt,
          windowSec,
          mode,
          timestamps,
          ...(ephemeral && { ephemeral: true }),
        };
        if (ephemeral) await this.scheduleCleanup(resetAt);
        return this.json({ allowed: false, remaining: 0, resetAt });
      }
      timestamps.push(now);
      this.data = {
        count: timestamps.length,
        resetAt: timestamps[0] + windowMs,
        windowSec,
        mode,
        timestamps,
        ...(ephemeral && { ephemeral: true }),
      };
      await this.state.storage.put('state', this.data);
      if (ephemeral) await this.scheduleCleanup(this.data.resetAt);
      return this.json({
        allowed: true,
        remaining: Math.max(limit - timestamps.length, 0),
        resetAt: this.data.resetAt,
        consumedAt: now,
      });
    }
    const configChanged =
      !this.data ||
      this.data.windowSec !== windowSec ||
      this.data.anchor !== anchor ||
      this.data.mode !== undefined;
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
  // Bounded authenticated keys (daily-*/burst-* keyed by user_id) pass
  // retain: true so they skip alarms; load() treats expired state as absent
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
  private isStateActive(stored: RateLimitState, now: number): { active: boolean; resetAt: number } {
    if (stored.mode === 'sliding') {
      const windowMs = (stored.windowSec || 0) * 1000;
      const cutoff = now - windowMs;
      const timestamps = (stored.timestamps ?? []).filter((ts) => ts > cutoff);
      if (!timestamps.length) {
        return { active: false, resetAt: stored.resetAt };
      }
      return { active: true, resetAt: timestamps[0] + windowMs };
    }
    return { active: now < stored.resetAt, resetAt: stored.resetAt };
  }
  async alarm(): Promise<void> {
    try {
      const stored = await this.state.storage.get<RateLimitState>('state');
      const now = Date.now();
      if (stored) {
        const { active, resetAt } = this.isStateActive(stored, now);
        if (active) {
          if (stored.ephemeral === true) {
            await this.state.storage.setAlarm(resetAt + 1000);
            return;
          }
          this.data = undefined;
          this.loaded = false;
          return;
        }
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
        mode: options?.mode,
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
        status: 503,
        message: 'Rate limiter unavailable',
      };
    }
    let data: { allowed?: boolean; remaining?: number; resetAt?: number; consumedAt?: number } = {};
    try {
      data = (await res.json()) as {
        allowed?: boolean;
        remaining?: number;
        resetAt?: number;
        consumedAt?: number;
      };
    } catch {
      return {
        allowed: false,
        status: 503,
        message: 'Rate limiter unavailable',
      };
    }
    const remaining = typeof data.remaining === 'number' ? data.remaining : undefined;
    const resetAt = typeof data.resetAt === 'number' ? data.resetAt : undefined;
    const consumedAt = typeof data.consumedAt === 'number' ? data.consumedAt : undefined;
    if (data.allowed === false) {
      return {
        allowed: false,
        status: 429,
        message: 'Rate limit exceeded',
        limit,
        remaining: remaining ?? 0,
        resetAt,
      };
    }
    return { allowed: true, limit, remaining, resetAt, consumedAt };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('rateLimit timeout', { action, durationMs, timeoutMs: RATE_LIMIT_TIMEOUT_MS });
    } else {
      console.error('rateLimit error', { action, durationMs, error });
    }
    return {
      allowed: false,
      status: 503,
      message: 'Rate limiter unavailable',
    };
  } finally {
    clearTimeout(timeout);
  }
}
/**
 * Best-effort refund of one previously consumed slot. For fixed-window buckets
 * `consumedResetAt` is the resetAt of the window the slot was taken from; the
 * Durable Object only decrements when its current window still matches, so a
 * refund delayed past a UTC-day rollover cannot steal a slot from the new day.
 * For sliding-window buckets `consumedAt` is the timestamp of the entry to
 * remove from the log.
 */
async function refundRateLimit(
  env: Env,
  key: string,
  action: string,
  consumedResetAt?: number,
  consumedAt?: number
): Promise<void> {
  const id = env.API_GATEWAY_LIMITER.idFromName(key);
  const stub = env.API_GATEWAY_LIMITER.get(id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_LIMIT_TIMEOUT_MS);
  try {
    await stub.fetch('https://rate-limit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refund: true, resetAt: consumedResetAt, consumedAt }),
      signal: controller.signal,
    });
  } catch (error) {
    console.warn('rateLimit refund failed', { action, error });
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
function retryAfterS(rl: RateLimitResult): number | undefined {
  if (typeof rl.resetAt !== 'number') return undefined;
  return retryAfterSeconds(rl.resetAt);
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
type ThrottleBucket = 'daily' | 'burst' | 'ip';
function resolveClientIp(request: Request): string | null {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  return null;
}
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
function logThrottle(
  action: Action,
  bucket: ThrottleBucket,
  userId: string,
  tokenId: string,
  ipHash: string | null,
  retryAfterS: number | undefined
): void {
  console.log(
    JSON.stringify({
      event: 'rate_limit_429',
      action,
      bucket,
      user_id: userId,
      token_id: tokenId,
      ip_hash: ipHash,
      retry_after_s: retryAfterS ?? null,
    })
  );
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
  const validation = await validateToken(env, rawToken, permission);
  if (!validation.valid) {
    return errorResponse(validation.error, validation.status, envOrigin, requestOrigin);
  }
  const token = validation.token;
  const kind: UsageKind = action === 'progress-write' ? 'write' : 'read';
  const tier = await resolveTier(env, token.user_id);
  const limits = TIER_LIMITS[tier];
  const dailyLimit = kind === 'write' ? limits.writesPerDay : limits.readsPerDay;
  const clientIp = resolveClientIp(request);
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
  // Daily quota first, so a request rejected by the daily quota does not
  // consume a burst slot. Both counters key on user_id so extra tokens do not
  // multiply a user's quota.
  const dailyKey = `daily-${kind}:${token.user_id}`;
  const daily = await rateLimit(env, dailyKey, dailyLimit, DAILY_WINDOW_SEC, {
    anchor: 'utc-day',
  });
  const dailyHeaders = rateLimitHeaders(daily);
  if (!daily.allowed) {
    track(true);
    const ipHash = clientIp ? await hashIp(clientIp, env.IP_HASH_SECRET) : null;
    logThrottle(action, 'daily', token.user_id, token.token_id, ipHash, retryAfterS(daily));
    const message =
      daily.status === 429 && tier === 'free'
        ? upgradeMessage(kind)
        : daily.message || 'Rate limit exceeded';
    return errorResponse(message, daily.status || 429, envOrigin, requestOrigin, dailyHeaders);
  }
  const burst = await rateLimit(
    env,
    `burst-${kind}:${token.user_id}`,
    limits.burstPerMinute,
    BURST_WINDOW_SEC,
    { mode: 'sliding' }
  );
  if (!burst.allowed) {
    // Give back the daily slot consumed above so burst-throttled attempts do
    // not drain the daily quota.
    const refund = refundRateLimit(
      env,
      dailyKey,
      `daily-${kind}`,
      typeof daily.resetAt === 'number' ? daily.resetAt : undefined
    );
    if (ctx) ctx.waitUntil(refund);
    track(true);
    const ipHash = clientIp ? await hashIp(clientIp, env.IP_HASH_SECRET) : null;
    logThrottle(action, 'burst', token.user_id, token.token_id, ipHash, retryAfterS(burst));
    // X-RateLimit-* always describes the daily quota (see docs/API.md); adjust
    // remaining for the refund. Retry-After reflects when burst capacity frees.
    const headers = rateLimitHeaders({
      ...daily,
      remaining: typeof daily.remaining === 'number' ? daily.remaining + 1 : undefined,
    });
    if (typeof burst.resetAt === 'number') {
      headers['Retry-After'] = String(retryAfterSeconds(burst.resetAt));
    }
    return errorResponse(
      burst.message || 'Rate limit exceeded',
      burst.status || 429,
      envOrigin,
      requestOrigin,
      headers
    );
  }
  // Per-IP backstop: catches "many accounts from one IP" abuse. Tuned
  // generously (600 reads/hour, 200 writes/hour) so shared NAT users are not
  // impacted. Uses a 1-hour sliding window. Only checked when CF-Connecting-IP
  // is present (Cloudflare overwrites any inbound spoof).
  //
  // Availability policy: the daily and burst limiters are the primary rate
  // limiting mechanism and remain fail-closed — if they are unavailable the
  // request is rejected because there is no other protection. The IP backstop
  // is a secondary abuse signal; when its Durable Object is unavailable
  // (status 503) it fails open so a transient infrastructure issue does not
  // take down the API for everyone behind a given IP. A genuine 429 from the
  // IP backstop still rejects the request and refunds the primary slots.
  if (clientIp) {
    const ipLimit =
      kind === 'write' ? IP_BACKSTOP_LIMITS.writesPerHour : IP_BACKSTOP_LIMITS.readsPerHour;
    const ipKey = `ip-${kind}:${clientIp}`;
    const ipResult = await rateLimit(env, ipKey, ipLimit, IP_BACKSTOP_WINDOW_SEC, {
      mode: 'sliding',
    });
    if (!ipResult.allowed && ipResult.status !== 503) {
      // Genuine IP throttle (429): refund both the daily (fixed-window) and
      // burst (sliding-window) slots so IP-throttled requests do not drain
      // per-user quotas.
      const refundBurst = refundRateLimit(
        env,
        `burst-${kind}:${token.user_id}`,
        `burst-${kind}`,
        undefined,
        burst.consumedAt
      );
      const refundDaily = refundRateLimit(
        env,
        dailyKey,
        `daily-${kind}`,
        typeof daily.resetAt === 'number' ? daily.resetAt : undefined
      );
      if (ctx) {
        ctx.waitUntil(refundBurst);
        ctx.waitUntil(refundDaily);
      }
      track(true);
      const ipHash = await hashIp(clientIp, env.IP_HASH_SECRET);
      logThrottle(action, 'ip', token.user_id, token.token_id, ipHash, retryAfterS(ipResult));
      const headers = rateLimitHeaders({
        ...daily,
        remaining: typeof daily.remaining === 'number' ? daily.remaining + 1 : undefined,
      });
      if (typeof ipResult.resetAt === 'number') {
        headers['Retry-After'] = String(retryAfterSeconds(ipResult.resetAt));
      }
      return errorResponse(
        ipResult.message || 'Rate limit exceeded',
        ipResult.status || 429,
        envOrigin,
        requestOrigin,
        headers
      );
    }
    if (!ipResult.allowed && ipResult.status === 503) {
      // IP backstop limiter unavailable: fail open. The primary daily and
      // burst checks already passed, so the request proceeds. Do not refund
      // the primary slots (the request is being served) and do not surface
      // the 503 to the client. Log a warning so the infrastructure failure
      // remains observable and is not counted as a throttle. Log the hashed
      // IP (never the raw CF-Connecting-IP) so the privacy control is
      // consistent with the 429 path.
      const ipHash = await hashIp(clientIp, env.IP_HASH_SECRET);
      console.warn(
        JSON.stringify({
          event: 'ip_backstop_unavailable',
          action,
          user_id: token.user_id,
          token_id: token.token_id,
          ip_hash: ipHash,
        })
      );
    }
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
