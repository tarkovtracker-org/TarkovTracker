import { getTasks, getHideoutStations } from '../services/tarkov';
import { getMemoryCache, setMemoryCache } from '../utils/memory-cache';
import { extractGameModeData, transformProgress } from '../utils/transform';
import type { Env, ApiToken, UserProgressRow, ProgressResponseData } from '../types';
// Team member from database
interface TeamMember {
  user_id: string;
}
// User system row with team info
interface UserSystemRow {
  user_id: string;
  pvp_team_id: string | null;
  pve_team_id: string | null;
}
// Team progress response format (matching RatScanner expectations)
export interface TeamProgressResponse {
  data: ProgressResponseData[];
  meta: {
    self: string;
    hiddenTeammates: string[];
  };
}
/**
 * Get display name for a user from Supabase auth
 */
async function getUserDisplayName(env: Env, userId: string): Promise<string | null> {
  const cacheKey = `user-display:${userId}`;
  const cached = getMemoryCache<string>(cacheKey);
  if (cached) return cached;
  try {
    const url = `${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      email?: string | null;
      user_metadata?: Record<string, unknown> | null;
      app_metadata?: Record<string, unknown> | null;
    };
    const userMetadata = data.user_metadata || {};
    const appMetadata = data.app_metadata || {};
    const provider = typeof appMetadata.provider === 'string' ? appMetadata.provider : null;
    const email = typeof data.email === 'string' ? data.email : null;
    // Extract display name based on provider
    let displayName: string | null = null;
    if (provider === 'discord') {
      displayName =
        (userMetadata.global_name as string) ||
        (userMetadata.username as string) ||
        (userMetadata.preferred_username as string) ||
        null;
    } else if (provider === 'twitch') {
      displayName =
        (userMetadata.preferred_username as string) || (userMetadata.name as string) || null;
    } else {
      displayName = (userMetadata.name as string) || null;
    }
    const resolved = displayName || (email ? email.split('@')[0] : null);
    if (resolved) {
      setMemoryCache(cacheKey, resolved, 86400);
    }
    return resolved;
  } catch {
    return null;
  }
}
/**
 * Handle GET /api/team/progress - Return team progress
 */
export async function handleGetTeamProgress(
  env: Env,
  token: ApiToken,
  gameMode: 'pvp' | 'pve'
): Promise<TeamProgressResponse> {
  const teamIdField = gameMode === 'pve' ? 'pve_team_id' : 'pvp_team_id';
  // Step 1: Get user's team_id from user_system
  const userSystemUrl = `${env.SUPABASE_URL}/rest/v1/user_system?user_id=eq.${token.user_id}&select=${teamIdField}`;
  const userSystemRes = await fetch(userSystemUrl, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!userSystemRes.ok) {
    throw new Error('Failed to fetch user system data');
  }
  const userSystemRows = (await userSystemRes.json()) as UserSystemRow[];
  const teamId = userSystemRows[0]?.[teamIdField as keyof UserSystemRow] as string | null;
  // If user is not in a team, return just their own progress
  if (!teamId) {
    return await getSoloProgress(env, token, gameMode);
  }
  // Step 2: Get all team members from team_memberships
  const membersUrl = `${env.SUPABASE_URL}/rest/v1/team_memberships?team_id=eq.${teamId}&game_mode=eq.${gameMode}&select=user_id`;
  const membersRes = await fetch(membersUrl, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!membersRes.ok) {
    throw new Error('Failed to fetch team members');
  }
  const members = (await membersRes.json()) as TeamMember[];
  const memberIds = members.map((m) => m.user_id);
  // If no members found, return solo progress
  if (memberIds.length === 0) {
    return await getSoloProgress(env, token, gameMode);
  }
  // Step 3: Fetch progress for all team members
  const progressUrl = `${env.SUPABASE_URL}/rest/v1/user_progress?user_id=in.(${memberIds.join(',')})&select=*`;
  const progressRes = await fetch(progressUrl, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!progressRes.ok) {
    throw new Error('Failed to fetch team progress');
  }
  const progressRows = (await progressRes.json()) as UserProgressRow[];
  // Step 4: Fetch task and hideout data (cached)
  const [tasks, hideoutStations] = await Promise.all([
    getTasks(gameMode),
    getHideoutStations(gameMode),
  ]);
  // Step 5: Transform progress for each team member
  const teamProgress: ProgressResponseData[] = await Promise.all(
    memberIds.map(async (memberId) => {
      const row = progressRows.find((r) => r.user_id === memberId) || null;
      const gameEdition = row?.game_edition ?? 1;
      const progressData = extractGameModeData(row, gameMode);
      const fallbackDisplayName =
        progressData?.displayName?.trim() || (await getUserDisplayName(env, memberId));
      return transformProgress(
        progressData,
        memberId,
        gameEdition,
        tasks,
        hideoutStations,
        fallbackDisplayName
      );
    })
  );
  return {
    data: teamProgress,
    meta: {
      self: token.user_id,
      hiddenTeammates: [], // No hidden teammates in current implementation
    },
  };
}
/**
 * Get solo progress when user is not in a team
 */
async function getSoloProgress(
  env: Env,
  token: ApiToken,
  gameMode: 'pvp' | 'pve'
): Promise<TeamProgressResponse> {
  // Fetch user progress
  const url = `${env.SUPABASE_URL}/rest/v1/user_progress?user_id=eq.${token.user_id}&select=*&limit=1`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch user progress');
  }
  const rows = (await response.json()) as UserProgressRow[];
  const row = rows[0] || null;
  const gameEdition = row?.game_edition ?? 1;
  const progressData = extractGameModeData(row, gameMode);
  const fallbackDisplayName =
    progressData?.displayName?.trim() || (await getUserDisplayName(env, token.user_id));
  const [tasks, hideoutStations] = await Promise.all([
    getTasks(gameMode),
    getHideoutStations(gameMode),
  ]);
  const data = transformProgress(
    progressData,
    token.user_id,
    gameEdition,
    tasks,
    hideoutStations,
    fallbackDisplayName
  );
  return {
    data: [data],
    meta: {
      self: token.user_id,
      hiddenTeammates: [],
    },
  };
}
