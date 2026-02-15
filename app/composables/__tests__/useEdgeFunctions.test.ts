// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mockFetch = vi.fn();
const mockSupabaseClient = {
  auth: {
    getSession: vi.fn(),
    refreshSession: vi.fn(),
  },
  functions: {
    invoke: vi.fn(),
  },
};
mockNuxtImport('useRouter', () => () => ({
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    client: mockSupabaseClient,
  },
}));
mockNuxtImport('useRuntimeConfig', () => () => ({
  public: {},
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
describe('useEdgeFunctions.getTeamMembers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('$fetch', mockFetch);
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'token-1' } },
      error: null,
    });
    mockSupabaseClient.auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'token-2' } },
      error: null,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('rejects malformed team id before making requests', async () => {
    const { useEdgeFunctions } = await import('@/composables/api/useEdgeFunctions');
    const edgeFunctions = useEdgeFunctions();
    await expect(edgeFunctions.getTeamMembers('team-1&select=*')).rejects.toThrow(
      'Invalid team id'
    );
    expect(mockSupabaseClient.auth.getSession).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled();
  });
  it('falls back to team-members when refresh retry fails with server error', async () => {
    const firstError = { status: 401 };
    const secondError = { status: 500 };
    mockFetch.mockRejectedValueOnce(firstError).mockRejectedValueOnce(secondError);
    mockSupabaseClient.functions.invoke.mockResolvedValue({
      data: { members: ['fallback-member'] },
      error: null,
    });
    const { useEdgeFunctions } = await import('@/composables/api/useEdgeFunctions');
    const edgeFunctions = useEdgeFunctions();
    await expect(edgeFunctions.getTeamMembers('team-1')).resolves.toEqual({
      members: ['fallback-member'],
      profiles: {},
    });
    expect(mockSupabaseClient.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/team/members',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer token-1',
        },
        method: 'GET',
        query: { teamId: 'team-1' },
      })
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/team/members',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer token-2',
        },
        method: 'GET',
        query: { teamId: 'team-1' },
      })
    );
    expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith('team-members', {
      body: { teamId: 'team-1' },
      method: 'POST',
    });
  });
  it('throws the retry auth error instead of the original auth error', async () => {
    const firstError = { status: 401 };
    const secondError = { status: 403 };
    mockFetch.mockRejectedValueOnce(firstError).mockRejectedValueOnce(secondError);
    const { useEdgeFunctions } = await import('@/composables/api/useEdgeFunctions');
    const edgeFunctions = useEdgeFunctions();
    await expect(edgeFunctions.getTeamMembers('team-1')).rejects.toBe(secondError);
    expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled();
  });
});
