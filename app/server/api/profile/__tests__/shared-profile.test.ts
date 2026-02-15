// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, H3EventContext } from 'h3';
import type { SiteConfigInput } from 'site-config-stack';
const { mockGetRequestHeader, mockGetRouterParam, mockFetch } = vi.hoisted(() => ({
  mockGetRequestHeader: vi.fn(),
  mockGetRouterParam: vi.fn(),
  mockFetch: vi.fn(),
}));
const runtimeConfig = {
  supabaseAnonKey: 'anon-key',
  supabaseServiceKey: 'service-key',
  supabaseUrl: 'https://test.supabase.co',
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
      stack: [] as Partial<SiteConfigInput>[],
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
});
