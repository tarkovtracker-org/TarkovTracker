/**
 * Composable for calling Supabase Edge Functions
 * Provides typed methods for common edge function operations
 */
import { getErrorStatus } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { shouldFallbackForUnavailableTokenFunction } from '@/utils/tokenFunctionFallback';
import type { PurgeCacheResponse } from '@/types/edge';
import type {
  CreateTeamResponse,
  JoinTeamResponse,
  KickMemberResponse,
  LeaveTeamResponse,
} from '@/types/team';
type GameMode = 'pvp' | 'pve';
const TEAM_ID_REGEX = /^[a-zA-Z0-9-]{1,64}$/;
const isAuthOrMembershipStatus = (status: number | null): boolean =>
  status === 401 || status === 403;
const assertValidTeamId = (teamId: string) => {
  if (!TEAM_ID_REGEX.test(teamId)) {
    throw new Error('Invalid team id');
  }
};
interface NormalizedFunctionError {
  cause: unknown;
  code: 'FUNCTION_HTTP_ERROR';
  data: unknown;
  functionName: string;
  message: string;
  name: 'SupabaseFunctionError';
  status: number;
  statusText: string;
}
const normalizeFunctionError = async <TError>(
  fnName: string,
  error: TError
): Promise<TError | NormalizedFunctionError> => {
  if (!error || typeof error !== 'object') {
    return error;
  }
  const context = 'context' in error ? error.context : null;
  if (!(context instanceof Response)) {
    return error;
  }
  let data: unknown;
  try {
    data = await context.clone().json();
  } catch {
    try {
      const text = await context.clone().text();
      data = text.trim().length > 0 ? text : null;
    } catch {
      data = null;
    }
  }
  return {
    cause: error,
    code: 'FUNCTION_HTTP_ERROR',
    data,
    functionName: fnName,
    message:
      'message' in error && typeof error.message === 'string'
        ? error.message
        : `Supabase function ${fnName} failed`,
    name: 'SupabaseFunctionError',
    status: context.status,
    statusText: context.statusText,
  };
};
export const useEdgeFunctions = () => {
  const { $supabase } = useNuxtApp();
  const getAuthToken = async () => {
    await $supabase.ready();
    const { data, error } = await $supabase.client.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (token) {
      return token;
    }
    const { data: refreshData, error: refreshError } = await $supabase.client.auth.refreshSession();
    if (refreshError) throw refreshError;
    const refreshedToken = refreshData.session?.access_token;
    if (refreshedToken) {
      return refreshedToken;
    }
    throw new Error('User not authenticated');
  };
  const invokeSupabaseFunction = async <T>(
    fnName: string,
    body: Record<string, unknown>,
    method: 'POST' | 'GET' | 'DELETE' | 'PUT'
  ) => {
    await getAuthToken();
    let { data, error } = await $supabase.client.functions.invoke<T>(fnName, {
      body,
      method,
    });
    if (!error) {
      return data as T;
    }
    if (getErrorStatus(error) === 401) {
      try {
        const { data: refreshData, error: refreshError } =
          await $supabase.client.auth.refreshSession();
        if (!refreshError && refreshData.session?.access_token) {
          ({ data, error } = await $supabase.client.functions.invoke<T>(fnName, {
            body,
            method,
          }));
        }
      } catch (refreshSessionError) {
        logger.debug(`[EdgeFunctions] Session refresh failed during ${fnName}:`, {
          refreshSessionError,
        });
      }
    }
    if (error) {
      throw await normalizeFunctionError(fnName, error);
    }
    return data as T;
  };
  const callSupabaseFunction = async <T>(
    fnName: string,
    body: Record<string, unknown>,
    method: 'POST' | 'GET' | 'DELETE' | 'PUT' = 'POST'
  ) => {
    return await invokeSupabaseFunction<T>(fnName, body, method);
  };
  const getTeamMembers = async (
    teamId: string
  ): Promise<{
    members: string[];
    profiles?: Record<
      string,
      { displayName: string | null; level: number | null; tasksCompleted: number | null }
    >;
  }> => {
    assertValidTeamId(teamId);
    const callTeamMembersApi = async (token: string) => {
      return await $fetch<{
        members: string[];
        profiles?: Record<
          string,
          { displayName: string | null; level: number | null; tasksCompleted: number | null }
        >;
      }>(`/api/team/members`, {
        method: 'GET',
        query: { teamId },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    };
    const token = await getAuthToken();
    try {
      const result = await callTeamMembersApi(token);
      return result;
    } catch (error) {
      let latestError = error;
      let status = getErrorStatus(latestError);
      if (status === 401) {
        try {
          const { data, error: refreshError } = await $supabase.client.auth.refreshSession();
          const refreshedToken = data?.session?.access_token;
          if (!refreshError && refreshedToken) {
            try {
              return await callTeamMembersApi(refreshedToken);
            } catch (retryError) {
              latestError = retryError;
              status = getErrorStatus(retryError);
            }
          }
        } catch (refreshSessionError) {
          logger.debug('[EdgeFunctions] Session refresh failed during team member fetch:', {
            refreshSessionError,
          });
        }
      }
      if (isAuthOrMembershipStatus(status)) {
        logger.debug(
          '[EdgeFunctions] /api/team/members auth/membership error, skipping fallback:',
          {
            status,
          }
        );
        throw latestError;
      }
      logger.warn(
        '[EdgeFunctions] /api/team/members failed, falling back to team-members:',
        latestError
      );
      const fallback = await callSupabaseFunction<{ members: string[] }>('team-members', {
        teamId,
      });
      return { members: fallback?.members || [], profiles: {} };
    }
  };
  /**
   * Create a new team
   * @param name Team name
   * @param joinCode Team join/invite code
   * @param maxMembers Maximum number of team members (2-10)
   * @param gameMode Game mode for the team ('pvp' or 'pve')
   */
  const createTeam = async (
    name: string,
    joinCode: string,
    maxMembers = 5,
    gameMode: GameMode = 'pvp'
  ): Promise<CreateTeamResponse> => {
    if (!joinCode || joinCode.trim().length === 0) {
      throw new Error('Join code cannot be empty');
    }
    return await callSupabaseFunction<CreateTeamResponse>('team-create', {
      name,
      join_code: joinCode,
      maxMembers,
      game_mode: gameMode,
    });
  };
  /**
   * Join an existing team
   * @param teamId The ID of the team to join
   * @param joinCode The team join/invite code
   */
  const joinTeam = async (teamId: string, joinCode: string): Promise<JoinTeamResponse> => {
    assertValidTeamId(teamId);
    return await callSupabaseFunction<JoinTeamResponse>('team-join', {
      teamId,
      join_code: joinCode,
    });
  };
  /**
   * Leave a team
   * @param teamId The ID of the team to leave
   */
  const leaveTeam = async (teamId: string): Promise<LeaveTeamResponse> => {
    assertValidTeamId(teamId);
    return await callSupabaseFunction<LeaveTeamResponse>('team-leave', { teamId });
  };
  /**
   * Kick a member from a team (owner only)
   * @param teamId The ID of the team
   * @param memberId The ID of the member to kick
   */
  const kickTeamMember = async (teamId: string, memberId: string): Promise<KickMemberResponse> => {
    assertValidTeamId(teamId);
    return await callSupabaseFunction<KickMemberResponse>('team-kick', { teamId, memberId });
  };
  const createToken = async (payload: {
    permissions: string[];
    gameMode: GameMode;
    note?: string | null;
    tokenValue?: string;
  }) => {
    return await callSupabaseFunction<{ success?: boolean; tokenId?: string; tokenValue?: string }>(
      'token-create',
      payload
    );
  };
  /**
   * Revoke an API token
   * @param tokenId The ID of the token to revoke
   */
  const revokeToken = async (tokenId: string) => {
    try {
      return await callSupabaseFunction<{ success?: boolean }>(
        'token-revoke',
        { tokenId },
        'DELETE'
      );
    } catch (error) {
      if (!shouldFallbackForUnavailableTokenFunction(error)) {
        throw error;
      }
      logger.warn(
        '[EdgeFunctions] token-revoke unavailable, falling back to direct delete:',
        error
      );
      try {
        const { error: deleteError } = await $supabase.client
          .from('api_tokens')
          .delete()
          .eq('token_id', tokenId);
        if (deleteError) throw deleteError;
        return { success: true } as const;
      } catch (innerError) {
        logger.error(
          '[EdgeFunctions] Token revocation failed after direct-delete fallback:',
          innerError
        );
        throw innerError;
      }
    }
  };
  /**
   * Purge Cloudflare cache (admin only)
   * @param purgeType Type of cache purge: 'all' for entire zone, 'tarkov-data' for game data only
   */
  const purgeCache = async (
    purgeType: 'all' | 'tarkov-data' = 'tarkov-data'
  ): Promise<PurgeCacheResponse> => {
    return await callSupabaseFunction<PurgeCacheResponse>('admin-cache-purge', {
      purgeType,
    });
  };
  return {
    // Team management
    createTeam,
    joinTeam,
    leaveTeam,
    kickTeamMember,
    getTeamMembers,
    // API token management
    createToken,
    revokeToken,
    // Admin functions
    purgeCache,
  };
};
