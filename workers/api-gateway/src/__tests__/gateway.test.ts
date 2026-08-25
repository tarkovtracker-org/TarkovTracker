import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { ApiGatewayRateLimiter } from '../index';
import { deleteMemoryCache } from '../utils/memory-cache';
import type { Env, GameMode } from '../types';
const makeLimiter = (
  payload: { allowed: boolean; remaining: number; resetAt?: number } = {
    allowed: true,
    remaining: 10,
  }
) =>
  ({
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async () =>
        new Response(
          JSON.stringify({
            allowed: payload.allowed,
            remaining: payload.remaining,
            resetAt: payload.resetAt ?? Date.now() + 60000,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        ),
    }),
  }) as unknown as Env['API_GATEWAY_LIMITER'];
const BASE_ENV: Env = {
  API_GATEWAY_LIMITER: makeLimiter(),
  SUPABASE_URL: 'https://supabase.example',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  ALLOWED_ORIGIN: '*',
};
const buildRequest = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'TestClient/1.0 (+https://example.com)');
  }
  return new Request(`https://api.tarkovtracker.org${path}`, { ...init, headers });
};
const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
type MergeRpcPayload = {
  p_user_id: string;
  p_field: 'pvp_data' | 'pve_data' | 'seasonal_data';
  p_task_completions: Record<string, Record<string, unknown>> | null;
  p_task_objectives: Record<string, Record<string, unknown>> | null;
  p_set: Record<string, unknown> | null;
};
// Mirrors the merge semantics of the merge_progress_data SQL function:
// an unmaterialized persistent row is seeded from its legacy column, then taskCompletions
// shallow-merge, taskObjectives per-key deep-merge, set top-level merge.
const applyMergeRpc = (
  current: Record<string, unknown>,
  payload: MergeRpcPayload,
  legacy?: Record<string, unknown> | null
): Record<string, unknown> => {
  const seeded =
    typeof current.level !== 'number' && typeof legacy?.level === 'number' ? legacy : current;
  const data = { ...seeded };
  if (payload.p_task_completions) {
    data.taskCompletions = {
      ...((data.taskCompletions as Record<string, unknown>) ?? {}),
      ...payload.p_task_completions,
    };
  }
  if (payload.p_task_objectives) {
    const objectives = {
      ...((data.taskObjectives as Record<string, Record<string, unknown>>) ?? {}),
    };
    for (const [key, value] of Object.entries(payload.p_task_objectives)) {
      objectives[key] = { ...(objectives[key] ?? {}), ...value };
    }
    data.taskObjectives = objectives;
  }
  if (payload.p_set) {
    Object.assign(data, payload.p_set);
  }
  return data;
};
type BaseFetchMockOptions = {
  onMerge?: (payload: MergeRpcPayload) => void;
  mergeResult?: string;
  mergeStore?: { data: Record<string, unknown> };
  tasks?: Array<Record<string, unknown>>;
  userProgress?: Record<string, unknown>;
  permissions?: string[];
  gameMode?: GameMode;
  teamId?: string | null;
  teamMembers?: string[];
  missingProgressUserIds?: string[];
};
const createBaseFetchMock = ({
  onMerge,
  mergeResult,
  mergeStore,
  tasks = [],
  userProgress = {
    user_id: 'user-1',
    game_edition: 1,
    pvp_data: { taskCompletions: {} },
    pve_data: null,
  },
  permissions = ['WP'],
  gameMode = 'pvp',
  teamId = null,
  teamMembers = ['user-1', 'user-2'],
  missingProgressUserIds = [],
}: BaseFetchMockOptions = {}) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/rest/v1/api_tokens')) {
      return jsonResponse([
        {
          token_id: 'token-1',
          user_id: 'user-1',
          token_hash: 'hash',
          permissions,
          game_mode: gameMode,
          note: 'test',
          is_active: true,
          usage_count: 0,
          expires_at: null,
        },
      ]);
    }
    if (url.includes('/rest/v1/rpc/increment_token_usage')) {
      return jsonResponse({ ok: true });
    }
    if (url.includes('/rest/v1/rpc/get_active_season_number')) {
      return jsonResponse(1);
    }
    if (url.includes('/rest/v1/rpc/merge_progress_data')) {
      const payload = JSON.parse(String(init?.body || '{}')) as MergeRpcPayload;
      onMerge?.(payload);
      const result = mergeResult ?? '1';
      if (mergeStore && Number(result) > 0) {
        const legacyField =
          payload.p_field === 'pvp_data' || payload.p_field === 'pve_data' ? payload.p_field : null;
        mergeStore.data = applyMergeRpc(
          mergeStore.data,
          payload,
          legacyField
            ? ((userProgress[legacyField] as Record<string, unknown> | null) ?? null)
            : null
        );
      }
      return new Response(result, { status: 200 });
    }
    if (url.includes('/rest/v1/user_system')) {
      return jsonResponse([{ user_id: 'user-1', pvp_team_id: teamId, pve_team_id: teamId }]);
    }
    if (url.includes('/rest/v1/team_memberships')) {
      const select = new URL(url).searchParams.get('select');
      if (select === 'team_id') {
        return jsonResponse(teamId ? [{ team_id: teamId }] : []);
      }
      return jsonResponse(teamMembers.map((id) => ({ user_id: id })));
    }
    if (url.includes('/rest/v1/user_game_mode_progress')) {
      const parsedUrl = new URL(url);
      const userIdParam = parsedUrl.searchParams.get('user_id') ?? '';
      let requestedUserIds: string[];
      if (userIdParam.startsWith('eq.')) {
        requestedUserIds = [userIdParam.slice(3)];
      } else if (userIdParam.startsWith('in.(') && userIdParam.endsWith(')')) {
        requestedUserIds = userIdParam
          .slice(4, -1)
          .split(',')
          .map((value) => value.trim());
      } else {
        requestedUserIds = [String(userProgress.user_id)];
      }
      const modeField =
        gameMode === 'pve' ? 'pve_data' : gameMode === 'seasonal' ? 'seasonal_data' : 'pvp_data';
      const sourceProgress = userProgress.progress_data ??
        userProgress[modeField] ?? { taskCompletions: {} };
      return jsonResponse(
        requestedUserIds
          .filter((userId) => !missingProgressUserIds.includes(userId))
          .map((userId) => ({
            progress_data: {
              ...(typeof sourceProgress === 'object' && sourceProgress !== null
                ? sourceProgress
                : {}),
              displayName: `Member-${userId}`,
            },
            user_id: userId,
          }))
      );
    }
    if (url.includes('/rest/v1/user_progress')) {
      const parsedUrl = new URL(url);
      const selectParam = parsedUrl.searchParams.get('select') ?? '*';
      const selectedColumns = selectParam === '*' ? null : selectParam.split(',');
      const userIdParam = parsedUrl.searchParams.get('user_id') ?? '';
      let requestedUserIds: string[];
      if (userIdParam.startsWith('eq.')) {
        requestedUserIds = [userIdParam.slice(3)];
      } else if (userIdParam.startsWith('in.(') && userIdParam.endsWith(')')) {
        requestedUserIds = userIdParam
          .slice(4, -1)
          .split(',')
          .map((s) => s.trim());
      } else {
        requestedUserIds = [String(userProgress.user_id)];
      }
      const buildRow = (userId: string): Record<string, unknown> => {
        const base: Record<string, unknown> = { ...userProgress, user_id: userId };
        if (!selectedColumns) return base;
        const row: Record<string, unknown> = {};
        for (const col of selectedColumns) {
          if (col in base) row[col] = base[col];
        }
        return row;
      };
      return jsonResponse(requestedUserIds.map(buildRow));
    }
    const apiGameMode =
      gameMode === 'pve' ? 'pve' : gameMode === 'seasonal' ? 'pvp-season' : 'regular';
    if (url === `https://json.tarkov.dev/${apiGameMode}/tasks`) {
      return jsonResponse({
        data: {
          tasks: Object.fromEntries(tasks.map((task) => [String(task.id), task])),
        },
      });
    }
    if (url === `https://json.tarkov.dev/${apiGameMode}/hideout`) {
      return jsonResponse({ data: {} });
    }
    return new Response('Not Found', { status: 404 });
  });
beforeEach(() => {
  deleteMemoryCache('tarkov:tasks:regular');
  deleteMemoryCache('tarkov:tasks:pve');
  deleteMemoryCache('tarkov:tasks:pvp-season');
  deleteMemoryCache('tarkov:hideout:regular');
  deleteMemoryCache('tarkov:hideout:pve');
  deleteMemoryCache('tarkov:hideout:pvp-season');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('Unmocked fetch: missing test handler', { status: 500 }))
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const AUTH_HEADERS = { Authorization: 'Bearer PVP_abc123', 'Content-Type': 'application/json' };
const postObjectiveRequest = (objectiveId: string, body: unknown) =>
  buildRequest(`/progress/task/objective/${objectiveId}`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const postTaskRequest = (taskId: string, body: unknown) =>
  buildRequest(`/progress/task/${taskId}`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const expectErrorResponse = async (res: Response, status: number, error: string) => {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { success: boolean; error: string };
  expect(body.success).toBe(false);
  expect(body.error).toBe(error);
};
describe('api-gateway', () => {
  it('serves health without auth', async () => {
    const res = await worker.fetch(buildRequest('/health'), BASE_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { service: string } };
    expect(body.success).toBe(true);
    expect(body.data.service).toBe('tarkovtracker-api');
  });
  it('serves OpenAPI spec on api host', async () => {
    const res = await worker.fetch(buildRequest('/openapi.json'), BASE_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { openapi: string; info?: { title?: string } };
    expect(body.openapi).toBe('3.1.0');
    expect(body.info?.title).toBe('TarkovTracker API Gateway');
    expect(res.headers.get('Vary')).toContain('Origin');
  });
  it('serves Scalar docs at api root', async () => {
    const res = await worker.fetch(buildRequest('/'), BASE_ENV);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Scalar.createApiReference');
    expect(res.headers.get('content-type')).toContain('text/html');
  });
  it('serves robots.txt without auth on api host', async () => {
    const res = await worker.fetch(buildRequest('/robots.txt'), BASE_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Disallow: /');
    expect(text).toContain('Sitemap: https://tarkovtracker.org/sitemap.xml');
  });
  it('rejects missing bearer token', async () => {
    const res = await worker.fetch(buildRequest('/token', { method: 'GET' }), BASE_ENV);
    await expectErrorResponse(res, 401, 'Unauthorized');
  });
  it('rejects legacy tt_ prefixed tokens without a token lookup', async () => {
    const fetchMock = createBaseFetchMock({ permissions: ['GP'] });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      buildRequest('/token', { method: 'GET', headers: { Authorization: 'Bearer tt_abc123' } }),
      BASE_ENV
    );
    await expectErrorResponse(res, 401, 'Invalid token format');
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/rest/v1/api_tokens'))
    ).toBe(false);
  });
  it('rejects a token whose prefix contradicts its stored game mode', async () => {
    const fetchMock = createBaseFetchMock({ permissions: ['GP'], gameMode: 'pve' });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      buildRequest('/progress', { method: 'GET', headers: { Authorization: 'Bearer PVP_abc123' } }),
      BASE_ENV
    );
    await expectErrorResponse(res, 401, 'Token game mode mismatch');
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/rest/v1/user_progress'))
    ).toBe(false);
  });
  it('rejects requests with a missing User-Agent header', async () => {
    const res = await worker.fetch(
      new Request('https://api.tarkovtracker.org/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123' },
      }),
      BASE_ENV
    );
    const body = (await res.json()) as { success: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('User-Agent must be 5-200 characters');
  });
  it('rejects requests with a too-short User-Agent header', async () => {
    const res = await worker.fetch(
      buildRequest('/token', { method: 'GET', headers: { 'User-Agent': 'ab' } }),
      BASE_ENV
    );
    const body = (await res.json()) as { success: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('User-Agent must be 5-200 characters');
  });
  it('rejects requests with an oversized User-Agent header', async () => {
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'User-Agent': 'x'.repeat(201) },
      }),
      BASE_ENV
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain('User-Agent must be 5-200 characters');
  });
  it('validates User-Agent before issuing a legacy /api/v2 308 redirect', async () => {
    const env: Env = { ...BASE_ENV, LEGACY_API_REDIRECT: 'true' };
    const res = await worker.fetch(
      new Request('https://tarkovtracker.org/api/v2/progress/task/task-1?foo=bar', {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'User-Agent': 'ab' },
        body: JSON.stringify({ state: 'completed' }),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.error).toContain('User-Agent must be 5-200 characters');
  });
  it('redirects legacy /api/v2 routes with 308 when LEGACY_API_REDIRECT is true', async () => {
    const env: Env = { ...BASE_ENV, LEGACY_API_REDIRECT: 'true' };
    const res = await worker.fetch(
      new Request('https://tarkovtracker.org/api/v2/progress/task/task-1?foo=bar', {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'User-Agent': 'TestClient/1.0 (+https://example.com)' },
        body: JSON.stringify({ state: 'completed' }),
      }),
      env
    );
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe(
      'https://api.tarkovtracker.org/progress/task/task-1?foo=bar'
    );
    // RFC 9745: Deprecation is a structured-field Date (@<unix-ts>)
    expect(res.headers.get('Deprecation')).toBe('@1783296000');
    expect(res.headers.get('Link')).toBe(
      '<https://api.tarkovtracker.org/progress/task/task-1?foo=bar>; rel="successor-version"'
    );
  });
  it('redirects legacy /api routes without /v2 prefix when LEGACY_API_REDIRECT is true', async () => {
    const env: Env = { ...BASE_ENV, LEGACY_API_REDIRECT: 'true' };
    const res = await worker.fetch(
      new Request('https://tarkovtracker.org/api/progress', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer PVP_abc123',
          'User-Agent': 'TestClient/1.0 (+https://example.com)',
        },
      }),
      env
    );
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://api.tarkovtracker.org/progress');
  });
  it('serves legacy /api/v2 routes normally when LEGACY_API_REDIRECT is off', async () => {
    const res = await worker.fetch(
      new Request('https://tarkovtracker.org/api/v2/progress', {
        method: 'GET',
        headers: { 'User-Agent': 'TestClient/1.0 (+https://example.com)' },
      }),
      BASE_ENV
    );
    await expectErrorResponse(res, 401, 'Unauthorized');
  });
  it('returns token info for valid token', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123' },
      }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; token: string; owner: string };
    expect(body.success).toBe(true);
    expect(body.token).toBe('PVP_abc123');
    expect(body.owner).toBe('user-1');
  });
  it('exposes rate-limit headers on successful responses', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123' },
      }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('1000');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('10');
    expect(res.headers.get('X-RateLimit-Reset')).toMatch(/^\d+$/);
    expect(res.headers.get('Retry-After')).toBeNull();
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-RateLimit-Remaining');
  });
  it('returns Retry-After and rate-limit headers on 429', async () => {
    const resetAt = Date.now() + 30_000;
    const env: Env = {
      ...BASE_ENV,
      API_GATEWAY_LIMITER: makeLimiter({ allowed: false, remaining: 0, resetAt }),
    };
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123' },
      }),
      env
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('1000');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(res.headers.get('X-RateLimit-Reset')).toBe(String(Math.ceil(resetAt / 1000)));
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(31);
  });
  it('updates dependent tasks for single update', async () => {
    let mergePayload: MergeRpcPayload | null = null;
    const fetchMock = createBaseFetchMock({
      onMerge: (payload) => {
        mergePayload = payload;
      },
      tasks: [
        {
          id: 'task-main',
          name: 'Main Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [],
        },
        {
          id: 'task-dependent',
          name: 'Dependent Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [{ task: 'task-main', status: ['complete'] }],
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      buildRequest('/progress/task/task-main', {
        method: 'POST',
        headers: { Authorization: 'Bearer PVP_abc123', 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'completed' }),
      }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(mergePayload).not.toBeNull();
    const payload = mergePayload as unknown as MergeRpcPayload;
    expect(payload.p_field).toBe('pvp_data');
    const taskCompletions = payload.p_task_completions as Record<
      string,
      { complete?: boolean; failed?: boolean; timestamp?: number }
    > | null;
    expect(taskCompletions?.['task-main']?.complete).toBe(true);
    expect(taskCompletions?.['task-main']?.failed).toBe(false);
    expect(taskCompletions?.['task-dependent']?.complete).toBe(false);
    expect(taskCompletions?.['task-dependent']?.failed).toBe(false);
    expect(payload.p_set?.lastApiUpdate).toBeDefined();
  });
  it('skips lastApiUpdate for idempotent single task updates', async () => {
    let mergePayload: MergeRpcPayload | null = null;
    const fetchMock = createBaseFetchMock({
      onMerge: (payload) => {
        mergePayload = payload;
      },
      tasks: [
        {
          id: 'task-main',
          name: 'Main Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [],
        },
      ],
      userProgress: {
        user_id: 'user-1',
        game_edition: 1,
        pvp_data: {
          taskCompletions: { 'task-main': { complete: true, failed: false, timestamp: 1 } },
        },
        pve_data: null,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      buildRequest('/progress/task/task-main', {
        method: 'POST',
        headers: { Authorization: 'Bearer PVP_abc123', 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'completed' }),
      }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(mergePayload).not.toBeNull();
    const payload = mergePayload as unknown as MergeRpcPayload;
    expect(payload.p_set).toBeNull();
  });
  it('preserves explicit dependent task states in batch updates', async () => {
    let mergePayload: MergeRpcPayload | null = null;
    const fetchMock = createBaseFetchMock({
      onMerge: (payload) => {
        mergePayload = payload;
      },
      tasks: [
        {
          id: 'task-main',
          name: 'Main Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [],
        },
        {
          id: 'task-dependent',
          name: 'Dependent Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [{ task: 'task-main', status: ['complete'] }],
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      buildRequest('/progress/tasks', {
        method: 'POST',
        headers: { Authorization: 'Bearer PVP_abc123', 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { id: 'task-main', state: 'completed' },
          { id: 'task-dependent', state: 'completed' },
        ]),
      }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(mergePayload).not.toBeNull();
    const payload = mergePayload as unknown as MergeRpcPayload;
    const taskCompletions = payload.p_task_completions as Record<
      string,
      { complete?: boolean; failed?: boolean; timestamp?: number }
    > | null;
    expect(taskCompletions?.['task-main']?.complete).toBe(true);
    expect(taskCompletions?.['task-main']?.failed).toBe(false);
    expect(taskCompletions?.['task-dependent']?.complete).toBe(true);
    expect(taskCompletions?.['task-dependent']?.failed).toBe(false);
  });
  it('skips lastApiUpdate for idempotent batch task updates', async () => {
    let mergePayload: MergeRpcPayload | null = null;
    const fetchMock = createBaseFetchMock({
      onMerge: (payload) => {
        mergePayload = payload;
      },
      tasks: [
        {
          id: 'task-main',
          name: 'Main Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [],
        },
        {
          id: 'task-second',
          name: 'Second Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [],
        },
      ],
      userProgress: {
        user_id: 'user-1',
        game_edition: 1,
        pvp_data: {
          taskCompletions: {
            'task-main': { complete: true, failed: false, timestamp: 1 },
            'task-second': { complete: false, failed: false, timestamp: 1 },
          },
        },
        pve_data: null,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      buildRequest('/progress/tasks', {
        method: 'POST',
        headers: { Authorization: 'Bearer PVP_abc123', 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { id: 'task-main', state: 'completed' },
          { id: 'task-second', state: 'uncompleted' },
        ]),
      }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(mergePayload).not.toBeNull();
    const payload = mergePayload as unknown as MergeRpcPayload;
    expect(payload.p_set).toBeNull();
  });
  it('rejects POST /progress/tasks with malformed JSON body', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(
      buildRequest('/progress/tasks', {
        method: 'POST',
        headers: { Authorization: 'Bearer PVP_abc123', 'Content-Type': 'application/json' },
        body: '{not json',
      }),
      BASE_ENV
    );
    await expectErrorResponse(res, 400, 'Invalid JSON body');
  });
  it.each([
    ['empty array', '[]'],
    ['empty object', '{}'],
    ['whitespace-only task id', JSON.stringify([{ id: '   ', state: 'completed' }])],
  ])('rejects POST /progress/tasks with %s', async (_name, body) => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(
      buildRequest('/progress/tasks', {
        method: 'POST',
        headers: { Authorization: 'Bearer PVP_abc123', 'Content-Type': 'application/json' },
        body,
      }),
      BASE_ENV
    );
    await expectErrorResponse(res, 400, 'Invalid request body');
  });
  it('returns an error when the merge RPC matches no progress row', async () => {
    vi.stubGlobal(
      'fetch',
      createBaseFetchMock({
        mergeResult: '0',
        tasks: [
          {
            id: 'task-main',
            name: 'Main Task',
            factionName: 'Any',
            objectives: [],
            taskRequirements: [],
          },
        ],
      })
    );
    const res = await worker.fetch(postTaskRequest('task-main', { state: 'completed' }), BASE_ENV);
    await expectErrorResponse(res, 500, 'Internal server error');
  });
  it('does not lose unrelated keys when two writers merge concurrently', async () => {
    // Both writers read the same stale snapshot (GET always returns the
    // original row), but merges apply server-side to shared state, so
    // neither write clobbers the other's task.
    const mergeStore: { data: Record<string, unknown> } = {
      data: { level: 5, taskCompletions: {} },
    };
    const tasks = ['task-a', 'task-b'].map((id) => ({
      id,
      name: id,
      factionName: 'Any',
      objectives: [],
      taskRequirements: [],
    }));
    vi.stubGlobal('fetch', createBaseFetchMock({ mergeStore, tasks }));
    const [resA, resB] = await Promise.all([
      worker.fetch(postTaskRequest('task-a', { state: 'completed' }), BASE_ENV),
      worker.fetch(postTaskRequest('task-b', { state: 'completed' }), BASE_ENV),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const taskCompletions = mergeStore.data.taskCompletions as Record<
      string,
      { complete?: boolean }
    >;
    expect(taskCompletions['task-a']?.complete).toBe(true);
    expect(taskCompletions['task-b']?.complete).toBe(true);
    expect(mergeStore.data.level).toBe(5);
  });
  it('returns progress for valid token', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/rest/v1/api_tokens')) {
        return jsonResponse([
          {
            token_id: 'token-1',
            user_id: 'user-1',
            token_hash: 'hash',
            permissions: ['GP'],
            game_mode: 'pvp',
            note: 'test',
            is_active: true,
            usage_count: 0,
            expires_at: null,
          },
        ]);
      }
      if (url.includes('/rest/v1/rpc/increment_token_usage')) {
        return jsonResponse({ ok: true });
      }
      if (url.includes('/rest/v1/user_game_mode_progress')) {
        return jsonResponse([
          {
            user_id: 'user-1',
            progress_data: {
              level: 10,
              pmcFaction: 'USEC',
              displayName: 'Tester',
              xpOffset: 0,
              taskObjectives: { 'obj-1': { complete: false, count: 0, timestamp: 1 } },
              taskCompletions: { 'task-1': { complete: true, failed: false, timestamp: 1 } },
              hideoutParts: { 'part-1': { complete: false, count: 0 } },
              hideoutModules: { 'module-1': { complete: false } },
              traders: {},
              skills: {},
              prestigeLevel: 0,
              skillOffsets: {},
            },
          },
        ]);
      }
      if (url.includes('/rest/v1/user_progress')) {
        return jsonResponse([{ user_id: 'user-1', game_edition: 1 }]);
      }
      if (url === 'https://json.tarkov.dev/regular/tasks') {
        return jsonResponse({
          data: {
            tasks: {
              'task-1': {
                id: 'task-1',
                name: 'Task One',
                factionName: 'Any',
                objectives: [{ id: 'obj-1', type: 'find', count: 2 }],
                taskRequirements: [],
              },
            },
          },
        });
      }
      if (url === 'https://json.tarkov.dev/regular/hideout') {
        return jsonResponse({
          data: {
            'station-1': {
              id: 'station-1',
              levels: [
                {
                  id: 'module-1',
                  level: 1,
                  itemRequirements: [{ id: 'part-1', count: 1 }],
                },
              ],
            },
          },
        });
      }
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      buildRequest('/progress', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123' },
      }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        userId: string;
        tasksProgress: Array<Record<string, unknown>>;
        taskObjectivesProgress: Array<Record<string, unknown>>;
        hideoutPartsProgress: Array<Record<string, unknown>>;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe('user-1');
    const task = body.data.tasksProgress[0] as Record<string, unknown>;
    expect('failed' in task).toBe(false);
    expect('invalid' in task).toBe(false);
    const objective = body.data.taskObjectivesProgress[0] as Record<string, unknown>;
    expect('count' in objective).toBe(false);
    expect('invalid' in objective).toBe(false);
    const hideoutPart = body.data.hideoutPartsProgress[0] as Record<string, unknown>;
    expect('count' in hideoutPart).toBe(false);
  });
  it('rejects POST /progress/task with URL-encoded whitespace ID', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postTaskRequest('%20%20', { state: 'completed' }), BASE_ENV);
    await expectErrorResponse(res, 400, 'Missing task ID in URL');
  });
  it('rejects POST /progress/task with malformed encoded ID', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postTaskRequest('%E0%A4%A', { state: 'completed' }), BASE_ENV);
    await expectErrorResponse(res, 400, 'Invalid task ID in URL');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('10');
    expect(res.headers.get('X-RateLimit-Reset')).toMatch(/^\d+$/);
  });
  it('rejects POST /progress/task with malformed JSON body', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postTaskRequest('task-1', '{not json'), BASE_ENV);
    await expectErrorResponse(res, 400, 'Invalid JSON body');
  });
  it('rejects POST /progress/task with null JSON body', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postTaskRequest('task-1', 'null'), BASE_ENV);
    await expectErrorResponse(res, 400, 'Invalid request body (expected object)');
  });
  it('rejects POST /progress/task with array JSON body', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postTaskRequest('task-1', '[]'), BASE_ENV);
    await expectErrorResponse(res, 400, 'Invalid request body (expected object)');
  });
  it('rejects POST /progress/task with invalid state and echoes the value', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postTaskRequest('task-1', { state: 'foo' }), BASE_ENV);
    await expectErrorResponse(
      res,
      400,
      'Invalid state "foo" (must be completed, uncompleted, or failed)'
    );
  });
  it('rejects POST /progress/task when state is not a string', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postTaskRequest('task-1', { state: 123 }), BASE_ENV);
    await expectErrorResponse(
      res,
      400,
      'Invalid state "123" (must be completed, uncompleted, or failed)'
    );
  });
  it('accepts POST /progress/task with URL-encoded valid task ID', async () => {
    let mergePayload: MergeRpcPayload | null = null;
    const fetchMock = createBaseFetchMock({
      onMerge: (payload) => {
        mergePayload = payload;
      },
      tasks: [
        {
          id: 'task-main',
          name: 'Main Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [],
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      postTaskRequest('task-main%20', { state: 'completed' }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(mergePayload).not.toBeNull();
    const taskCompletions = (mergePayload as unknown as MergeRpcPayload)
      .p_task_completions as Record<string, { complete?: boolean }> | null;
    expect(taskCompletions?.['task-main']?.complete).toBe(true);
  });
  it('rejects POST /progress/task/objective with URL-encoded whitespace ID', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(
      postObjectiveRequest('%20%20', { state: 'completed' }),
      BASE_ENV
    );
    await expectErrorResponse(res, 400, 'Missing objective ID in URL');
  });
  it('rejects POST /progress/task/objective with malformed encoded ID', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(
      postObjectiveRequest('%E0%A4%A', { state: 'completed' }),
      BASE_ENV
    );
    await expectErrorResponse(res, 400, 'Invalid objective ID in URL');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('10');
    expect(res.headers.get('X-RateLimit-Reset')).toMatch(/^\d+$/);
  });
  it('authenticates before decoding malformed-URL task writes', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(
      buildRequest('/progress/task/%E0%A4%A', {
        method: 'POST',
        headers: { Authorization: 'Bearer tt_abc123', 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'completed' }),
      }),
      BASE_ENV
    );
    await expectErrorResponse(res, 401, 'Invalid token format');
  });
  it('authenticates before decoding malformed-URL objective writes', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(
      buildRequest('/progress/task/objective/%E0%A4%A', {
        method: 'POST',
        headers: { Authorization: 'Bearer tt_abc123', 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'completed' }),
      }),
      BASE_ENV
    );
    await expectErrorResponse(res, 401, 'Invalid token format');
  });
  it('returns 429 (not 400) on malformed-URL writes when the daily quota is exceeded', async () => {
    const env: Env = {
      ...BASE_ENV,
      API_GATEWAY_LIMITER: makeLimiter({ allowed: false, remaining: 0 }),
    };
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postTaskRequest('%E0%A4%A', { state: 'completed' }), env);
    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
  });
  it('rejects POST /progress/task/objective with malformed JSON body', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postObjectiveRequest('obj-1', '{not json'), BASE_ENV);
    await expectErrorResponse(res, 400, 'Invalid JSON body');
  });
  it('rejects POST /progress/task/objective with array JSON body', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postObjectiveRequest('obj-1', '[]'), BASE_ENV);
    await expectErrorResponse(res, 400, 'Invalid request body (expected object)');
  });
  it('rejects POST /progress/task/objective without state or count', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postObjectiveRequest('obj-1', {}), BASE_ENV);
    await expectErrorResponse(res, 400, 'Must provide state or count');
  });
  it('rejects POST /progress/task/objective with invalid state and echoes the value', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postObjectiveRequest('obj-1', { state: 'foo' }), BASE_ENV);
    await expectErrorResponse(res, 400, 'Invalid state "foo" (must be completed or uncompleted)');
  });
  it('rejects POST /progress/task/objective when state is not a string', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postObjectiveRequest('obj-1', { state: 123 }), BASE_ENV);
    await expectErrorResponse(res, 400, 'Invalid state "123" (must be completed or uncompleted)');
  });
  it('rejects POST /progress/task/objective with negative count', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const res = await worker.fetch(postObjectiveRequest('obj-1', { count: -1 }), BASE_ENV);
    await expectErrorResponse(res, 400, 'Invalid count (must be a non-negative number)');
  });
  it('accepts POST /progress/task/objective with URL-encoded valid objective ID', async () => {
    let mergePayload: MergeRpcPayload | null = null;
    const fetchMock = createBaseFetchMock({
      onMerge: (payload) => {
        mergePayload = payload;
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      postObjectiveRequest('obj-1%20', { state: 'completed' }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(mergePayload).not.toBeNull();
    const taskObjectives = (mergePayload as unknown as MergeRpcPayload).p_task_objectives as Record<
      string,
      { complete?: boolean }
    > | null;
    expect(taskObjectives?.['obj-1']?.complete).toBe(true);
  });
  it('objective count-only update does not carry stale complete state', async () => {
    let mergePayload: MergeRpcPayload | null = null;
    const fetchMock = createBaseFetchMock({
      onMerge: (payload) => {
        mergePayload = payload;
      },
      userProgress: {
        user_id: 'user-1',
        game_edition: 1,
        pvp_data: { taskObjectives: { 'obj-1': { complete: true, count: 0, timestamp: 1 } } },
        pve_data: null,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(postObjectiveRequest('obj-1', { count: 5 }), BASE_ENV);
    expect(res.status).toBe(200);
    const objectives = (mergePayload as unknown as MergeRpcPayload).p_task_objectives as Record<
      string,
      Record<string, unknown>
    > | null;
    expect(objectives?.['obj-1']?.count).toBe(5);
    expect('complete' in (objectives?.['obj-1'] ?? {})).toBe(false);
  });
  const bearerForMode = (mode: GameMode) =>
    `Bearer ${mode === 'seasonal' ? 'SZN' : mode.toUpperCase()}_abc123`;
  const progressRequest = (mode: GameMode = 'pvp', headers: Record<string, string> = {}) =>
    buildRequest('/progress', {
      method: 'GET',
      headers: { Authorization: bearerForMode(mode), ...headers },
    });
  const findModeProgressRequest = (fetchMock: ReturnType<typeof vi.fn>): URL | undefined => {
    const requestUrl = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => url.includes('/rest/v1/user_game_mode_progress'));
    return requestUrl ? new URL(requestUrl) : undefined;
  };
  it.each([
    ['pvp', 0, 'user_id,game_edition,pvp_data'],
    ['pve', 0, 'user_id,game_edition,pve_data'],
    ['seasonal', 1, 'user_id,game_edition'],
  ] as const)(
    'loads the normalized %s progress row for its season',
    async (mode, expectedSeason, expectedMetadataSelect) => {
      const fetchMock = createBaseFetchMock({ permissions: ['GP'], gameMode: mode });
      vi.stubGlobal('fetch', fetchMock);
      const res = await worker.fetch(progressRequest(mode), BASE_ENV);
      expect(res.status).toBe(200);
      const requestUrl = findModeProgressRequest(fetchMock as unknown as ReturnType<typeof vi.fn>);
      expect(requestUrl?.searchParams.get('game_mode')).toBe(`eq.${mode}`);
      expect(requestUrl?.searchParams.get('season_number')).toBe(`eq.${expectedSeason}`);
      expect(requestUrl?.searchParams.get('select')).toBe('user_id,progress_data');
      const metadataRequest = fetchMock.mock.calls
        .map((call) => new URL(String(call[0])))
        .find((url) => url.pathname.endsWith('/rest/v1/user_progress'));
      expect(metadataRequest?.searchParams.get('select')).toBe(expectedMetadataSelect);
    }
  );
  it('falls back to legacy persistent progress when the normalized row is missing', async () => {
    const fetchMock = createBaseFetchMock({
      gameMode: 'pvp',
      missingProgressUserIds: ['user-1'],
      permissions: ['GP'],
      userProgress: {
        game_edition: 3,
        pvp_data: { displayName: 'Legacy Player', level: 37, taskCompletions: {} },
        user_id: 'user-1',
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(progressRequest('pvp'), BASE_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { displayName: string; gameEdition: number; playerLevel: number };
    };
    expect(body.data).toMatchObject({
      displayName: 'Legacy Player',
      gameEdition: 3,
      playerLevel: 37,
    });
  });
  it('seeds the first write from legacy progress when the normalized row is unmaterialized', async () => {
    let mergePayload: MergeRpcPayload | null = null;
    const mergeStore: { data: Record<string, unknown> } = { data: { taskCompletions: {} } };
    const fetchMock = createBaseFetchMock({
      mergeStore,
      onMerge: (payload) => {
        mergePayload = payload;
      },
      tasks: [
        {
          id: 'task-main',
          name: 'Main Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [],
        },
        {
          id: 'task-other',
          name: 'Other Task',
          factionName: 'Any',
          objectives: [],
          taskRequirements: [],
        },
      ],
      userProgress: {
        game_edition: 1,
        progress_data: { taskCompletions: {} },
        pve_data: null,
        pvp_data: {
          displayName: 'Legacy Player',
          level: 37,
          taskCompletions: {
            'task-main': { complete: true, failed: false, timestamp: 1 },
            'task-other': { complete: true, failed: false, timestamp: 2 },
          },
        },
        user_id: 'user-1',
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(
      buildRequest('/progress/task/task-main', {
        method: 'POST',
        headers: { Authorization: 'Bearer PVP_abc123', 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'completed' }),
      }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    const payload = mergePayload as unknown as MergeRpcPayload;
    // The legacy snapshot is the diff base, so an already-complete task is a no-op.
    expect(payload.p_set?.lastApiUpdate).toBeUndefined();
    // The RPC seeds the unmaterialized row from the legacy column, so nothing is lost.
    expect(mergeStore.data).toMatchObject({
      displayName: 'Legacy Player',
      level: 37,
    });
    const storedCompletions = mergeStore.data.taskCompletions as Record<
      string,
      { complete?: boolean }
    >;
    expect(storedCompletions['task-main']?.complete).toBe(true);
    expect(storedCompletions['task-other']?.complete).toBe(true);
  });
  it('reads legacy progress for an unmaterialized normalized row', async () => {
    const fetchMock = createBaseFetchMock({
      gameMode: 'pvp',
      permissions: ['GP'],
      userProgress: {
        game_edition: 3,
        progress_data: { taskCompletions: {} },
        pvp_data: { displayName: 'Legacy Player', level: 37, taskCompletions: {} },
        user_id: 'user-1',
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(progressRequest('pvp'), BASE_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { playerLevel: number } };
    expect(body.data.playerLevel).toBe(37);
  });
  it('retains account edition when a team member has no active mode progress row', async () => {
    const fetchMock = createBaseFetchMock({
      permissions: ['TP'],
      gameMode: 'seasonal',
      teamId: 'team-1',
      teamMembers: ['user-1', 'user-2'],
      missingProgressUserIds: ['user-2'],
      userProgress: { user_id: 'user-1', game_edition: 4 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(teamProgressRequest('seasonal'), BASE_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ gameEdition: number; userId: string }> };
    const byUser = new Map(body.data.map((entry) => [entry.userId, entry.gameEdition]));
    expect(byUser.get('user-1')).toBe(4);
    expect(byUser.get('user-2')).toBe(4);
  });
  it('falls back to legacy persistent progress for team members missing normalized rows', async () => {
    const fetchMock = createBaseFetchMock({
      gameMode: 'pve',
      missingProgressUserIds: ['user-2'],
      permissions: ['TP'],
      teamId: 'team-1',
      teamMembers: ['user-1', 'user-2'],
      userProgress: {
        game_edition: 2,
        pve_data: { displayName: 'Legacy Teammate', level: 31, taskCompletions: {} },
        user_id: 'user-1',
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(teamProgressRequest('pve'), BASE_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ displayName: string; playerLevel: number; userId: string }>;
    };
    expect(body.data.find((entry) => entry.userId === 'user-2')).toMatchObject({
      displayName: 'Legacy Teammate',
      playerLevel: 31,
    });
    const editionRequest = fetchMock.mock.calls
      .map((call) => new URL(String(call[0])))
      .find((url) => url.pathname.endsWith('/rest/v1/user_progress'));
    expect(editionRequest?.searchParams.get('select')).toBe('user_id,game_edition,pve_data');
  });
  it.each([
    ['pvp', 'user_id,game_edition,pvp_data'],
    ['pve', 'user_id,game_edition,pve_data'],
    ['seasonal', 'user_id,game_edition'],
  ] as const)(
    'narrows the solo team-progress edition select for %s',
    async (mode, expectedEditionSelect) => {
      const fetchMock = createBaseFetchMock({
        permissions: ['TP'],
        gameMode: mode,
        teamId: null,
        userProgress: { user_id: 'user-1', game_edition: 5 },
      });
      vi.stubGlobal('fetch', fetchMock);
      const res = await worker.fetch(teamProgressRequest(mode), BASE_ENV);
      expect(res.status).toBe(200);
      const editionRequest = fetchMock.mock.calls
        .map((call) => new URL(String(call[0])))
        .find((url) => url.pathname.endsWith('/rest/v1/user_progress'));
      expect(editionRequest?.searchParams.get('select')).toBe(expectedEditionSelect);
    }
  );
  it('retains account edition in solo fallback without an active mode progress row', async () => {
    const fetchMock = createBaseFetchMock({
      permissions: ['TP'],
      gameMode: 'seasonal',
      teamId: null,
      missingProgressUserIds: ['user-1'],
      userProgress: { user_id: 'user-1', game_edition: 5 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(teamProgressRequest('seasonal'), BASE_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ gameEdition: number; userId: string }> };
    expect(body.data).toEqual([expect.objectContaining({ gameEdition: 5, userId: 'user-1' })]);
  });
  const teamProgressRequest = (mode: GameMode = 'pvp', headers: Record<string, string> = {}) =>
    buildRequest('/team/progress', {
      method: 'GET',
      headers: { Authorization: bearerForMode(mode), ...headers },
    });
  it.each([
    ['pvp', 0],
    ['pve', 0],
    ['seasonal', 1],
  ] as const)(
    'loads normalized team progress for %s and its season',
    async (mode, expectedSeason) => {
      const fetchMock = createBaseFetchMock({
        permissions: ['TP'],
        gameMode: mode,
        teamId: 'team-1',
        teamMembers: ['user-1', 'user-2'],
      });
      vi.stubGlobal('fetch', fetchMock);
      const res = await worker.fetch(teamProgressRequest(mode), BASE_ENV);
      expect(res.status).toBe(200);
      const requestUrl = findModeProgressRequest(fetchMock as unknown as ReturnType<typeof vi.fn>);
      expect(requestUrl?.searchParams.get('game_mode')).toBe(`eq.${mode}`);
      expect(requestUrl?.searchParams.get('season_number')).toBe(`eq.${expectedSeason}`);
      // Verify per-member mapping: each member gets their own row's displayName.
      const body = (await res.json()) as {
        data: Array<{ userId: string; displayName: string }>;
      };
      const byUser = new Map(body.data.map((d) => [d.userId, d.displayName]));
      expect(byUser.get('user-1')).toBe('Member-user-1');
      expect(byUser.get('user-2')).toBe('Member-user-2');
    }
  );
  it.each([
    ['pvp', 0],
    ['pve', 0],
    ['seasonal', 1],
  ] as const)(
    'loads normalized solo fallback progress for %s and its season',
    async (mode, expectedSeason) => {
      const fetchMock = createBaseFetchMock({
        permissions: ['TP'],
        gameMode: mode,
        teamId: null,
      });
      vi.stubGlobal('fetch', fetchMock);
      const res = await worker.fetch(teamProgressRequest(mode), BASE_ENV);
      expect(res.status).toBe(200);
      const requestUrl = findModeProgressRequest(fetchMock as unknown as ReturnType<typeof vi.fn>);
      expect(requestUrl?.searchParams.get('game_mode')).toBe(`eq.${mode}`);
      expect(requestUrl?.searchParams.get('season_number')).toBe(`eq.${expectedSeason}`);
    }
  );
  const manyCompletions = Object.fromEntries(
    Array.from({ length: 80 }, (_, i) => [
      `task-${i}`,
      { complete: true, failed: false, timestamp: 1 },
    ])
  );
  it('sets ETag, private Cache-Control, and Vary on GET /progress', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(progressRequest(), BASE_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=15');
    expect(res.headers.get('Vary')).toBe('Accept-Encoding, Authorization, Origin');
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('ETag');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('If-None-Match');
  });
  it('returns 304 with rate-limit headers when If-None-Match matches', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const first = await worker.fetch(progressRequest(), BASE_ENV);
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();
    const second = await worker.fetch(progressRequest('pvp', { 'If-None-Match': etag! }), BASE_ENV);
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    expect(second.headers.get('ETag')).toBe(etag);
    expect(second.headers.get('X-RateLimit-Limit')).toBe('1000');
    expect(second.headers.get('Cache-Control')).toBe('private, max-age=15');
  });
  it('returns the full body when If-None-Match does not match', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(
      progressRequest('pvp', { 'If-None-Match': 'W/"0000000000000000000000000000dead"' }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
  it('gzips large /progress responses when the client accepts gzip', async () => {
    vi.stubGlobal(
      'fetch',
      createBaseFetchMock({
        permissions: ['GP'],
        userProgress: {
          user_id: 'user-1',
          game_edition: 1,
          pvp_data: { taskCompletions: manyCompletions },
          pve_data: null,
        },
      })
    );
    const res = await worker.fetch(
      progressRequest('pvp', { 'Accept-Encoding': 'gzip, br' }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Encoding')).toBe('gzip');
    const decompressed = res.body!.pipeThrough(new DecompressionStream('gzip'));
    const body = (await new Response(decompressed).json()) as {
      success: boolean;
      data: { tasksProgress: unknown[] };
    };
    expect(body.success).toBe(true);
    expect(body.data.tasksProgress).toHaveLength(80);
  });
  it('does not gzip when the client does not accept gzip', async () => {
    vi.stubGlobal(
      'fetch',
      createBaseFetchMock({
        permissions: ['GP'],
        userProgress: {
          user_id: 'user-1',
          game_edition: 1,
          pvp_data: { taskCompletions: manyCompletions },
          pve_data: null,
        },
      })
    );
    const res = await worker.fetch(progressRequest(), BASE_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Encoding')).toBeNull();
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
  it.each([
    ['gzip;q=0', null],
    ['gzip;q=0.0', null],
    ['br, gzip;q=0', null],
    ['*;q=0, gzip', 'gzip'],
    ['gzip;q=0, *', null],
    ['*', 'gzip'],
    ['identity', null],
    ['gzip;q=0.5', 'gzip'],
    ['gzip;q=2', null],
    ['gzip;q=abc', null],
    ['gzip;q=1.0', 'gzip'],
  ])('honors Accept-Encoding %s', async (acceptEncoding, expected) => {
    vi.stubGlobal(
      'fetch',
      createBaseFetchMock({
        permissions: ['GP'],
        userProgress: {
          user_id: 'user-1',
          game_edition: 1,
          pvp_data: { taskCompletions: manyCompletions },
          pve_data: null,
        },
      })
    );
    const res = await worker.fetch(
      progressRequest('pvp', { 'Accept-Encoding': acceptEncoding }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Encoding')).toBe(expected);
  });
  it('does not gzip small responses even when the client accepts gzip', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(progressRequest('pvp', { 'Accept-Encoding': 'gzip' }), BASE_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Encoding')).toBeNull();
  });
  it('gzips small responses when the client accepts gzip but refuses identity', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(
      progressRequest('pvp', { 'Accept-Encoding': 'gzip, identity;q=0' }),
      BASE_ENV
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Encoding')).toBe('gzip');
  });
  it('returns 406 when no acceptable encoding exists', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(
      progressRequest('pvp', { 'Accept-Encoding': 'gzip;q=0, identity;q=0' }),
      BASE_ENV
    );
    expect(res.status).toBe(406);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('no_acceptable_encoding');
  });
  it('declares Vary and rate-limit headers on the 406 response', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(
      progressRequest('pvp', { 'Accept-Encoding': '*;q=0' }),
      BASE_ENV
    );
    expect(res.status).toBe(406);
    expect(res.headers.get('Vary')).toBe('Accept-Encoding, Authorization, Origin');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('1000');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });
  it('returns 304 for a wildcard If-None-Match without encoding the body', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const res = await worker.fetch(
      progressRequest('pvp', { 'If-None-Match': '*', 'Accept-Encoding': 'gzip, identity;q=0' }),
      BASE_ENV
    );
    expect(res.status).toBe(304);
    expect(await res.text()).toBe('');
    expect(res.headers.get('Content-Encoding')).toBeNull();
    expect(res.headers.get('Content-Type')).toBeNull();
    expect(res.headers.get('Vary')).toBe('Accept-Encoding, Authorization, Origin');
    expect(res.headers.get('ETag')).toMatch(/^W\/"[0-9a-f]{32}"$/);
  });
  it('supports the ETag/304 round-trip on GET /team/progress', async () => {
    const teamMock = () =>
      createBaseFetchMock({
        permissions: ['TP'],
        teamId: 'team-1',
        teamMembers: ['user-1', 'user-2'],
      });
    vi.stubGlobal('fetch', teamMock());
    const first = await worker.fetch(teamProgressRequest(), BASE_ENV);
    expect(first.status).toBe(200);
    const etag = first.headers.get('ETag');
    expect(etag).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(first.headers.get('Cache-Control')).toBe('private, max-age=15');
    expect(first.headers.get('Vary')).toBe('Accept-Encoding, Authorization, Origin');
    vi.stubGlobal('fetch', teamMock());
    const second = await worker.fetch(
      teamProgressRequest('pvp', { 'If-None-Match': etag! }),
      BASE_ENV
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    expect(second.headers.get('ETag')).toBe(etag);
  });
  it('routes a conditional-read failure through the router error envelope', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock({ permissions: ['GP'] }));
    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(
        async (
          algorithm: string | SubtleCryptoHashAlgorithm,
          data: ArrayBuffer | ArrayBufferView
        ) => {
          if (new TextDecoder().decode(data).startsWith('{"success":')) {
            throw new Error('digest unavailable');
          }
          return realDigest(algorithm, data);
        }
      );
    try {
      const res = await worker.fetch(progressRequest(), BASE_ENV);
      expect(res.status).toBe(500);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
      const body = (await res.json()) as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe('Internal server error');
    } finally {
      digest.mockRestore();
    }
  });
});
describe('ApiGatewayRateLimiter storage cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const createStorageMock = () => {
    const store = new Map<string, unknown>();
    let alarm: number | null = null;
    return {
      store,
      getAlarmCalls: () => alarm,
      deleteAllCount: 0,
      storage: {
        get: vi.fn(async (key: string) => store.get(key)),
        put: vi.fn(async (key: string, value: unknown) => {
          store.set(key, value);
        }),
        getAlarm: vi.fn(async () => alarm),
        setAlarm: vi.fn(async (time: number) => {
          alarm = time;
        }),
        deleteAlarm: vi.fn(async () => {
          alarm = null;
        }),
        deleteAll: vi.fn(async () => {
          store.clear();
          alarm = null;
        }),
      },
    };
  };
  const callLimit = (
    limiter: ApiGatewayRateLimiter,
    limit = 5,
    windowSec = 60,
    options: { retain?: boolean } = {}
  ) =>
    limiter.fetch(
      new Request('https://rate-limit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit, windowSec, ...options }),
      })
    );
  it('does not schedule a cleanup alarm when retain is set', async () => {
    const mock = createStorageMock();
    const limiter = new ApiGatewayRateLimiter(
      {
        storage: mock.storage,
      } as unknown as DurableObjectState,
      {} as Env
    );
    await callLimit(limiter, 5, 60, { retain: true });
    expect(mock.storage.setAlarm).not.toHaveBeenCalled();
  });
  it('schedules a cleanup alarm by default when retain is omitted', async () => {
    const mock = createStorageMock();
    const limiter = new ApiGatewayRateLimiter(
      {
        storage: mock.storage,
      } as unknown as DurableObjectState,
      {} as Env
    );
    const res = await callLimit(limiter);
    const body = (await res.json()) as { resetAt: number };
    expect(mock.storage.setAlarm).toHaveBeenCalledWith(body.resetAt + 1000);
  });
  it('wipes all storage when a cleanup alarm fires after expiry', async () => {
    const mock = createStorageMock();
    const limiter = new ApiGatewayRateLimiter(
      {
        storage: mock.storage,
      } as unknown as DurableObjectState,
      {} as Env
    );
    await callLimit(limiter, 5, 60);
    expect(mock.store.has('state')).toBe(true);
    const stored = mock.store.get('state') as { resetAt: number };
    vi.spyOn(Date, 'now').mockReturnValue(stored.resetAt + 5000);
    await limiter.alarm();
    expect(mock.storage.deleteAlarm).toHaveBeenCalledTimes(1);
    expect(mock.storage.deleteAll).toHaveBeenCalledTimes(1);
    expect(mock.store.has('state')).toBe(false);
  });
  it('retained active state is preserved by transitional alarm without rescheduling', async () => {
    const mock = createStorageMock();
    const limiter = new ApiGatewayRateLimiter(
      {
        storage: mock.storage,
      } as unknown as DurableObjectState,
      {} as Env
    );
    await callLimit(limiter, 5, 60, { retain: true });
    // Seed a legacy alarm over retained state (pre-deploy transitional drain).
    const stored = mock.store.get('state') as { resetAt: number };
    mock.storage.setAlarm.mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(stored.resetAt - 1000);
    await limiter.alarm();
    expect(mock.storage.deleteAlarm).not.toHaveBeenCalled();
    expect(mock.storage.deleteAll).not.toHaveBeenCalled();
    expect(mock.store.has('state')).toBe(true);
    expect(mock.storage.setAlarm).not.toHaveBeenCalled();
  });
  it('ephemeral active state is preserved and rescheduled by alarm', async () => {
    const mock = createStorageMock();
    const limiter = new ApiGatewayRateLimiter(
      {
        storage: mock.storage,
      } as unknown as DurableObjectState,
      {} as Env
    );
    await callLimit(limiter, 5, 60);
    const stored = mock.store.get('state') as { resetAt: number };
    mock.storage.setAlarm.mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(stored.resetAt - 1000);
    await limiter.alarm();
    expect(mock.storage.deleteAlarm).not.toHaveBeenCalled();
    expect(mock.storage.deleteAll).not.toHaveBeenCalled();
    expect(mock.store.has('state')).toBe(true);
    expect(mock.storage.setAlarm).toHaveBeenCalledWith(stored.resetAt + 1000);
  });
  it('cleanup alarm wipes expired state without rescheduling', async () => {
    const mock = createStorageMock();
    const limiter = new ApiGatewayRateLimiter(
      {
        storage: mock.storage,
      } as unknown as DurableObjectState,
      {} as Env
    );
    await callLimit(limiter, 5, 60);
    const stored = mock.store.get('state') as { resetAt: number };
    mock.storage.setAlarm.mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(stored.resetAt + 5000);
    await limiter.alarm();
    expect(mock.storage.deleteAlarm).toHaveBeenCalledTimes(1);
    expect(mock.storage.deleteAll).toHaveBeenCalledTimes(1);
    expect(mock.store.has('state')).toBe(false);
    expect(mock.storage.setAlarm).not.toHaveBeenCalled();
  });
});
