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
import type { SiteConfigInput } from 'site-config-stack';
const { mockGetQuery, mockGetRequestHeader, mockFetch } = vi.hoisted(() => ({
  mockGetQuery: vi.fn(),
  mockGetRequestHeader: vi.fn(),
  mockFetch: vi.fn(),
}));
const runtimeConfig = {
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
      stack: [] as Partial<SiteConfigInput>[],
      push: vi.fn(() => () => {}),
      get: vi.fn(() => ({})),
    },
    siteConfigNitroOrigin: '',
  };
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runtime config to default state
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
    it('should throw error when supabaseUrl is missing', async () => {
      runtimeConfig.supabaseUrl = '';
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow(
        'Missing required environment variables'
      );
    });
    it('should allow missing supabaseServiceKey when auth header exists', async () => {
      runtimeConfig.supabaseServiceKey = '';
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      mockGetRequestHeader.mockImplementation((_, header: string) => {
        if (header === 'authorization') return 'Bearer valid-token';
        return undefined;
      });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
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
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      mockGetRequestHeader.mockReturnValue(undefined);
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Missing auth token');
    });
    it('should throw error when supabaseAnonKey is missing', async () => {
      runtimeConfig.supabaseAnonKey = '';
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow(
        'Missing required environment variables'
      );
    });
  });
  describe('Team membership validation', () => {
    it('should require teamId query parameter', async () => {
      mockGetQuery.mockReturnValue({});
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('teamId is required');
    });
    it('should reject invalid teamId format', async () => {
      mockGetQuery.mockReturnValue({ teamId: 'team-1&select=*' });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Invalid teamId');
    });
    it('should require user to be team member', async () => {
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      // Mock empty membership check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Not a team member');
    });
    it('should handle failed membership check', async () => {
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      // Mock failed membership check
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Failed membership check');
    });
    it('should handle failed members fetch', async () => {
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      mockFetch
        // Mock successful membership check
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
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
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      // Mock successful membership check
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
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
              current_game_mode: 'pvp',
              pvp_display_name: 'Player1',
              pvp_level: 15,
              pvp_tasks_completed: 10,
            },
            {
              user_id: '22222222-2222-4222-8222-222222222222',
              current_game_mode: 'pve',
              pve_display_name: 'Player2',
              pve_level: 20,
              pve_tasks_completed: 15,
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
            level: 15,
            tasksCompleted: 10,
          },
          '22222222-2222-4222-8222-222222222222': {
            displayName: 'Player2',
            level: 20,
            tasksCompleted: 15,
          },
        },
      });
    });
  });
  describe('Profile fallback handling', () => {
    it('should fall back to individual fetches if bulk fetch fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mockGetQuery.mockReturnValue({ teamId: 'team-456' });
        mockFetch
          // Mock successful membership check
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
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
          // Mock individual profile fetch succeeds
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [
              {
                user_id: '11111111-1111-4111-8111-111111111111',
                current_game_mode: 'pvp',
                pvp_display_name: 'Player1',
                pvp_level: 10,
                pvp_tasks_completed: 5,
              },
            ],
          });
        const { default: handler } = await import('@/server/api/team/members');
        const result = await handler(mockEvent as H3Event);
        expect(result.profiles['11111111-1111-4111-8111-111111111111']).toEqual({
          displayName: 'Player1',
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
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Invalid token');
    });
    it('should validate auth token when context.auth is missing', async () => {
      mockEvent.context = { ...BASE_SITE_CONTEXT };
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
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
          json: async () => [{ user_id: '11111111-1111-4111-8111-111111111111' }],
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
        });
      const { default: handler } = await import('@/server/api/team/members');
      const result = await handler(mockEvent as H3Event);
      expect(result.members).toEqual(['11111111-1111-4111-8111-111111111111']);
    });
    it('should reject requests without auth token or context', async () => {
      mockEvent.context = { ...BASE_SITE_CONTEXT };
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      mockGetRequestHeader.mockReturnValue(undefined); // No auth header
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Missing auth token');
    });
    it('should reject requests with invalid auth token format', async () => {
      mockEvent.context = { ...BASE_SITE_CONTEXT };
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
      mockGetRequestHeader.mockImplementation((_, header: string) => {
        if (header === 'authorization') return 'InvalidFormat token123';
        return undefined;
      });
      const { default: handler } = await import('@/server/api/team/members');
      await expect(handler(mockEvent as H3Event)).rejects.toThrow('Missing auth token');
    });
    it('should reject requests when token validation fails', async () => {
      mockEvent.context = { ...BASE_SITE_CONTEXT };
      mockGetQuery.mockReturnValue({ teamId: 'team-456' });
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
