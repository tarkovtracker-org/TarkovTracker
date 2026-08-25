import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';
import { logger } from './utils/logger';
type RateLimitAnchor = 'utc-day';
type RateLimitOptions = {
  anchor?: RateLimitAnchor;
};
type RateLimitConfig = {
  anchor?: RateLimitAnchor;
  ephemeral: boolean;
  limit: number;
  windowSec: number;
};
type RateLimitResponse = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};
type LimiterPayload = {
  allowed?: unknown;
  remaining?: unknown;
  resetAt?: unknown;
};
type LimiterUnavailableReason = 'http_status' | 'bad_json' | 'timeout' | 'fetch_error';
export type RateLimitState = {
  count: number;
  resetAt: number;
  windowSec: number;
  anchor?: RateLimitAnchor;
  ephemeral?: boolean;
};
export type RateLimitResult = {
  allowed: boolean;
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
function badRequest(): Response {
  return new Response('Bad Request', { status: 400 });
}
function positiveNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) && value > 0 ? value : null;
}
async function readRequestBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
async function parseRateLimitConfig(request: Request): Promise<RateLimitConfig | Response> {
  const payload = await readRequestBody(request);
  if (!payload) return badRequest();
  const limit = positiveNumber(payload.limit);
  const windowSec = positiveNumber(payload.windowSec);
  if (limit === null || windowSec === null) return badRequest();
  if (payload.anchor !== undefined && payload.anchor !== 'utc-day') return badRequest();
  return {
    anchor: payload.anchor === 'utc-day' ? 'utc-day' : undefined,
    ephemeral: payload.retain !== true,
    limit,
    windowSec,
  };
}
function shouldResetState(
  state: RateLimitState | undefined,
  config: RateLimitConfig,
  now: number
): boolean {
  if (!state || now >= state.resetAt) return true;
  if (state.windowSec !== config.windowSec || state.anchor !== config.anchor) return true;
  return 'timestamps' in state;
}
function createRateLimitState(config: RateLimitConfig, now: number): RateLimitState {
  const resetAt =
    config.anchor === 'utc-day' ? nextUtcMidnight(now) : now + config.windowSec * 1000;
  return {
    count: 0,
    resetAt,
    windowSec: config.windowSec,
    anchor: config.anchor,
    ...(config.ephemeral && { ephemeral: true }),
  };
}
export class ApiGatewayRateLimiter extends DurableObject<Env> {
  private data?: RateLimitState;
  private loaded = false;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }
  private json(body: RateLimitResponse): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const stored = await this.ctx.storage.get<RateLimitState>('state');
      this.loaded = true;
      this.data = stored && Date.now() < stored.resetAt ? stored : undefined;
    } catch (error) {
      logger.error('rate limiter storage load failed', { id: this.ctx.id.toString(), error });
      throw error;
    }
  }
  private prepareState(config: RateLimitConfig): RateLimitState {
    const now = Date.now();
    if (shouldResetState(this.data, config, now)) {
      this.data = createRateLimitState(config, now);
    } else if (config.ephemeral) {
      this.data!.ephemeral = true;
    }
    return this.data!;
  }
  private async scheduleCleanup(resetAt: number): Promise<void> {
    const cleanupAt = resetAt + 1000;
    const existingAlarm = await this.ctx.storage.getAlarm();
    if (existingAlarm !== cleanupAt) await this.ctx.storage.setAlarm(cleanupAt);
  }
  private async consume(config: RateLimitConfig, data: RateLimitState): Promise<Response> {
    if (config.ephemeral) await this.scheduleCleanup(data.resetAt);
    if (data.count >= config.limit) {
      return this.json({ allowed: false, remaining: 0, resetAt: data.resetAt });
    }
    data.count += 1;
    await this.ctx.storage.put('state', data);
    return this.json({
      allowed: true,
      remaining: Math.max(config.limit - data.count, 0),
      resetAt: data.resetAt,
    });
  }
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const config = await parseRateLimitConfig(request);
    if (config instanceof Response) return config;
    await this.load();
    return this.consume(config, this.prepareState(config));
  }
  async alarm(): Promise<void> {
    try {
      const stored = await this.ctx.storage.get<RateLimitState>('state');
      const now = Date.now();
      if (stored && now < stored.resetAt) {
        if (stored.ephemeral === true) {
          await this.ctx.storage.setAlarm(stored.resetAt + 1000);
          return;
        }
        this.data = undefined;
        this.loaded = false;
        return;
      }
      this.data = undefined;
      this.loaded = false;
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
    } catch (error) {
      logger.error('rate limiter alarm cleanup failed', { id: this.ctx.id.toString(), error });
      throw error;
    }
  }
}
function unavailable(reason: LimiterUnavailableReason): RateLimitResult {
  return {
    allowed: false,
    unavailable: true,
    reason,
    message: 'Rate limiter unavailable',
  };
}
function limiterRequest(
  limit: number,
  windowSec: number,
  options: RateLimitOptions | undefined,
  signal: AbortSignal
): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      limit,
      windowSec,
      anchor: options?.anchor,
      retain: true,
    }),
    signal,
  };
}
async function callRateLimiter(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
  options?: RateLimitOptions
): Promise<Response | RateLimitResult> {
  const action = key.split(':', 1)[0] || 'unknown';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_LIMIT_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const id = env.API_GATEWAY_LIMITER.idFromName(key);
    const response = await env.API_GATEWAY_LIMITER.get(id).fetch(
      'https://rate-limit',
      limiterRequest(limit, windowSec, options, controller.signal)
    );
    const durationMs = Date.now() - startedAt;
    if (durationMs >= RATE_LIMIT_SLOW_MS) {
      console.log('rateLimit slow', { action, durationMs, ok: response.ok });
    }
    return response;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('rateLimit timeout', { action, durationMs, timeoutMs: RATE_LIMIT_TIMEOUT_MS });
      return unavailable('timeout');
    }
    console.error('rateLimit error', { action, durationMs, error });
    return unavailable('fetch_error');
  } finally {
    clearTimeout(timeout);
  }
}
function isAllowed(value: unknown): value is boolean {
  return value === true || value === false;
}
function isRemaining(value: unknown, allowed: boolean, limit: number): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false;
  if (value < 0 || value > limit) return false;
  return allowed ? value < limit : value === 0;
}
function isResetAt(value: unknown, now: number, windowSec: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > now &&
    value <= now + windowSec * 1000
  );
}
function normalizeLimiterPayload(
  data: LimiterPayload,
  limit: number,
  windowSec: number
): RateLimitResult | null {
  if (!isAllowed(data.allowed)) return null;
  if (!isRemaining(data.remaining, data.allowed, limit)) return null;
  if (!isResetAt(data.resetAt, Date.now(), windowSec)) return null;
  if (!data.allowed) {
    return {
      allowed: false,
      message: 'Rate limit exceeded',
      limit,
      remaining: data.remaining,
      resetAt: data.resetAt,
    };
  }
  return {
    allowed: true,
    limit,
    remaining: data.remaining,
    resetAt: data.resetAt,
  };
}
async function parseRateLimitResponse(
  response: Response,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  if (!response.ok) return unavailable('http_status');
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return unavailable('bad_json');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return unavailable('bad_json');
  return (
    normalizeLimiterPayload(data as LimiterPayload, limit, windowSec) ?? unavailable('bad_json')
  );
}
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  const response = await callRateLimiter(env, key, limit, windowSec, options);
  return response instanceof Response
    ? parseRateLimitResponse(response, limit, windowSec)
    : response;
}
