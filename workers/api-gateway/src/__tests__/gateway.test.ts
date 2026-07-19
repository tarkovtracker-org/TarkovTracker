import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { ApiGatewayRateLimiter } from '../index';
import { deleteMemoryCache } from '../utils/memory-cache';
import type { Env } from '../types';
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
const buildRequest = (path: string, init?: RequestInit) =>
  new Request(`https://api.tarkovtracker.org${path}`, init);
const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
type MergeRpcPayload = {
  p_user_id: string;
  p_field: 'pvp_data' | 'pve_data';
  p_task_completions: Record<string, Record<string, unknown>> | null;
  p_task_objectives: Record<string, Record<string, unknown>> | null;
  p_set: Record<string, unknown> | null;
};
// Mirrors the merge semantics of the merge_progress_data SQL function:
// taskCompletions shallow-merge, taskObjectives per-key deep-merge, set top-level merge.
const applyMergeRpc = (
  current: Record<string, unknown>,
  payload: MergeRpcPayload
): Record<string, unknown> => {
  const data = { ...current };
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
    if (url.includes('/rest/v1/rpc/merge_progress_data')) {
      const payload = JSON.parse(String(init?.body || '{}')) as MergeRpcPayload;
      onMerge?.(payload);
      const result = mergeResult ?? '1';
      if (mergeStore && Number(result) > 0) {
        mergeStore.data = applyMergeRpc(mergeStore.data, payload);
      }
      return new Response(result, { status: 200 });
    }
    if (url.includes('/rest/v1/user_progress')) {
      return jsonResponse([userProgress]);
    }
    if (url === 'https://api.tarkov.dev/graphql') {
      return jsonResponse({
        data: {
          tasks,
          hideoutStations: [],
        },
      });
    }
    return new Response('Not Found', { status: 404 });
  });
beforeEach(() => {
  deleteMemoryCache('tarkov:tasks');
  deleteMemoryCache('tarkov:hideout');
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
  it('redirects legacy /api/v2 routes with 308 when LEGACY_API_REDIRECT is true', async () => {
    const env: Env = { ...BASE_ENV, LEGACY_API_REDIRECT: 'true' };
    const res = await worker.fetch(
      new Request('https://tarkovtracker.org/api/v2/progress/task/task-1?foo=bar', {
        method: 'POST',
        headers: AUTH_HEADERS,
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
        headers: { Authorization: 'Bearer PVP_abc123' },
      }),
      env
    );
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://api.tarkovtracker.org/progress');
  });
  it('serves legacy /api/v2 routes normally when LEGACY_API_REDIRECT is off', async () => {
    const res = await worker.fetch(
      new Request('https://tarkovtracker.org/api/v2/progress', { method: 'GET' }),
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
  it('updates dependent and alternative tasks for single update', async () => {
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
          alternatives: [{ id: 'task-alt' }],
          objectives: [],
          taskRequirements: [],
        },
        {
          id: 'task-dependent',
          name: 'Dependent Task',
          factionName: 'Any',
          alternatives: [],
          objectives: [],
          taskRequirements: [{ task: { id: 'task-main' }, status: ['complete'] }],
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
    expect(taskCompletions?.['task-alt']?.complete).toBe(true);
    expect(taskCompletions?.['task-alt']?.failed).toBe(true);
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
          alternatives: [],
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
          alternatives: [],
          objectives: [],
          taskRequirements: [],
        },
        {
          id: 'task-dependent',
          name: 'Dependent Task',
          factionName: 'Any',
          alternatives: [],
          objectives: [],
          taskRequirements: [{ task: { id: 'task-main' }, status: ['complete'] }],
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
          alternatives: [],
          objectives: [],
          taskRequirements: [],
        },
        {
          id: 'task-second',
          name: 'Second Task',
          factionName: 'Any',
          alternatives: [],
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
            alternatives: [],
            objectives: [],
            taskRequirements: [],
          },
        ],
      })
    );
    const res = await worker.fetch(postTaskRequest('task-main', { state: 'completed' }), BASE_ENV);
    await expectErrorResponse(res, 500, 'Progress row not found for user');
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
      alternatives: [],
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
      if (url.includes('/rest/v1/user_progress')) {
        return jsonResponse([
          {
            user_id: 'user-1',
            current_game_mode: 'pvp',
            game_edition: 1,
            pvp_data: {
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
            pve_data: null,
          },
        ]);
      }
      if (url === 'https://api.tarkov.dev/graphql') {
        const data = {
          tasks: [
            {
              id: 'task-1',
              name: 'Task One',
              factionName: 'Any',
              alternatives: [],
              objectives: [{ id: 'obj-1', type: 'find', count: 2 }],
              taskRequirements: [],
            },
          ],
          hideoutStations: [
            {
              id: 'station-1',
              levels: [
                {
                  id: 'module-1',
                  level: 1,
                  itemRequirements: [{ id: 'part-1', count: 1 }],
                },
              ],
            },
          ],
        };
        return jsonResponse({ data });
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
          alternatives: [],
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
    const limiter = new ApiGatewayRateLimiter({
      storage: mock.storage,
    } as unknown as DurableObjectState);
    await callLimit(limiter, 5, 60, { retain: true });
    expect(mock.storage.setAlarm).not.toHaveBeenCalled();
  });
  it('schedules a cleanup alarm by default when retain is omitted', async () => {
    const mock = createStorageMock();
    const limiter = new ApiGatewayRateLimiter({
      storage: mock.storage,
    } as unknown as DurableObjectState);
    const res = await callLimit(limiter);
    const body = (await res.json()) as { resetAt: number };
    expect(mock.storage.setAlarm).toHaveBeenCalledWith(body.resetAt + 1000);
  });
  it('wipes all storage when a cleanup alarm fires after expiry', async () => {
    const mock = createStorageMock();
    const limiter = new ApiGatewayRateLimiter({
      storage: mock.storage,
    } as unknown as DurableObjectState);
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
    const limiter = new ApiGatewayRateLimiter({
      storage: mock.storage,
    } as unknown as DurableObjectState);
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
    const limiter = new ApiGatewayRateLimiter({
      storage: mock.storage,
    } as unknown as DurableObjectState);
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
    const limiter = new ApiGatewayRateLimiter({
      storage: mock.storage,
    } as unknown as DurableObjectState);
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
