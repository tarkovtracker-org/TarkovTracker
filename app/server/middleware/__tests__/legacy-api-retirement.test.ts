// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createApp, defineEventHandler, toWebHandler } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import retirement from '@/server/middleware/00.legacy-api-retirement';
import protection from '@/server/middleware/api-protection';
const { runtimeConfig } = vi.hoisted(() => ({
  runtimeConfig: vi.fn(() => ({
    apiProtection: { requireAuth: true },
    public: { appUrl: 'https://tarkovtracker.org' },
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon-key',
  })),
}));
mockNuxtImport('useRuntimeConfig', () => runtimeConfig);
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
const EXPECTED_JSON = {
  error: 'legacy_api_retired',
  message:
    'This legacy API address has been retired. Update your API base URL to https://api.tarkovtracker.org. See the documentation for migration instructions.',
  api_base_url: 'https://api.tarkovtracker.org',
  documentation_url: 'https://api.tarkovtracker.org/',
};
const HOSTS = ['tarkovtracker.org', 'www.tarkovtracker.org'];
const PATHS = ['/api/v2', '/api/token', '/api/progress', '/api/team/progress'];
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
function retirementHeaders(response: Response) {
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
  for (const header of ['access-control-allow-credentials', 'location', 'retry-after']) {
    expect(response.headers.has(header)).toBe(false);
  }
}
describe('legacy API retirement HTTP boundary', () => {
  const outbound = vi.fn(() => {
    throw new Error('Retirement must not contact auth, the database, or upstream services');
  });
  const downstream = vi.fn();
  const webHandler = toWebHandler(
    createApp()
      .use(retirement)
      .use(
        defineEventHandler(() => {
          downstream();
        })
      )
      .use(protection)
      .use(defineEventHandler(() => ({ frontend: true })))
  );
  const handle: typeof webHandler = (request, context) => {
    request.headers.set('Host', new URL(request.url).host);
    return webHandler(request, context);
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', outbound);
    vi.stubEnv('NODE_ENV', 'production');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it.each(HOSTS.flatMap((host) => PATHS.map((path) => [host, path])))(
    'returns HTTP 410 on %s%s for methods, descendants, slashes, and queries',
    async (host, path) => {
      for (const suffix of ['', '/', '?client=old', '/?client=old', '/task/objective/123?x=1']) {
        for (const method of METHODS) {
          const response = await handle(
            new Request(`https://${host}${path}${suffix}`, {
              method,
              headers: {
                Authorization: 'Bearer retired-secret',
                'Content-Type': 'application/json',
              },
              ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
                ? { body: '{invalid json' }
                : {}),
            })
          );
          expect(response.status).toBe(410);
          retirementHeaders(response);
          if (method === 'HEAD') expect(await response.text()).toBe('');
          else expect(await response.json()).toEqual(EXPECTED_JSON);
        }
      }
      expect(downstream).not.toHaveBeenCalled();
      expect(runtimeConfig).not.toHaveBeenCalled();
      expect(outbound).not.toHaveBeenCalled();
    }
  );
  it.each(HOSTS.flatMap((host) => PATHS.map((path) => [host, path])))(
    'allows browser preflight on %s%s without authenticating',
    async (host, path) => {
      for (const method of METHODS) {
        const response = await handle(
          new Request(`https://${host}${path}/?x=1`, {
            method: 'OPTIONS',
            headers: {
              Origin: 'https://legacy-client.example',
              'Access-Control-Request-Method': method,
              'Access-Control-Request-Headers':
                'authorization, CONTENT-TYPE, If-None-Match, Accept, User-Agent',
            },
          })
        );
        expect(response.status).toBe(204);
        expect(await response.text()).toBe('');
        expect(response.headers.get('access-control-allow-methods')?.split(', ')).toContain(method);
        expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
        expect(response.headers.has('access-control-allow-credentials')).toBe(false);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('access-control-max-age')).toBe('0');
      }
      expect(downstream).not.toHaveBeenCalled();
      expect(runtimeConfig).not.toHaveBeenCalled();
      expect(outbound).not.toHaveBeenCalled();
    }
  );
  it.each<Record<string, string>>([
    {},
    { Origin: 'https://client.example' },
    { 'Access-Control-Request-Method': 'POST' },
    { Origin: 'https://client.example', 'Access-Control-Request-Method': 'TRACE' },
    {
      Origin: 'https://client.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'X-Unsupported',
    },
  ])('returns the actual 410 for incomplete or unsupported preflight %j', async (headers) => {
    const response = await handle(
      new Request('https://tarkovtracker.org/api/progress', {
        method: 'OPTIONS',
        headers,
      })
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual(EXPECTED_JSON);
    expect(downstream).not.toHaveBeenCalled();
  });
  it('allows preflight without custom headers', async () => {
    const response = await handle(
      new Request('https://tarkovtracker.org/api/v2', {
        method: 'OPTIONS',
        headers: { Origin: 'null', 'Access-Control-Request-Method': 'GET' },
      })
    );
    expect(response.status).toBe(204);
  });
  it.each(['Authorization,', ',, authorization, Content-Type,, If-None-Match, '])(
    'ignores empty HTTP list elements in preflight headers %s',
    async (requested) => {
      const response = await handle(
        new Request('https://tarkovtracker.org/api/progress', {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://client.example',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': requested,
          },
        })
      );
      expect(response.status).toBe(204);
      expect(downstream).not.toHaveBeenCalled();
    }
  );
  it('still rejects unsupported headers mixed with empty list elements', async () => {
    const response = await handle(
      new Request('https://tarkovtracker.org/api/progress', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://client.example',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': ',Authorization,,X-Unsupported,',
        },
      })
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual(EXPECTED_JSON);
  });
  it.each([
    '/api/v20',
    '/api/v2-other',
    '/api/tokenize',
    '/api/progression',
    '/api/team/progress-report',
    '/api/tarkov/items',
    '/api/changelog',
    '/api/team/members',
    '/api/profile/123',
    '/health',
    '/health/',
    '/health?monitor=old',
    '/health/?monitor=old',
    '/healthcheck',
    '/health/child',
    '/',
    '/tasks',
  ])('preserves the normal middleware path for %s', async (path) => {
    const response = await handle(new Request(`https://tarkovtracker.org${path}`));
    expect(downstream).toHaveBeenCalledOnce();
    expect([401, 200]).toContain(response.status);
    expect(await response.text()).not.toContain('legacy_api_retired');
  });
  it.each([
    'api.tarkovtracker.org',
    'other.tarkovtracker.org',
    'tarkovtracker.org.example',
    'www.tarkovtracker.org.example',
    'tarkovtracker.org.',
    'localhost',
    'preview.pages.dev',
  ])('never retires requests on host %s', async (host) => {
    for (const path of [...PATHS, '/health']) {
      const response = await handle(new Request(`https://${host}${path}`));
      expect(response.status).not.toBe(410);
    }
    expect(downstream).toHaveBeenCalledTimes(PATHS.length + 1);
  });
  it('ignores a spoofed forwarded host', async () => {
    const response = await handle(
      new Request('https://preview.pages.dev/api/v2', {
        headers: { 'X-Forwarded-Host': 'tarkovtracker.org' },
      })
    );
    expect(response.status).not.toBe(410);
    expect(downstream).toHaveBeenCalledOnce();
  });
  it('cannot be bypassed by forwarding an API host on an apex request', async () => {
    const response = await handle(
      new Request('https://tarkovtracker.org/api/v2', {
        headers: { 'X-Forwarded-Host': 'api.tarkovtracker.org' },
      })
    );
    expect(response.status).toBe(410);
    expect(downstream).not.toHaveBeenCalled();
  });
  it('does not consume a submitted request body or access Cloudflare bindings', async () => {
    const request = new Request('https://tarkovtracker.org/api/progress/task', {
      method: 'POST',
      body: 'invalid json',
      headers: { Authorization: 'Bearer secret' },
    });
    const read = vi.spyOn(request, 'arrayBuffer').mockRejectedValue(new Error('body consumed'));
    const bindings = vi.fn(() => {
      throw new Error('binding accessed');
    });
    const cloudflare = Object.defineProperty({}, 'env', { get: bindings });
    const context = { cloudflare };
    const response = await handle(request, context);
    expect(response.status).toBe(410);
    expect(request.bodyUsed).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(bindings).not.toHaveBeenCalled();
    expect(downstream).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });
  it('is discovered before api-protection and preserves the existing Pages route boundary', () => {
    const directory = new URL('..', import.meta.url);
    const middleware = readdirSync(directory)
      .filter((file) => file.endsWith('.ts'))
      .sort();
    expect(middleware.indexOf('00.legacy-api-retirement.ts')).toBeLessThan(
      middleware.indexOf('api-protection.ts')
    );
    const config = readFileSync(new URL('../../../../nuxt.config.ts', import.meta.url), 'utf8');
    // Both Nitro routing and the compiled-output hook route APIs to the handler.
    // Health continues using the existing static Pages 404 instead of invoking Nitro.
    expect(
      config.match(/include: \['\/api\/\*', '\/overlay\/\*', '\/profile\/\*'\]/g)
    ).toHaveLength(2);
  });
});
