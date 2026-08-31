/**
 * Team Members API Tests
 *
 * Tests the /api/team/members endpoint for:
 * - Team membership validation
 * - Profile data fallback handling
 * - Authentication context and manual validation fallback
 */
// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, H3EventContext } from 'h3';
type SiteConfigStackEntry = Record<string, unknown>;
const VALID_TEAM_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const { mockGetQuery, mockGetRequestHeader, mockFetch } = vi.hoisted(() => ({
  mockGetQuery: vi.fn(),
  mockGetRequestHeader: vi.fn(),
  mockFetch: vi.fn(),
}));
const runtimeConfig = {
  apiProtection: {
    trustProxy: false,
  },
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceKey: 'test-service-key',
  supabaseAnonKey: 'test-anon-key',
};
vi.mock('h3', async () => {
  const actual = await vi.importActual('h3');
  return {
    ...actual,
    getQuery: mockGetQuery,
    getRequestHeader: mockGetRequestHeader,
  };
});
global.fetch = mockFetch as typeof fetch;
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
mockNuxtImport('useRouter', () => () => ({
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));
describe('Team Members API', () => {
  let mockEvent: Partial<H3Event>;
  const BASE_SITE_CONTEXT: Pick<H3EventContext, 'siteConfig' | 'siteConfigNitroOrigin'> = {
    siteConfig: {
      stack: [] as Partial<SiteConfigStackEntry>[],
      push: vi.fn(() => () => {}),
      get: vi.fn(() => ({})),
    },
    siteConfigNitroOrigin: '',
  };
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runtime config to default state
    runtimeConfig.apiProtection.trustProxy = false;
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'test-service-key';
    runtimeConfig.supabaseAnonKey = 'test-anon-key';
    mockEvent = {
      node: {
        req: {} as H3Event['node']['req'],
        res: {
          setHeader: vi.fn(),
        } as unknown as H3Event['node']['res'],
      },
      context: {
        auth: {
          user: {
            id: '11111111-1111-4111-8111-111111111111',
          },
        },
        ...BASE_SITE_CONTEXT,
      },
    };
  });
  describe('Configuration validation', () => {
    it('should serve team members in production mode', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      try {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [
              { game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' },
            ],
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [
              {
                user_id: '11111111-1111-4111-8111-111111111111',
                display_name: 'Player1',
                level: 15,
                tasks_completed: 10,
              },
            ],
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [
              {
                game_edition: 3,
                user_id: '11111111-1111-4111-8111-111111111111',
              },
            ],
          });
        const { default: handler } = await import('@/server/api/team/members');
        await expect(handler(mockEvent as H3Event)).resolves.toEqual({
          members: ['11111111-1111-4111-8111-111111111111'],
          profiles: {
            '11111111-1111-4111-8111-111111111111': {
              displayName: 'Player1',
              gameEdition: 3,
              gameMode: 'pvp',
              level: 15,
              tasksCompleted: 10,
            },
          },
        });
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        vi.resetModules();
      }
    });
    it('should throw error when supabaseUrl is missing', async () => {
      runtimeConfig.supabaseUrl = '';
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Service configuration error');
    });
    it('should allow missing supabaseServiceKey when auth header exists', async () => {
      runtimeConfig.supabaseServiceKey = '';
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockGetRequestHeader.mockImplementation((_, header: string) => {
        if (header === 'authorization') return 'Bearer valid-token';
        return undefined;
      });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        });
      const { default: handler } = await import('@/server/api/team/members');
      const result = await handler(mockEvent as H3Event);
      expect(result.members).toEqual(['11111111-1111-4111-8111-111111111111']);
    });
    it('should require auth token when supabaseServiceKey is missing', async () => {
      runtimeConfig.supabaseServiceKey = '';
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockGetRequestHeader.mockReturnValue(undefined);
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Missing auth token');
    });
    it('should throw error when supabaseAnonKey is missing', async () => {
      runtimeConfig.supabaseAnonKey = '';
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Service configuration error');
    });
  });
  describe('Team membership validation', () => {
    it('should require teamId query parameter', async () => {
      mockGetQuery.mockReturnValue({});
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('teamId is required');
    });
    it.each([
      ['a query-injection payload', 'team-1&select=*'],
      ['a non-UUID alphanumeric id', 'abc'],
      ['a placeholder non-UUID string', 'not-a-uuid'],
      ['a UUID missing a segment', '33333333-3333-4333-8333'],
      ['a UUID with invalid characters', '33333333-3333-4333-8333-33333333333g'],
      ['an oversized string', 'a'.repeat(200)],
    ])('should reject %s as teamId', async (_description, teamId) => {
      mockGetQuery.mockReturnValue({ teamId });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Invalid teamId');
      expect(mockFetch).not.toHaveBeenCalled();
    });
    it('should reject a whitespace-only teamId as missing', async () => {
      mockGetQuery.mockReturnValue({ teamId: '   ' });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('teamId is required');
    });
    it('should accept a valid UUID teamId regardless of case', async () => {
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID.toUpperCase() });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: true, json: async () => [] });
      const { default: handler } = await import('@/server/api/team/members');
      const result = await handler(mockEvent as H3Event);
      expect(result.members).toEqual(['11111111-1111-4111-8111-111111111111']);
    });
    it('should require user to be team member', async () => {
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      // Mock empty membership check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Not a team member');
    });
    it('should handle failed membership check', async () => {
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      // Mock failed membership check
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Failed membership check');
    });
    it('should handle failed members fetch', async () => {
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockFetch
        // Mock successful membership check
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        // Mock failed fetch all members
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Failed to load members');
    });
    it('should return members when user is valid team member', async () => {
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      // Mock successful membership check
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        // Mock fetch all members
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { user_id: '11111111-1111-4111-8111-111111111111' },
            { user_id: '22222222-2222-4222-8222-222222222222' },
          ],
        })
        // Mock profiles fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              user_id: '11111111-1111-4111-8111-111111111111',
              display_name: 'Player1',
              level: 15,
              tasks_completed: 10,
            },
            {
              user_id: '22222222-2222-4222-8222-222222222222',
              display_name: 'Player2',
              level: 20,
              tasks_completed: 15,
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              game_edition: 3,
              user_id: '11111111-1111-4111-8111-111111111111',
            },
            {
              game_edition: 4,
              user_id: '22222222-2222-4222-8222-222222222222',
            },
          ],
        });
      const { default: handler } = await import('@/server/api/team/members');
      const result = await handler(mockEvent as H3Event);
      expect(result).toEqual({
        members: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
        profiles: {
          '11111111-1111-4111-8111-111111111111': {
            displayName: 'Player1',
            gameEdition: 3,
            gameMode: 'pvp',
            level: 15,
            tasksCompleted: 10,
          },
          '22222222-2222-4222-8222-222222222222': {
            displayName: 'Player2',
            gameEdition: 4,
            gameMode: 'pvp',
            level: 20,
            tasksCompleted: 15,
          },
        },
      });
    });
  });
  describe('Profile fallback handling', () => {
    it('returns a partial team response when the legacy fallback fetch throws', async () => {
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_edition: 3, user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockRejectedValueOnce(new Error('Timed out while loading team metadata'));
      const { default: handler } = await import('@/server/api/team/members');
      const result = await handler(mockEvent as H3Event);
      expect(result.members).toEqual(['11111111-1111-4111-8111-111111111111']);
      expect(result.profiles).toEqual({});
    });
    it('falls back to legacy progress when the summary row has no level', async () => {
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              display_name: null,
              level: null,
              tasks_completed: 0,
              user_id: '11111111-1111-4111-8111-111111111111',
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_edition: 3, user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              pvp_data: {
                displayName: 'Placeholder Recovered',
                level: 21,
                taskCompletions: { a: true },
              },
              user_id: '11111111-1111-4111-8111-111111111111',
            },
          ],
        });
      const { default: handler } = await import('@/server/api/team/members');
      const result = await handler(mockEvent as H3Event);
      expect(result.profiles['11111111-1111-4111-8111-111111111111']).toEqual({
        displayName: 'Placeholder Recovered',
        gameEdition: 3,
        gameMode: 'pvp',
        level: 21,
        tasksCompleted: 1,
      });
    });
    it('summarizes legacy persistent progress when normalized team rows are missing', async () => {
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_edition: 3, user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              pve_data: {},
              pvp_data: {
                displayName: 'Legacy Teammate',
                level: 34,
                taskCompletions: {
                  complete: { complete: true },
                  pending: { complete: false },
                },
              },
              user_id: '11111111-1111-4111-8111-111111111111',
            },
          ],
        });
      const { default: handler } = await import('@/server/api/team/members');
      const result = await handler(mockEvent as H3Event);
      expect(result.profiles['11111111-1111-4111-8111-111111111111']).toEqual({
        displayName: 'Legacy Teammate',
        gameEdition: 3,
        gameMode: 'pvp',
        level: 34,
        tasksCompleted: 1,
      });
    });
    it('reads the season-aware summary view instead of progress blobs', async () => {
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { game_mode: 'seasonal', user_id: '11111111-1111-4111-8111-111111111111' },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              user_id: '11111111-1111-4111-8111-111111111111',
              display_name: 'Seasonal Player',
              level: 12,
              tasks_completed: 3,
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_edition: 1, user_id: '11111111-1111-4111-8111-111111111111' }],
        });
      const { default: handler } = await import('@/server/api/team/members');
      await handler(mockEvent as H3Event);
      const profileUrl = String(mockFetch.mock.calls[2]?.[0] ?? '');
      expect(profileUrl).toContain('team_member_mode_summary');
      expect(profileUrl).toContain('season_number=eq.1');
      expect(profileUrl).not.toContain('progress_data');
      expect(mockFetch.mock.calls.some((call) => String(call[0]).includes('progress_data'))).toBe(
        false
      );
    });
    it('keeps profiles available when optional edition metadata fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [
              { game_mode: 'seasonal', user_id: '11111111-1111-4111-8111-111111111111' },
            ],
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [
              {
                user_id: '11111111-1111-4111-8111-111111111111',
                display_name: 'Seasonal Player',
                level: 12,
                tasks_completed: null,
              },
            ],
          })
          .mockResolvedValueOnce({ ok: false, status: 503 });
        const { default: handler } = await import('@/server/api/team/members');
        const result = await handler(mockEvent as H3Event);
        expect(result.profiles['11111111-1111-4111-8111-111111111111']).toEqual({
          displayName: 'Seasonal Player',
          gameEdition: 1,
          gameMode: 'seasonal',
          level: 12,
          tasksCompleted: null,
        });
        expect(warnSpy).toHaveBeenCalledWith(
          '[TeamMembers]',
          'Team edition metadata fetch failed',
          { status: 503, teamId: VALID_TEAM_ID }
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
    it('should fall back to individual fetches if bulk fetch fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
        mockFetch
          // Mock successful membership check
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [
              { game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' },
            ],
          })
          // Mock fetch all members
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
          })
          // Mock profiles bulk fetch FAILS
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Internal server error',
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [
              {
                game_edition: 2,
                user_id: '11111111-1111-4111-8111-111111111111',
              },
            ],
          })
          // Mock individual profile fetch succeeds
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [
              {
                user_id: '11111111-1111-4111-8111-111111111111',
                display_name: 'Player1',
                level: 10,
                tasks_completed: 5,
              },
            ],
          });
        const { default: handler } = await import('@/server/api/team/members');
        const result = await handler(mockEvent as H3Event);
        expect(result.profiles['11111111-1111-4111-8111-111111111111']).toEqual({
          displayName: 'Player1',
          gameEdition: 2,
          gameMode: 'pvp',
          level: 10,
          tasksCompleted: 5,
        });
        expect(errorSpy).toHaveBeenCalledWith(
          '[TeamMembers]',
          'Profiles fetch error (500):',
          'Internal server error'
        );
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
  describe('Authentication fallback', () => {
    it('should reject malformed auth context user id', async () => {
      mockEvent.context = {
        auth: {
          user: {
            id: 'not-a-uuid',
          },
        },
        ...BASE_SITE_CONTEXT,
      };
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Invalid token');
    });
    it('should validate auth token when context.auth is missing', async () => {
      mockEvent.context = { ...BASE_SITE_CONTEXT };
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockGetRequestHeader.mockImplementation((_, header: string) => {
        if (header === 'authorization') return 'Bearer valid-token';
        return undefined;
      });
      // Mock auth validation
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
        })
        // Mock membership check
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ game_mode: 'pvp', user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        // Mock fetch all members
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        // Mock profiles fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        });
      const { default: handler } = await import('@/server/api/team/members');
      const result = await handler(mockEvent as H3Event);
      expect(result.members).toEqual(['11111111-1111-4111-8111-111111111111']);
    });
    it('should reject requests without auth token or context', async () => {
      mockEvent.context = { ...BASE_SITE_CONTEXT };
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockGetRequestHeader.mockReturnValue(undefined); // No auth header
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Missing auth token');
    });
    it('should reject requests with invalid auth token format', async () => {
      mockEvent.context = { ...BASE_SITE_CONTEXT };
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockGetRequestHeader.mockImplementation((_, header: string) => {
        if (header === 'authorization') return 'InvalidFormat token123';
        return undefined;
      });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Missing auth token');
    });
    it('should reject requests when token validation fails', async () => {
      mockEvent.context = { ...BASE_SITE_CONTEXT };
      mockGetQuery.mockReturnValue({ teamId: VALID_TEAM_ID });
      mockGetRequestHeader.mockImplementation((_, header: string) => {
        if (header === 'authorization') return 'Bearer invalid-token';
        return undefined;
      });
      // Mock auth validation failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Invalid token');
    });
  });
});
