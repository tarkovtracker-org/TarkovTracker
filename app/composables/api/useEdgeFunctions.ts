/**
 * Composable for calling Supabase Edge Functions
 * Provides typed methods for common edge function operations
 */
import { getErrorStatus } from '@/utils/errors';
import { logger } from '@/utils/logger';
import type { PurgeCacheResponse } from '@/types/edge';
import type {
  CreateTeamResponse,
  JoinTeamResponse,
  KickMemberResponse,
  LeaveTeamResponse,
} from '@/types/team';
type GameMode = 'pvp' | 'pve';
const TEAM_ID_REGEX = /^[a-zA-Z0-9-]{1,64}$/;
const GATEWAY_OUTAGE_COOLDOWN_MS = 60_000;
let teamGatewayOutageUntil = 0;
const getGatewayErrorData = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('data' in error)) {
    return undefined;
  }
  const data = (error as { data?: unknown }).data;
  if (typeof data === 'string') {
    return data;
  }
  if (
    data &&
    typeof data === 'object' &&
    'message' in data &&
    typeof (data as { message?: unknown }).message === 'string'
  ) {
    return (data as { message: string }).message;
  }
  return undefined;
};
const isAuthOrMembershipStatus = (status: number | null): boolean =>
  status === 401 || status === 403;
const assertValidTeamId = (teamId: string) => {
  if (!TEAM_ID_REGEX.test(teamId)) {
    throw new Error('Invalid team id');
  }
};
const shouldCooldownGateway = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status !== null && status >= 500) {
    return true;
  }
  const dataMessage = getGatewayErrorData(error);
  return (
    typeof dataMessage === 'string' &&
    dataMessage.toLowerCase().includes('rate limiter unavailable')
  );
};
export const useEdgeFunctions = () => {
  const { $supabase } = useNuxtApp();
  const runtimeConfig = useRuntimeConfig();
  const rawTeamGatewayUrl = String(
    runtimeConfig?.public?.teamGatewayUrl ||
      runtimeConfig?.public?.team_gateway_url || // safety for snake_case envs
      ''
  );
  const rawTokenGatewayUrl = String(runtimeConfig?.public?.tokenGatewayUrl || rawTeamGatewayUrl);
  const gatewayUrl = rawTeamGatewayUrl.replace(/\/+$/, ''); // team routes
  const tokenGatewayUrl = rawTokenGatewayUrl.replace(/\/+$/, ''); // token routes
  const getAuthToken = async () => {
    const { data, error } = await $supabase.client.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) {
      throw new Error('User not authenticated');
    }
    return token;
  };
  const callGateway = async <T>(action: string, body: Record<string, unknown>): Promise<T> => {
    if (!gatewayUrl) {
      throw new Error('Gateway URL not configured');
    }
    const token = await getAuthToken();
    const response = await $fetch<T>(`${gatewayUrl}/team/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    return response as T;
  };
  const callTokenGateway = async <T>(
    action: 'revoke' | 'create',
    body: Record<string, unknown>
  ): Promise<T> => {
    if (!tokenGatewayUrl) {
      throw new Error('Token gateway URL not configured');
    }
    const token = await getAuthToken();
    const response = await $fetch<T>(`${tokenGatewayUrl}/token/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    return response as T;
  };
  const callSupabaseFunction = async <T>(
    fnName: string,
    body: Record<string, unknown>,
    method: 'POST' | 'GET' | 'DELETE' | 'PUT' = 'POST'
  ) => {
    const { data, error } = await $supabase.client.functions.invoke<T>(fnName, {
      body,
      method,
    });
    if (error) {
      throw error;
    }
    return data as T;
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
  const preferGateway = async <T>(action: string, body: Record<string, unknown>): Promise<T> => {
    logger.debug(`[EdgeFunctions] preferGateway called with action: ${action}, body:`, body);
    if (gatewayUrl && Date.now() < teamGatewayOutageUntil) {
      logger.debug('[EdgeFunctions] Team gateway cooldown active, using Supabase fallback:', {
        action,
        retryInMs: teamGatewayOutageUntil - Date.now(),
      });
    } else if (gatewayUrl) {
      try {
        logger.debug(`[EdgeFunctions] Attempting gateway call to: ${gatewayUrl}/team/${action}`);
        const result = await callGateway<T>(action, body);
        logger.debug('[EdgeFunctions] Gateway call succeeded:', result);
        return result;
      } catch (error) {
        const status = getErrorStatus(error);
        const data = getGatewayErrorData(error);
        if (shouldCooldownGateway(error)) {
          teamGatewayOutageUntil = Date.now() + GATEWAY_OUTAGE_COOLDOWN_MS;
        }
        logger.warn('[EdgeFunctions] Gateway failed, falling back to Supabase:', error);
        logger.debug('[EdgeFunctions] Gateway fallback metadata:', {
          action,
          status,
          data,
          cooldownUntil: teamGatewayOutageUntil,
        });
      }
    }
    const fnName = `team-${action}`;
    logger.debug(`[EdgeFunctions] Calling Supabase function: ${fnName}`);
    const result = await callSupabaseFunction<T>(fnName, body);
    logger.debug('[EdgeFunctions] Supabase function result:', result);
    return result;
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
    return await preferGateway<CreateTeamResponse>('create', {
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
    return await preferGateway<JoinTeamResponse>('join', { teamId, join_code: joinCode });
  };
  /**
   * Leave a team
   * @param teamId The ID of the team to leave
   */
  const leaveTeam = async (teamId: string): Promise<LeaveTeamResponse> => {
    assertValidTeamId(teamId);
    return await preferGateway<LeaveTeamResponse>('leave', { teamId });
  };
  /**
   * Kick a member from a team (owner only)
   * @param teamId The ID of the team
   * @param memberId The ID of the member to kick
   */
  const kickTeamMember = async (teamId: string, memberId: string): Promise<KickMemberResponse> => {
    assertValidTeamId(teamId);
    return await preferGateway<KickMemberResponse>('kick', { teamId, memberId });
  };
  const preferTokenGateway = async <T>(
    action: 'revoke' | 'create',
    body: Record<string, unknown>
  ): Promise<T> => {
    if (tokenGatewayUrl) {
      try {
        return await callTokenGateway<T>(action, body);
      } catch (error) {
        logger.warn('[EdgeFunctions] Token gateway failed, falling back to Supabase:', error);
      }
    }
    const fnName = action === 'revoke' ? 'token-revoke' : 'token-create';
    const method = action === 'revoke' ? 'DELETE' : 'POST';
    return await callSupabaseFunction<T>(fnName, body, method);
  };
  const createToken = async (payload: {
    permissions: string[];
    gameMode: GameMode;
    note?: string | null;
    tokenValue?: string;
  }) => {
    return await preferTokenGateway<{ success?: boolean; tokenId?: string; tokenValue?: string }>(
      'create',
      payload
    );
  };
  /**
   * Revoke an API token
   * @param tokenId The ID of the token to revoke
   */
  const revokeToken = async (tokenId: string) => {
    try {
      return await preferTokenGateway<{ success?: boolean }>('revoke', { tokenId });
    } catch (error) {
      // Final safety net: direct delete via Supabase table with RLS
      try {
        const { error: deleteError } = await $supabase.client
          .from('api_tokens')
          .delete()
          .eq('token_id', tokenId);
        if (deleteError) throw deleteError;
        return { success: true } as const;
      } catch (innerError) {
        logger.error(
          '[EdgeFunctions] Token revocation failed after all fallbacks:',
          innerError || error
        );
        throw innerError || error;
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
