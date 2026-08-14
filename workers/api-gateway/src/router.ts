import { extractBearerToken } from './auth';
import { authenticateAndRateLimit } from './authentication';
import {
  handleGetProgress,
  handleUpdateLevel,
  handleUpdateObjective,
  handleUpdateTask,
  handleUpdateTasks,
} from './handlers/progress';
import { handleGetTeamProgress } from './handlers/team';
import { handleGetToken } from './handlers/token';
import {
  conditionalReadResponse,
  corsHeaders,
  decodeUrlParam,
  docsResponse,
  errorResponse,
  openApiResponse,
  parseJsonObjectBody,
  successResponse,
  tokenFlatResponse,
} from './responses';
import { INBOUND_USER_AGENT_MIN_LENGTH, normalizeInboundUserAgent } from './utils/userAgent';
import type { BatchTaskUpdate, Env, Permission, TaskState } from './types';
const LEGACY_API_DEPRECATION_DATE = '@1783296000';
const TASK_STATES = new Set<TaskState>(['completed', 'uncompleted', 'failed']);
const API_HOST_PREFIXES = ['/api/v2', '/api', '/v2'] as const;
type Action = 'progress-read' | 'progress-write' | 'token-info';
type RouteContext = {
  apiPath: string;
  ctx?: ExecutionContext;
  env: Env;
  inboundUserAgent: string;
  origin?: string;
  rawToken: string;
  reqOrigin?: string;
  request: Request;
};
type AuthResult = Awaited<ReturnType<typeof authenticateAndRateLimit>>;
type RouteHandler = (context: RouteContext) => Promise<Response | null>;
type ObjectiveUpdate = { state?: string; count?: number };
function normalizePath(pathname: string): string {
  return '/' + pathname.split('/').filter(Boolean).join('/');
}
function stripApiPrefix(path: string, prefixes: readonly string[]): string | null {
  const prefix = prefixes.find((candidate) => path === candidate || path.startsWith(candidate + '/'));
  return prefix ? path.slice(prefix.length) || '/' : null;
}
function resolveApiPath(path: string, isApiHost: boolean): string | null {
  if (isApiHost) return stripApiPrefix(path, API_HOST_PREFIXES) ?? path;
  const apiMatch = path.match(/^\/api(?:\/v2)?(.*)$/);
  return apiMatch ? apiMatch[1] || '/' : null;
}
function healthResponse(origin?: string, reqOrigin?: string): Response {
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
function robotsResponse(origin?: string, reqOrigin?: string): Response {
  const body = 'User-agent: *\nDisallow: /\n\nSitemap: https://tarkovtracker.org/sitemap.xml\n';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      ...corsHeaders(origin, reqOrigin),
    },
  });
}
function apiHostPublicResponse(
  path: string,
  origin?: string,
  reqOrigin?: string
): Response | null {
  if (path === '/' || path === '/docs') return docsResponse(origin, reqOrigin);
  if (path === '/openapi.json') return openApiResponse(origin, reqOrigin);
  return path === '/robots.txt' ? robotsResponse(origin, reqOrigin) : null;
}
function publicResponse(
  request: Request,
  path: string,
  isApiHost: boolean,
  origin?: string,
  reqOrigin?: string
): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, reqOrigin) });
  }
  if (path === '/health') return healthResponse(origin, reqOrigin);
  return isApiHost ? apiHostPublicResponse(path, origin, reqOrigin) : null;
}
function legacyRedirectResponse(
  context: Pick<RouteContext, 'apiPath' | 'env' | 'origin' | 'reqOrigin' | 'request'>,
  apiHost: string,
  isApiHost: boolean
): Response | null {
  if (isApiHost || context.env.LEGACY_API_REDIRECT?.trim().toLowerCase() !== 'true') return null;
  const target = 'https://' + apiHost + context.apiPath + new URL(context.request.url).search;
  return new Response(null, {
    status: 308,
    headers: {
      ...corsHeaders(context.origin, context.reqOrigin),
      Location: target,
      Deprecation: LEGACY_API_DEPRECATION_DATE,
      Link: '<' + target + '>; rel="successor-version"',
      'Cache-Control': 'no-store',
    },
  });
}
function authorize(
  context: RouteContext,
  permission: Permission,
  action: Action
): Promise<AuthResult> {
  return authenticateAndRateLimit({
    action,
    ctx: context.ctx,
    env: context.env,
    envOrigin: context.origin,
    permission,
    rawToken: context.rawToken,
    request: context.request,
    requestOrigin: context.reqOrigin,
    userAgent: context.inboundUserAgent,
  });
}
function isTaskState(value: unknown): value is TaskState {
  return typeof value === 'string' && TASK_STATES.has(value as TaskState);
}
function isBatchTaskUpdate(value: unknown): value is BatchTaskUpdate {
  if (!value || typeof value !== 'object') return false;
  const { id, state } = value as Record<string, unknown>;
  return typeof id === 'string' && id.trim().length > 0 && isTaskState(state);
}
function normalizeTaskUpdates(body: unknown): BatchTaskUpdate[] | null {
  if (Array.isArray(body)) {
    if (body.length === 0) return null;
    return body.every(isBatchTaskUpdate) ? body : null;
  }
  if (!body || typeof body !== 'object') return null;
  const entries = Object.entries(body);
  if (entries.length === 0) return null;
  const updates: BatchTaskUpdate[] = [];
  for (const [id, state] of entries) {
    if (id.trim().length === 0 || !isTaskState(state)) return null;
    updates.push({ id, state });
  }
  return updates;
}
function objectiveStateError(state: unknown): string | null {
  if (state === undefined || (typeof state === 'string' && ['completed', 'uncompleted'].includes(state))) {
    return null;
  }
  const value = typeof state === 'string' ? state : String(state ?? '');
  return 'Invalid state "' + value + '" (must be completed or uncompleted)';
}
function objectiveCountError(count: unknown): string | null {
  if (
    count === undefined ||
    (typeof count === 'number' && Number.isFinite(count) && count >= 0)
  ) {
    return null;
  }
  return 'Invalid count (must be a non-negative number)';
}
function validateObjectiveUpdate(body: Record<string, unknown>): ObjectiveUpdate | string {
  if (body.state === undefined && body.count === undefined) return 'Must provide state or count';
  const stateError = objectiveStateError(body.state);
  if (stateError) return stateError;
  const countError = objectiveCountError(body.count);
  if (countError) return countError;
  return {
    ...(body.state !== undefined && { state: body.state as string }),
    ...(body.count !== undefined && { count: body.count as number }),
  };
}
async function routeToken(context: RouteContext): Promise<Response | null> {
  if (context.apiPath !== '/token' || context.request.method !== 'GET') return null;
  const auth = await authorize(context, 'GP', 'token-info');
  if (auth instanceof Response) return auth;
  return tokenFlatResponse(
    handleGetToken(auth.validation.token, context.rawToken),
    context.origin,
    context.reqOrigin,
    auth.rlHeaders
  );
}
async function routeProgress(context: RouteContext): Promise<Response | null> {
  if (context.apiPath !== '/progress' || context.request.method !== 'GET') return null;
  const auth = await authorize(context, 'GP', 'progress-read');
  if (auth instanceof Response) return auth;
  const progress = await handleGetProgress(
    context.env,
    auth.validation.token,
    auth.validation.token.game_mode
  );
  return conditionalReadResponse(
    context.request,
    progress,
    context.origin,
    context.reqOrigin,
    auth.rlHeaders
  );
}
async function routeTeamProgress(context: RouteContext): Promise<Response | null> {
  if (context.apiPath !== '/team/progress' || context.request.method !== 'GET') return null;
  const auth = await authorize(context, 'TP', 'progress-read');
  if (auth instanceof Response) return auth;
  const progress = await handleGetTeamProgress(
    context.env,
    auth.validation.token,
    auth.validation.token.game_mode
  );
  return conditionalReadResponse(
    context.request,
    progress,
    context.origin,
    context.reqOrigin,
    auth.rlHeaders
  );
}
async function routeLevel(context: RouteContext): Promise<Response | null> {
  const match = context.apiPath.match(/^\/progress\/level\/(\d+)$/);
  if (!match || context.request.method !== 'POST') return null;
  const auth = await authorize(context, 'WP', 'progress-write');
  if (auth instanceof Response) return auth;
  const level = parseInt(match[1], 10);
  if (isNaN(level) || level < 1 || level > 79) {
    return errorResponse(
      'Invalid level value (must be 1-79)',
      400,
      context.origin,
      context.reqOrigin,
      auth.rlHeaders
    );
  }
  const result = await handleUpdateLevel(
    context.env,
    auth.validation.token,
    level,
    auth.validation.token.game_mode
  );
  return successResponse(result, undefined, 200, context.origin, context.reqOrigin, auth.rlHeaders);
}
async function routeObjective(context: RouteContext): Promise<Response | null> {
  const match = context.apiPath.match(/^\/progress\/task\/objective\/([^/]+)$/);
  if (!match || context.request.method !== 'POST') return null;
  const objectiveId = decodeUrlParam(match[1], 'objective ID', context.origin, context.reqOrigin);
  if (objectiveId instanceof Response) return objectiveId;
  const auth = await authorize(context, 'WP', 'progress-write');
  if (auth instanceof Response) return auth;
  const body = await parseJsonObjectBody(
    context.request,
    context.origin,
    context.reqOrigin,
    auth.rlHeaders
  );
  if (body instanceof Response) return body;
  const update = validateObjectiveUpdate(body);
  if (typeof update === 'string') {
    return errorResponse(update, 400, context.origin, context.reqOrigin, auth.rlHeaders);
  }
  const result = await handleUpdateObjective(
    context.env,
    auth.validation.token,
    objectiveId,
    update,
    auth.validation.token.game_mode
  );
  return successResponse(result, undefined, 200, context.origin, context.reqOrigin, auth.rlHeaders);
}
async function routeTask(context: RouteContext): Promise<Response | null> {
  const match = context.apiPath.match(/^\/progress\/task\/([^/]+)$/);
  if (!match || context.request.method !== 'POST') return null;
  const taskId = decodeUrlParam(match[1], 'task ID', context.origin, context.reqOrigin);
  if (taskId instanceof Response) return taskId;
  const auth = await authorize(context, 'WP', 'progress-write');
  if (auth instanceof Response) return auth;
  const body = await parseJsonObjectBody(
    context.request,
    context.origin,
    context.reqOrigin,
    auth.rlHeaders
  );
  if (body instanceof Response) return body;
  if (!isTaskState(body.state)) {
    const value = typeof body.state === 'string' ? body.state : String(body.state ?? '');
    return errorResponse(
      'Invalid state "' + value + '" (must be completed, uncompleted, or failed)',
      400,
      context.origin,
      context.reqOrigin,
      auth.rlHeaders
    );
  }
  const result = await handleUpdateTask(
    context.env,
    auth.validation.token,
    taskId,
    body.state,
    auth.validation.token.game_mode
  );
  return successResponse(result, undefined, 200, context.origin, context.reqOrigin, auth.rlHeaders);
}
async function routeTasks(context: RouteContext): Promise<Response | null> {
  if (context.apiPath !== '/progress/tasks' || context.request.method !== 'POST') return null;
  const auth = await authorize(context, 'WP', 'progress-write');
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse(
      'Invalid JSON body',
      400,
      context.origin,
      context.reqOrigin,
      auth.rlHeaders
    );
  }
  const updates = normalizeTaskUpdates(body);
  if (!updates) {
    return errorResponse(
      'Invalid request body',
      400,
      context.origin,
      context.reqOrigin,
      auth.rlHeaders
    );
  }
  const result = await handleUpdateTasks(
    context.env,
    auth.validation.token,
    updates,
    auth.validation.token.game_mode
  );
  return successResponse(result, undefined, 200, context.origin, context.reqOrigin, auth.rlHeaders);
}
const ROUTES: RouteHandler[] = [
  routeToken,
  routeProgress,
  routeTeamProgress,
  routeLevel,
  routeObjective,
  routeTask,
  routeTasks,
];
async function routeAuthenticated(context: RouteContext): Promise<Response> {
  for (const route of ROUTES) {
    const response = await route(context);
    if (response) return response;
  }
  return errorResponse('Not Found', 404, context.origin, context.reqOrigin);
}
export async function handleGatewayRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const origin = env.ALLOWED_ORIGIN;
  const reqOrigin = request.headers.get('Origin') || undefined;
  const apiHost = (env.API_HOST || 'api.tarkovtracker.org').trim().toLowerCase();
  const isApiHost = url.hostname.toLowerCase() === apiHost;
  const response = publicResponse(request, path, isApiHost, origin, reqOrigin);
  if (response) return response;
  const apiPath = resolveApiPath(path, isApiHost);
  if (!apiPath) return new Response('Not Found', { status: 404, headers: corsHeaders(origin, reqOrigin) });
  const inboundUserAgent = normalizeInboundUserAgent(request.headers.get('User-Agent'));
  if (!inboundUserAgent || inboundUserAgent.length < INBOUND_USER_AGENT_MIN_LENGTH) {
    return errorResponse(
      'User-Agent must be 5-200 characters (e.g. "AppName/1.0 (+https://your-app.com)")',
      400,
      origin,
      reqOrigin
    );
  }
  const redirect = legacyRedirectResponse(
    { apiPath, env, origin, reqOrigin, request },
    apiHost,
    isApiHost
  );
  if (redirect) return redirect;
  const rawToken = extractBearerToken(request.headers.get('Authorization'));
  if (!rawToken) return errorResponse('Unauthorized', 401, origin, reqOrigin);
  try {
    return await routeAuthenticated({
      apiPath,
      ctx,
      env,
      inboundUserAgent,
      origin,
      rawToken,
      reqOrigin,
      request,
    });
  } catch (error) {
    console.error('API error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500,
      origin,
      reqOrigin
    );
  }
}
