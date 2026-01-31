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
import { OPENAPI_JSON } from './openapi';
import type { Env, TaskState, BatchTaskUpdate, LegacyTokenResponse } from './types';
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
const RATE_LIMITS: Record<Action, { limit: number; windowSec: number }> = {
  'progress-read': { limit: 60, windowSec: 60 },
  'progress-write': { limit: 30, windowSec: 60 },
  'token-info': { limit: 60, windowSec: 60 },
};
type RateLimitState = {
  count: number;
  resetAt: number;
  windowSec: number;
};
type RateLimitResponse = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};
type RateLimitResult = {
  allowed: boolean;
  status?: number;
  message?: string;
};
const RATE_LIMIT_TIMEOUT_MS = 3000;
const RATE_LIMIT_SLOW_MS = 200;
export class ApiGatewayRateLimiter {
  private data?: RateLimitState;
  constructor(private state: DurableObjectState) {}
  private json(body: RateLimitResponse) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  private async load() {
    if (this.data) return;
    const stored = await this.state.storage.get<RateLimitState>('state');
    if (stored) this.data = stored;
  }
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    let payload: { limit?: number; windowSec?: number } = {};
    try {
      payload = (await request.json()) as { limit?: number; windowSec?: number };
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    const limit = Number(payload.limit);
    const windowSec = Number(payload.windowSec);
    if (!Number.isFinite(limit) || !Number.isFinite(windowSec) || limit <= 0 || windowSec <= 0) {
      return new Response('Bad Request', { status: 400 });
    }
    await this.load();
    const now = Date.now();
    const windowMs = windowSec * 1000;
    if (!this.data || this.data.windowSec !== windowSec || now >= this.data.resetAt) {
      this.data = { count: 0, resetAt: now + windowMs, windowSec };
    }
    if (this.data.count >= limit) {
      return this.json({
        allowed: false,
        remaining: 0,
        resetAt: this.data.resetAt,
      });
    }
    this.data.count += 1;
    await this.state.storage.put('state', this.data);
    return this.json({
      allowed: true,
      remaining: Math.max(limit - this.data.count, 0),
      resetAt: this.data.resetAt,
    });
  }
}
async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number
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
      body: JSON.stringify({ limit, windowSec }),
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
    let data: { allowed?: boolean } = {};
    try {
      data = (await res.json()) as { allowed?: boolean };
    } catch {
      return {
        allowed: false,
        status: 503,
        message: 'Rate limiter unavailable',
      };
    }
    if (data.allowed === false) {
      return {
        allowed: false,
        status: 429,
        message: 'Rate limit exceeded',
      };
    }
    return { allowed: true };
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
  };
}
function docsResponse(envOrigin?: string, requestOrigin?: string): Response {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TarkovTracker API Docs</title>
    <link rel="icon" href="https://tarkovtracker.io/favicon.ico" />
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
  requestOrigin?: string
): Response {
  const body = { success: true, ...tokenData };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
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
  requestOrigin?: string
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
  requestOrigin?: string
): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
    },
  });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
    // Extract and validate token
    const authHeader = request.headers.get('Authorization');
    const rawToken = extractBearerToken(authHeader);
    if (!rawToken) {
      return errorResponse('Unauthorized', 401, origin, reqOrigin);
    }
    try {
      // GET /token - Token info
      if (apiPath === '/token' && request.method === 'GET') {
        const validation = await validateToken(env, rawToken, 'GP');
        if (!validation.valid) {
          return errorResponse(validation.error, validation.status, origin, reqOrigin);
        }
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `token-info:${clientIp}:${rawToken.slice(-16)}`;
        const rl = await rateLimit(
          env,
          rlKey,
          RATE_LIMITS['token-info'].limit,
          RATE_LIMITS['token-info'].windowSec
        );
        if (!rl.allowed) {
          return errorResponse(
            rl.message || 'Rate limit exceeded',
            rl.status || 429,
            origin,
            reqOrigin
          );
        }
        const tokenResponse = handleGetToken(validation.token, rawToken);
        return tokenFlatResponse(tokenResponse, origin, reqOrigin);
      }
      // GET /progress - Player progress
      if (apiPath === '/progress' && request.method === 'GET') {
        const validation = await validateToken(env, rawToken, 'GP');
        if (!validation.valid) {
          return errorResponse(validation.error, validation.status, origin, reqOrigin);
        }
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `progress-read:${clientIp}:${rawToken.slice(-16)}`;
        const rl = await rateLimit(
          env,
          rlKey,
          RATE_LIMITS['progress-read'].limit,
          RATE_LIMITS['progress-read'].windowSec
        );
        if (!rl.allowed) {
          return errorResponse(
            rl.message || 'Rate limit exceeded',
            rl.status || 429,
            origin,
            reqOrigin
          );
        }
        const effectiveGameMode = validation.token.game_mode;
        const progress = await handleGetProgress(env, validation.token, effectiveGameMode);
        return successResponse(progress, undefined, 200, origin, reqOrigin);
      }
      // GET /team/progress - Team progress (requires TP permission)
      if (apiPath === '/team/progress' && request.method === 'GET') {
        const validation = await validateToken(env, rawToken, 'TP');
        if (!validation.valid) {
          return errorResponse(validation.error, validation.status, origin, reqOrigin);
        }
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `progress-read:${clientIp}:${rawToken.slice(-16)}`;
        const rl = await rateLimit(
          env,
          rlKey,
          RATE_LIMITS['progress-read'].limit,
          RATE_LIMITS['progress-read'].windowSec
        );
        if (!rl.allowed) {
          return errorResponse(
            rl.message || 'Rate limit exceeded',
            rl.status || 429,
            origin,
            reqOrigin
          );
        }
        const effectiveGameMode = validation.token.game_mode;
        const teamProgress = await handleGetTeamProgress(env, validation.token, effectiveGameMode);
        return successResponse(teamProgress, undefined, 200, origin, reqOrigin);
      }
      // POST /progress/level/:levelValue - Update player level
      const levelMatch = apiPath.match(/^\/progress\/level\/(\d+)$/);
      if (levelMatch && request.method === 'POST') {
        const validation = await validateToken(env, rawToken, 'WP');
        if (!validation.valid) {
          return errorResponse(validation.error, validation.status, origin, reqOrigin);
        }
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `progress-write:${clientIp}:${rawToken.slice(-16)}`;
        const rl = await rateLimit(
          env,
          rlKey,
          RATE_LIMITS['progress-write'].limit,
          RATE_LIMITS['progress-write'].windowSec
        );
        if (!rl.allowed) {
          return errorResponse(
            rl.message || 'Rate limit exceeded',
            rl.status || 429,
            origin,
            reqOrigin
          );
        }
        const level = parseInt(levelMatch[1], 10);
        if (isNaN(level) || level < 1 || level > 79) {
          return errorResponse('Invalid level value (must be 1-79)', 400, origin, reqOrigin);
        }
        const effectiveGameMode = validation.token.game_mode;
        const result = await handleUpdateLevel(env, validation.token, level, effectiveGameMode);
        return successResponse(result, undefined, 200, origin, reqOrigin);
      }
      // POST /progress/task/objective/:objectiveId - Update task objective
      const objectiveMatch = apiPath.match(/^\/progress\/task\/objective\/([^/]+)$/);
      if (objectiveMatch && request.method === 'POST') {
        const validation = await validateToken(env, rawToken, 'WP');
        if (!validation.valid) {
          return errorResponse(validation.error, validation.status, origin, reqOrigin);
        }
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `progress-write:${clientIp}:${rawToken.slice(-16)}`;
        const rl = await rateLimit(
          env,
          rlKey,
          RATE_LIMITS['progress-write'].limit,
          RATE_LIMITS['progress-write'].windowSec
        );
        if (!rl.allowed) {
          return errorResponse(
            rl.message || 'Rate limit exceeded',
            rl.status || 429,
            origin,
            reqOrigin
          );
        }
        const body = (await request.json()) as { state?: string; count?: number };
        if (!body.state && body.count === undefined) {
          return errorResponse('Must provide state or count', 400, origin, reqOrigin);
        }
        if (body.state && !['completed', 'uncompleted'].includes(body.state)) {
          return errorResponse(
            'Invalid state (must be completed or uncompleted)',
            400,
            origin,
            reqOrigin
          );
        }
        const effectiveGameMode = validation.token.game_mode;
        const result = await handleUpdateObjective(
          env,
          validation.token,
          objectiveMatch[1],
          body,
          effectiveGameMode
        );
        return successResponse(result, undefined, 200, origin, reqOrigin);
      }
      // POST /progress/task/:taskId - Update single task
      const taskMatch = apiPath.match(/^\/progress\/task\/([^/]+)$/);
      if (taskMatch && request.method === 'POST') {
        const validation = await validateToken(env, rawToken, 'WP');
        if (!validation.valid) {
          return errorResponse(validation.error, validation.status, origin, reqOrigin);
        }
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `progress-write:${clientIp}:${rawToken.slice(-16)}`;
        const rl = await rateLimit(
          env,
          rlKey,
          RATE_LIMITS['progress-write'].limit,
          RATE_LIMITS['progress-write'].windowSec
        );
        if (!rl.allowed) {
          return errorResponse(
            rl.message || 'Rate limit exceeded',
            rl.status || 429,
            origin,
            reqOrigin
          );
        }
        const body = (await request.json()) as { state?: string };
        const state = body.state as TaskState;
        if (!state || !['completed', 'uncompleted', 'failed'].includes(state)) {
          return errorResponse('Invalid state', 400, origin, reqOrigin);
        }
        const effectiveGameMode = validation.token.game_mode;
        const result = await handleUpdateTask(
          env,
          validation.token,
          taskMatch[1],
          state,
          effectiveGameMode
        );
        return successResponse(result, undefined, 200, origin, reqOrigin);
      }
      // POST /progress/tasks - Batch update tasks
      if (apiPath === '/progress/tasks' && request.method === 'POST') {
        const validation = await validateToken(env, rawToken, 'WP');
        if (!validation.valid) {
          return errorResponse(validation.error, validation.status, origin, reqOrigin);
        }
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `progress-write:${clientIp}:${rawToken.slice(-16)}`;
        const rl = await rateLimit(
          env,
          rlKey,
          RATE_LIMITS['progress-write'].limit,
          RATE_LIMITS['progress-write'].windowSec
        );
        if (!rl.allowed) {
          return errorResponse(
            rl.message || 'Rate limit exceeded',
            rl.status || 429,
            origin,
            reqOrigin
          );
        }
        const body = await request.json();
        // Support both legacy object format and new array format
        const updates = normalizeTaskUpdates(body);
        if (!updates) {
          return errorResponse('Invalid request body', 400, origin, reqOrigin);
        }
        const effectiveGameMode = validation.token.game_mode;
        const result = await handleUpdateTasks(env, validation.token, updates, effectiveGameMode);
        return successResponse(result, undefined, 200, origin, reqOrigin);
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
