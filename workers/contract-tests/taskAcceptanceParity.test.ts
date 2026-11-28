// Exercise the pinned Worker's HTTP boundary against the browser's actual progress actions.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, defaultState } from '@/stores/progressState';
import { isTaskActive, isTaskComplete, isTaskFailed } from '@/utils/taskStatus';
import type { GameMode } from '@/utils/constants';
import worker from 'virtual:versioned-api/index';
import type { Env } from 'virtual:versioned-api/types';
import { deleteMemoryCache } from 'virtual:versioned-api/utils/memory-cache';
if (!process.env.TARKOV_VERSIONED_API_DIRECTORY)
  throw new Error('Run through pnpm run verify:api-parity to select the versioned API.');
const modes: GameMode[] = ['pvp', 'pve', 'seasonal'];
const upstreamMode = { pvp: 'regular', pve: 'pve', seasonal: 'pvp-season' };
const tokenPrefix = { pvp: 'PVP', pve: 'PVE', seasonal: 'SZN' };
const dataField = { pvp: 'pvp_data', pve: 'pve_data', seasonal: 'seasonal_data' };
const browserActions = {
  active: actions.setTaskActive,
  completed: actions.setTaskComplete,
  failed: actions.setTaskFailed,
  uncompleted: actions.setTaskUncompleted,
};
type State = keyof typeof browserActions;
type Completion = { active?: boolean; complete?: boolean; failed?: boolean; timestamp?: number };
type MergePayload = {
  p_field: string;
  p_task_completions: Record<string, Completion>;
  p_task_objectives: unknown;
  p_set: { lastApiUpdate?: { tasks: Array<{ id: string; state: State }> } } | null;
};
const env = {
  SUPABASE_URL: 'https://supabase.example',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  API_GATEWAY_LIMITER: {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async () => Response.json({ allowed: true, remaining: 100 }),
    }),
  },
} as unknown as Env;
const flags = (completion?: Completion) => ({
  active: isTaskActive(completion),
  complete: isTaskComplete(completion),
  failed: isTaskFailed(completion),
});
const request = (mode: GameMode, batch: boolean, state: State, taskId = 'target') =>
  new Request(`https://api.tarkovtracker.org/progress/${batch ? 'tasks' : `task/${taskId}`}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenPrefix[mode]}_acceptance_parity`,
      'Content-Type': 'application/json',
      'User-Agent': 'ConsumerParity/1.0 (+https://tarkovtracker.org)',
    },
    body: JSON.stringify(batch ? [{ id: taskId, state }] : { state }),
  });
const createBoundary = (mode: GameMode) => {
  const merges: MergePayload[] = [];
  const completions: Record<string, Completion> = {
    target: { complete: false, failed: false },
    successor: { active: true, complete: false, failed: false, timestamp: 1 },
  };
  let catalogAvailable = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/rest/v1/api_tokens')
        return Response.json([
          {
            token_id: 'acceptance-parity',
            user_id: 'parity-user',
            permissions: ['WP'],
            game_mode: mode,
            is_active: true,
            expires_at: null,
          },
        ]);
      if (
        url.pathname === '/rest/v1/rpc/increment_token_usage' ||
        url.pathname === '/rest/v1/rpc/record_api_usage'
      )
        return Response.json({ ok: true });
      if (url.pathname === '/rest/v1/supporters' || url.pathname === '/rest/v1/user_supporters')
        return Response.json([]);
      if (url.pathname === '/rest/v1/rpc/get_active_season_number') return Response.json(1);
      if (url.pathname === '/rest/v1/user_game_mode_progress') {
        expect(url.searchParams.get('game_mode')).toBe(`eq.${mode}`);
        expect(url.searchParams.get('season_number')).toBe(`eq.${mode === 'seasonal' ? 1 : 0}`);
        return Response.json([{ progress_data: { level: 1, taskCompletions: completions } }]);
      }
      if (url.pathname === '/rest/v1/rpc/merge_progress_data') {
        const payload = JSON.parse(String(init?.body)) as MergePayload;
        merges.push(payload);
        Object.assign(completions, payload.p_task_completions);
        return new Response('1');
      }
      if (url.origin === 'https://json.tarkov.dev') {
        expect(url.pathname).toBe(`/${upstreamMode[mode]}/tasks`);
        if (!catalogAvailable) return new Response('', { status: 503 });
        return Response.json({
          data: {
            tasks: {
              target: { id: 'target', objectives: [], taskRequirements: [], failConditions: [] },
              successor: {
                id: 'successor',
                objectives: [],
                failConditions: [],
                taskRequirements: [{ task: 'target', status: ['active'] }],
              },
            },
          },
        });
      }
      throw new Error(`Unexpected parity request: ${url.pathname}`);
    })
  );
  return {
    completions,
    merges,
    setCatalogAvailable: (value: boolean) => {
      catalogAvailable = value;
    },
  };
};
describe('browser and Worker explicit acceptance parity', () => {
  beforeEach(() => {
    for (const mode of Object.values(upstreamMode)) deleteMemoryCache(`tarkov:tasks:${mode}`);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it.each(modes.flatMap((mode) => [false, true].map((batch) => ({ mode, batch }))))(
    'matches browser lifecycle and changes only requested tasks in $mode (batch=$batch)',
    async ({ mode, batch }) => {
      const boundary = createBoundary(mode);
      const browser = structuredClone(defaultState);
      browser.currentGameMode = mode;
      browser[mode].taskCompletions = structuredClone(boundary.completions);
      // Repeat acceptance while its successor is already accepted, then exercise terminal/reset writes.
      for (const state of [
        'active',
        'active',
        'completed',
        'active',
        'failed',
        'uncompleted',
      ] as const) {
        browserActions[state].call(browser, 'target');
        const response = await worker.fetch(request(mode, batch, state), env);
        expect(response.status, await response.clone().text()).toBe(200);
        const payload = boundary.merges.at(-1)!;
        expect(payload.p_field).toBe(dataField[mode]);
        expect(Object.keys(payload.p_task_completions)).toEqual(['target']);
        expect(payload.p_task_objectives).toBeNull();
        expect(flags(payload.p_task_completions.target)).toEqual(
          flags(browser[mode].taskCompletions.target)
        );
        // Terminal precedence must not conceal a stale stored acceptance flag.
        expect(payload.p_task_completions.target.active).toBe(
          browser[mode].taskCompletions.target.active
        );
        expect(boundary.completions.successor).toEqual({
          active: true,
          complete: false,
          failed: false,
          timestamp: 1,
        });
        expect(browser[mode].taskCompletions.successor).toEqual(boundary.completions.successor);
        expect(payload.p_set?.lastApiUpdate?.tasks ?? []).toEqual(
          state === 'active' && boundary.merges.length === 2 ? [] : [{ id: 'target', state }]
        );
        for (const otherMode of modes.filter((entry) => entry !== mode))
          expect(browser[otherMode].taskCompletions).toEqual({});
      }
    }
  );
  it.each(modes)(
    'rejects unavailable catalogs and wrong-mode task IDs without writes in %s',
    async (mode) => {
      const boundary = createBoundary(mode);
      boundary.setCatalogAvailable(false);
      for (const batch of [false, true]) {
        expect((await worker.fetch(request(mode, batch, 'active'), env)).status).toBe(503);
        expect(boundary.merges).toEqual([]);
      }
      boundary.setCatalogAvailable(true);
      for (const batch of [false, true]) {
        expect(
          (await worker.fetch(request(mode, batch, 'active', 'other-mode-only'), env)).status
        ).toBe(400);
        expect(boundary.merges).toEqual([]);
      }
      expect((await worker.fetch(request(mode, false, 'active'), env)).status).toBe(200);
      expect(boundary.merges).toHaveLength(1);
    }
  );
});
