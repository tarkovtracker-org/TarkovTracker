import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../index';
import { deleteMemoryCache } from '../utils/memory-cache';
import type { Env } from '../types';
const makeLimiter = () =>
  ({
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async () =>
        new Response(
          JSON.stringify({
            allowed: true,
            remaining: 10,
            resetAt: Date.now() + 60000,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        ),
    }),
  }) as unknown as DurableObjectNamespace;
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
type BaseFetchMockOptions = {
  onPatch?: (body: Record<string, unknown>) => void;
  tasks?: Array<Record<string, unknown>>;
  userProgress?: Record<string, unknown>;
};
const createBaseFetchMock = ({
  onPatch,
  tasks = [],
  userProgress = {
    user_id: 'user-1',
    game_edition: 1,
    pvp_data: { taskCompletions: {} },
    pve_data: null,
  },
}: BaseFetchMockOptions = {}) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/rest/v1/api_tokens')) {
      return jsonResponse([
        {
          token_id: 'token-1',
          user_id: 'user-1',
          token_hash: 'hash',
          permissions: ['WP'],
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
    if (url.includes('/rest/v1/user_progress') && init?.method === 'PATCH') {
      const patchBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      onPatch?.(patchBody);
      return new Response(null, { status: 204 });
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
  it('rejects missing bearer token', async () => {
    const res = await worker.fetch(buildRequest('/token', { method: 'GET' }), BASE_ENV);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });
  it('returns token info for valid token', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url;
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
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
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
  it('updates dependent and alternative tasks for single update', async () => {
    let patchBody: Record<string, unknown> | null = null;
    const fetchMock = createBaseFetchMock({
      onPatch: (body) => {
        patchBody = body;
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
    expect(patchBody).not.toBeNull();
    const dataField = (patchBody as { pvp_data?: { taskCompletions?: Record<string, unknown> } })
      .pvp_data;
    const taskCompletions = dataField?.taskCompletions as
      | Record<string, { complete?: boolean; failed?: boolean; timestamp?: number }>
      | undefined;
    expect(taskCompletions?.['task-main']?.complete).toBe(true);
    expect(taskCompletions?.['task-main']?.failed).toBe(false);
    expect(taskCompletions?.['task-alt']?.complete).toBe(true);
    expect(taskCompletions?.['task-alt']?.failed).toBe(true);
    expect(taskCompletions?.['task-dependent']?.complete).toBe(false);
    expect(taskCompletions?.['task-dependent']?.failed).toBe(false);
  });
  it('skips lastApiUpdate for idempotent single task updates', async () => {
    let patchBody: Record<string, unknown> | null = null;
    const fetchMock = createBaseFetchMock({
      onPatch: (body) => {
        patchBody = body;
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
    expect(patchBody).not.toBeNull();
    const pvpData = (patchBody as { pvp_data?: Record<string, unknown> }).pvp_data ?? {};
    expect(pvpData.lastApiUpdate).toBeUndefined();
  });
  it('preserves explicit dependent task states in batch updates', async () => {
    let patchBody: Record<string, unknown> | null = null;
    const fetchMock = createBaseFetchMock({
      onPatch: (body) => {
        patchBody = body;
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
    expect(patchBody).not.toBeNull();
    const pvpData = (patchBody as { pvp_data?: { taskCompletions?: Record<string, unknown> } })
      .pvp_data;
    const taskCompletions = pvpData?.taskCompletions as
      | Record<string, { complete?: boolean; failed?: boolean; timestamp?: number }>
      | undefined;
    expect(taskCompletions?.['task-main']?.complete).toBe(true);
    expect(taskCompletions?.['task-main']?.failed).toBe(false);
    expect(taskCompletions?.['task-dependent']?.complete).toBe(true);
    expect(taskCompletions?.['task-dependent']?.failed).toBe(false);
  });
  it('skips lastApiUpdate for idempotent batch task updates', async () => {
    let patchBody: Record<string, unknown> | null = null;
    const fetchMock = createBaseFetchMock({
      onPatch: (body) => {
        patchBody = body;
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
    const pvpData = (patchBody as { pvp_data?: Record<string, unknown> }).pvp_data ?? {};
    expect(pvpData.lastApiUpdate).toBeUndefined();
  });
  it('returns progress for valid token', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url;
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
});
