import { fileURLToPath, URL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestHarness, type TestHarness } from 'wrangler';
const GATEWAY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SUPABASE_URL = 'https://supabase.example/project';
const jsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
type OutboundRequest = {
  method: string;
  url: string;
};
const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.toString() : input.url;
};
const createOutboundFetchMock = (requests: OutboundRequest[], unhandledUrls: string[]) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(requestUrl(input));
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    requests.push({ method, url: url.toString() });
    if (url.pathname === '/project/rest/v1/api_tokens') {
      return jsonResponse([
        {
          token_id: 'runtime-token',
          user_id: 'runtime-user',
          permissions: ['GP'],
          game_mode: 'seasonal',
          note: 'runtime smoke',
          is_active: true,
          usage_count: 0,
          last_used_at: null,
          created_at: null,
          expires_at: null,
        },
      ]);
    }
    if (url.pathname === '/project/rest/v1/rpc/increment_token_usage') {
      return jsonResponse({ ok: true });
    }
    if (url.pathname === '/project/rest/v1/supporters') return jsonResponse([]);
    if (url.pathname === '/project/rest/v1/rpc/record_api_usage') {
      return jsonResponse({ ok: true });
    }
    if (url.pathname === '/project/rest/v1/rpc/get_active_season_number') {
      return jsonResponse(1);
    }
    if (url.pathname === '/project/rest/v1/user_game_mode_progress') {
      return jsonResponse([
        {
          user_id: 'runtime-user',
          progress_data: {
            displayName: 'Runtime Smoke',
            level: 7,
            pmcFaction: 'USEC',
            taskCompletions: {},
          },
        },
      ]);
    }
    if (url.pathname === '/project/rest/v1/user_progress') {
      return jsonResponse([{ user_id: 'runtime-user', game_edition: 1 }]);
    }
    if (url.toString() === 'https://json.tarkov.dev/pvp-season/tasks') {
      return jsonResponse({ data: { tasks: {} } });
    }
    if (url.toString() === 'https://json.tarkov.dev/pvp-season/hideout') {
      return jsonResponse({ data: {} });
    }
    unhandledUrls.push(url.toString());
    return new Response('Unhandled outbound request', { status: 500 });
  });
describe('api-gateway workerd smoke', () => {
  let harness: TestHarness | undefined;
  beforeAll(async () => {
    harness = createTestHarness({
      root: GATEWAY_ROOT,
      workers: [
        {
          configPath: './wrangler.toml',
          secrets: {
            IP_HASH_SECRET: 'ip-hash-secret',
            SUPABASE_URL,
            SUPABASE_ANON_KEY: 'anon-key',
            SUPABASE_SERVICE_ROLE_KEY: 'service-key',
          },
        },
      ],
    });
    await harness.listen();
  }, 30_000);
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    await harness?.close();
  }, 30_000);
  it('executes the Seasonal progress path with production configuration', async () => {
    if (!harness) throw new Error('Test harness did not start');
    const requests: OutboundRequest[] = [];
    const unhandledUrls: string[] = [];
    vi.stubGlobal('fetch', createOutboundFetchMock(requests, unhandledUrls));
    const response = await harness.getWorker().fetch('https://api.tarkovtracker.org/progress', {
      headers: {
        Authorization: 'Bearer SZN_workerd_test',
        'User-Agent': 'RuntimeSmoke/1.0 (+https://example.com)',
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        tasksProgress: [],
        taskObjectivesProgress: [],
        hideoutModulesProgress: [],
        hideoutPartsProgress: [],
        displayName: 'Runtime Smoke',
        userId: 'runtime-user',
        playerLevel: 7,
        gameEdition: 1,
        pmcFaction: 'USEC',
      },
      meta: {
        self: 'runtime-user',
        gameMode: 'seasonal',
      },
    });
    expect(requests).toContainEqual({
      method: 'POST',
      url: `${SUPABASE_URL}/rest/v1/rpc/get_active_season_number`,
    });
    const modeRequest = requests.find(({ url }) =>
      url.startsWith(`${SUPABASE_URL}/rest/v1/user_game_mode_progress?`)
    );
    expect(modeRequest).toBeDefined();
    const modeUrl = new URL(modeRequest!.url);
    expect(modeUrl.searchParams.get('user_id')).toBe('eq.runtime-user');
    expect(modeUrl.searchParams.get('game_mode')).toBe('eq.seasonal');
    expect(modeUrl.searchParams.get('season_number')).toBe('eq.1');
    expect(unhandledUrls).toEqual([]);
  }, 30_000);
});
