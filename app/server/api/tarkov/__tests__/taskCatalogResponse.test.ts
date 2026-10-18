// @vitest-environment node
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createApp, defineEventHandler, getQuery, toWebHandler } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventHandler } from 'h3';
const { fetcher } = vi.hoisted(() => ({ fetcher: vi.fn() }));
mockNuxtImport('useRuntimeConfig', () => () => ({
  publicCacheBypassEnabled: false,
  public: { appUrl: 'https://tarkovtracker.org' },
}));
vi.mock('@/server/utils/tarkov-json', () => ({
  createTarkovJsonTaskObjectivesFetcher: () => fetcher,
  createTarkovJsonTaskRewardsFetcher: () => fetcher,
}));
const body = '{ "data": { "tasks": [{"id":"task","name":"Équipement"}] } }\n';
const modes = ['regular', 'pve', 'pvp-season'];
async function routeHarness(route: string) {
  const cache = { match: vi.fn(), put: vi.fn() };
  vi.stubGlobal('caches', { default: cache });
  const handler: EventHandler =
    route === 'tasks-objectives'
      ? (await import('@/server/api/tarkov/tasks-objectives.get')).default
      : (await import('@/server/api/tarkov/tasks-rewards.get')).default;
  const app = createApp();
  app.use(handler);
  return { cache, request: toWebHandler(app) };
}
describe.each(['tasks-objectives', 'tasks-rewards'])('%s final cache response', (route) => {
  beforeEach(() => {
    vi.stubGlobal('defineEventHandler', defineEventHandler);
    vi.stubGlobal('getQuery', getQuery);
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each(modes)('streams final cached bytes without reparsing in %s', async (mode) => {
    const h = await routeHarness(route);
    for (const locale of ['en', 'fr']) {
      const cached = new Response(body, {
        headers: {
          'X-Cache-Response-Version': '1',
          'X-Cache-Stored-At': String(Date.now()),
          'X-Overlay-Version': 'fixture-v1',
          'X-Overlay-Sha256': 'fixture-sha',
          'Content-Length': '999',
        },
      });
      const parse = vi.spyOn(cached, 'json');
      h.cache.match.mockResolvedValueOnce(cached);
      const response = await h.request(
        new Request(`https://tarkovtracker.org/api/tarkov/${route}?lang=${locale}&gameMode=${mode}`)
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(body);
      expect(parse).not.toHaveBeenCalled();
      expect(response.headers.get('x-cache-status')).toBe('HIT');
      expect(response.headers.get('x-cache-key')).toContain(`-${locale}-${mode}`);
      expect(response.headers.get('x-overlay-sha256')).toBe('fixture-sha');
      expect(response.headers.has('x-cache-response-version')).toBe(false);
      expect(response.headers.has('x-cache-stored-at')).toBe(false);
      expect(response.headers.get('content-length')).not.toBe('999');
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(h.cache.put).not.toHaveBeenCalled();
  });
  it('keeps unmarked legacy entries readable during rollout', async () => {
    const h = await routeHarness(route);
    const legacy = new Response(body);
    const parse = vi.spyOn(legacy, 'json');
    h.cache.match.mockResolvedValueOnce(legacy);
    const response = await h.request(new Request(`https://tarkovtracker.org/api/tarkov/${route}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(JSON.parse(body));
    expect(parse).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
