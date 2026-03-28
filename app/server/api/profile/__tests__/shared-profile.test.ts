// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, H3EventContext } from 'h3';
type SiteConfigStackEntry = Record<string, unknown>;
const { mockGetRequestHeader, mockGetRouterParam, mockFetch } = vi.hoisted(() => ({
  mockGetRequestHeader: vi.fn(),
  mockGetRouterParam: vi.fn(),
  mockFetch: vi.fn(),
}));
const runtimeConfig = {
  apiProtection: {
    trustProxy: false,
  },
  sharedProfileCacheTtlMs: 5000,
  sharedProfileRateLimitPerMinute: 120,
  supabaseAnonKey: 'anon-key',
  supabaseServiceKey: 'service-key',
  supabaseUrl: 'https://test.supabase.co',
};
const createAbortError = (): Error => {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
};
vi.mock('h3', async () => {
  const actual = await vi.importActual('h3');
  return {
    ...actual,
    getRequestHeader: mockGetRequestHeader,
    getRouterParam: mockGetRouterParam,
  };
});
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
mockNuxtImport('useRouter', () => () => ({
  afterEach: vi.fn(),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
}));
describe('Shared Profile API', () => {
  let mockEvent: Partial<H3Event>;
  const BASE_SITE_CONTEXT: Pick<H3EventContext, 'siteConfig' | 'siteConfigNitroOrigin'> = {
    siteConfig: {
      stack: [] as Partial<SiteConfigStackEntry>[],
      push: vi.fn(() => () => {}),
      get: vi.fn(() => ({})),
    },
    siteConfigNitroOrigin: '',
  };
  afterEach(() => {
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch as typeof fetch);
    vi.clearAllMocks();
    runtimeConfig.apiProtection.trustProxy = false;
    runtimeConfig.sharedProfileCacheTtlMs = 5000;
    runtimeConfig.sharedProfileRateLimitPerMinute = 120;
    runtimeConfig.supabaseAnonKey = 'anon-key';
    runtimeConfig.supabaseServiceKey = 'service-key';
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    mockEvent = {
      node: {
        req: {} as H3Event['node']['req'],
        res: {
          setHeader: vi.fn(),
        } as unknown as H3Event['node']['res'],
      },
      context: {
        ...BASE_SITE_CONTEXT,
      },
    };
    mockGetRequestHeader.mockReturnValue(undefined);
    mockGetRouterParam.mockImplementation((_, key: string) => {
      if (key === 'userId') return '11111111-1111-4111-8111-111111111111';
      if (key === 'mode') return 'pvp';
      return undefined;
    });
  });
  it('rejects invalid UUID', async () => {
    mockGetRouterParam.mockImplementation((_, key: string) => {
      if (key === 'userId') return 'not-a-uuid';
      if (key === 'mode') return 'pvp';
      return undefined;
    });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toThrow('Invalid profile id');
  });
  it('rejects invalid mode', async () => {
    mockGetRouterParam.mockImplementation((_, key: string) => {
      if (key === 'userId') return '11111111-1111-4111-8111-111111111111';
      if (key === 'mode') return 'invalid';
      return undefined;
    });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toThrow('Invalid profile mode');
  });
  it('returns 500 when Supabase config is missing', async () => {
    runtimeConfig.supabaseUrl = '';
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Missing Supabase configuration for shared profiles',
    });
  });
  it('serves shared profiles in production mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    vi.resetModules();
    try {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              game_edition: 4,
              pve_data: { level: 1 },
              pvp_data: { displayName: 'PublicPlayer', level: 24 },
              user_id: '11111111-1111-4111-8111-111111111111',
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              profile_share_pvp_public: true,
              profile_share_pve_public: false,
              streamer_mode: false,
            },
          ],
        });
      const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
      await expect(handler(mockEvent as H3Event)).resolves.toEqual({
        data: { displayName: 'PublicPlayer', level: 24 },
        gameEdition: 4,
        mode: 'pvp',
        userId: '11111111-1111-4111-8111-111111111111',
        visibility: 'public',
      });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      vi.resetModules();
    }
  });
  it('returns 504 when auth context resolution times out', async () => {
    runtimeConfig.supabaseServiceKey = '';
    mockGetRequestHeader.mockImplementation((_, key: string) => {
      if (key === 'authorization') return 'Bearer owner-token';
      return undefined;
    });
    mockFetch.mockRejectedValueOnce(createAbortError());
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toMatchObject({
      statusCode: 504,
      statusMessage: 'Timed out while validating shared profile access',
    });
  });
  it('returns 504 when shared profile resource loading times out', async () => {
    mockFetch.mockRejectedValueOnce(createAbortError());
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toMatchObject({
      statusCode: 504,
      statusMessage: 'Timed out while loading shared profile data',
    });
  });
  it('returns 502 when shared profile resources cannot be loaded', async () => {
    mockFetch.mockRejectedValueOnce(new Error('upstream failure'));
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Failed to load shared profile data',
    });
  });
  it('returns 500 when profile query fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to load profile data',
    });
  });
  it('returns 404 when profile does not exist', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Profile not found',
    });
  });
  it('returns public shared profile when mode is public', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            game_edition: 4,
            pve_data: { level: 1 },
            pvp_data: { displayName: 'PublicPlayer', level: 24 },
            user_id: '11111111-1111-4111-8111-111111111111',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            profile_share_pvp_public: true,
            profile_share_pve_public: false,
            streamer_mode: false,
          },
        ],
      });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    const result = await handler(mockEvent as H3Event);
    expect(result).toEqual({
      data: { displayName: 'PublicPlayer', level: 24 },
      gameEdition: 4,
      mode: 'pvp',
      userId: '11111111-1111-4111-8111-111111111111',
      visibility: 'public',
    });
  });
  it('derives failed branch tasks from task failure metadata', async () => {
    mockGetRouterParam.mockImplementation((_, key: string) => {
      if (key === 'userId') return '11111111-1111-4111-8111-111111111111';
      if (key === 'mode') return 'pve';
      return undefined;
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            game_edition: 4,
            pve_data: {
              level: 33,
              taskCompletions: {
                '597a0f5686f774273b74f676': { complete: false, failed: false },
                '597a160786f77477531d39d2': { complete: true, failed: false, timestamp: 2000 },
              },
            },
            pvp_data: { level: 1 },
            user_id: '11111111-1111-4111-8111-111111111111',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            profile_share_pvp_public: false,
            profile_share_pve_public: true,
            streamer_mode: false,
          },
        ],
      })
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              tasks: [
                {
                  id: '597a0f5686f774273b74f676',
                  failConditions: [
                    {
                      __typename: 'TaskObjectiveTaskStatus',
                      status: ['complete'],
                      task: { id: '597a160786f77477531d39d2' },
                    },
                  ],
                },
                {
                  id: '597a160786f77477531d39d2',
                  failConditions: [],
                },
              ],
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      );
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    const result = await handler(mockEvent as H3Event);
    expect(result.mode).toBe('pve');
    expect(result.data?.taskCompletions).toMatchObject({
      '597a0f5686f774273b74f676': { complete: true, failed: true },
      '597a160786f77477531d39d2': { complete: true, failed: false },
    });
  });
  it('removes non-progress fields from shared profile payload', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            game_edition: 4,
            pve_data: { level: 1 },
            pvp_data: {
              displayName: 'PublicPlayer',
              level: 24,
              privateEmail: 'leak@example.com',
              secretToken: 'do-not-share',
            },
            user_id: '11111111-1111-4111-8111-111111111111',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            profile_share_pvp_public: true,
            profile_share_pve_public: false,
            streamer_mode: false,
          },
        ],
      });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    const result = await handler(mockEvent as H3Event);
    expect(result.data).toEqual({ displayName: 'PublicPlayer', level: 24 });
  });
  it('hides display name for public pvp profile when privacy mode is enabled', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            game_edition: 4,
            pve_data: { level: 1 },
            pvp_data: { displayName: 'PublicPlayer', level: 24 },
            user_id: '11111111-1111-4111-8111-111111111111',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            profile_share_pvp_public: true,
            profile_share_pve_public: false,
            streamer_mode: true,
          },
        ],
      });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    const result = await handler(mockEvent as H3Event);
    expect(result.data).toEqual({ level: 24 });
  });
  it('hides display name for public pve profile when privacy mode is enabled', async () => {
    mockGetRouterParam.mockImplementation((_, key: string) => {
      if (key === 'userId') return '11111111-1111-4111-8111-111111111111';
      if (key === 'mode') return 'pve';
      return undefined;
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            game_edition: 4,
            pve_data: { displayName: 'PublicPvePlayer', level: 31 },
            pvp_data: { level: 9 },
            user_id: '11111111-1111-4111-8111-111111111111',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            profile_share_pvp_public: false,
            profile_share_pve_public: true,
            streamer_mode: true,
          },
        ],
      });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    const result = await handler(mockEvent as H3Event);
    expect(result.mode).toBe('pve');
    expect(result.data).toEqual({ level: 31 });
  });
  it('blocks private shared profile for other users', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            game_edition: 3,
            pve_data: { level: 5 },
            pvp_data: { level: 17 },
            user_id: '11111111-1111-4111-8111-111111111111',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            profile_share_pvp_public: false,
            profile_share_pve_public: false,
            streamer_mode: false,
          },
        ],
      });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toThrow('Profile is private for this mode');
  });
  it('allows owner to view private profile without service key', async () => {
    runtimeConfig.supabaseServiceKey = '';
    mockGetRequestHeader.mockImplementation((_, key: string) => {
      if (key === 'authorization') return 'Bearer owner-token';
      return undefined;
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            game_edition: 2,
            pve_data: { level: 8 },
            pvp_data: { level: 12 },
            user_id: '11111111-1111-4111-8111-111111111111',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            profile_share_pvp_public: false,
            profile_share_pve_public: false,
            streamer_mode: false,
          },
        ],
      });
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    const result = await handler(mockEvent as H3Event);
    expect(result.visibility).toBe('owner');
    expect(result.data).toEqual({ level: 12 });
  });
  it('returns unavailable when service key is missing for non-owner view', async () => {
    runtimeConfig.supabaseServiceKey = '';
    const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
    await expect(handler(mockEvent as H3Event)).rejects.toThrow(
      'Shared profiles unavailable on this environment'
    );
  });
  it('refreshes cache after fixed ttl even when profile is read repeatedly', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      runtimeConfig.sharedProfileCacheTtlMs = 50;
      runtimeConfig.sharedProfileRateLimitPerMinute = 1000;
      vi.resetModules();
      const sharedCacheEntries = new Map<string, string>();
      const cacheApi = {
        match: vi.fn(async (request: Request) => {
          const payload = sharedCacheEntries.get(request.url);
          return payload
            ? new Response(payload, { headers: { 'Content-Type': 'application/json' } })
            : undefined;
        }),
        put: vi.fn(async (request: Request, response: Response) => {
          sharedCacheEntries.set(request.url, await response.clone().text());
        }),
      };
      vi.stubGlobal('caches', { default: cacheApi });
      let now = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              game_edition: 4,
              pve_data: { level: 1 },
              pvp_data: { displayName: 'PublicPlayer', level: 24 },
              user_id: '11111111-1111-4111-8111-111111111111',
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              profile_share_pvp_public: true,
              profile_share_pve_public: false,
              streamer_mode: false,
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              game_edition: 4,
              pve_data: { level: 1 },
              pvp_data: { displayName: 'RefreshedPlayer', level: 30 },
              user_id: '11111111-1111-4111-8111-111111111111',
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              profile_share_pvp_public: true,
              profile_share_pve_public: false,
              streamer_mode: false,
            },
          ],
        });
      const { default: handler } = await import('@/server/api/profile/[userId]/[mode].get');
      const first = await handler(mockEvent as H3Event);
      now = 30;
      const second = await handler(mockEvent as H3Event);
      now = 60;
      const third = await handler(mockEvent as H3Event);
      expect(first.data).toEqual({ displayName: 'PublicPlayer', level: 24 });
      expect(second.data).toEqual({ displayName: 'PublicPlayer', level: 24 });
      expect(third.data).toEqual({ displayName: 'RefreshedPlayer', level: 30 });
      expect(mockFetch).toHaveBeenCalledTimes(4);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      vi.unstubAllGlobals();
      vi.stubGlobal('fetch', mockFetch as typeof fetch);
      vi.resetModules();
    }
  });
});
