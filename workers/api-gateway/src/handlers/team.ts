import {
  getLegacyModeProgressField,
  resolveModeProgressData,
} from '../../../../app/utils/modeProgressFallback';
import { getTasks, getHideoutStations } from '../services/tarkov';
import { getGameModeSeasonNumber } from '../utils/gameMode';
import { getMemoryCache, setMemoryCache } from '../utils/memory-cache';
import { extractGameModeData, transformProgress } from '../utils/transform';
import type { Env, ApiToken, GameMode, UserProgressModeRow, ProgressResponseData } from '../types';
// Team member from database
interface TeamMember {
  user_id: string;
}
// User system row with team info
interface TeamMembershipRow {
  team_id: string;
}
type ProgressRow = {
  progress_data: UserProgressModeRow['progress_data'];
  user_id: string;
};
type EditionRow = {
  game_edition: number | null;
  pve_data: UserProgressModeRow['progress_data'];
  pvp_data: UserProgressModeRow['progress_data'];
  user_id: string;
};
// Team progress response format (matching RatScanner expectations)
export interface TeamProgressResponse {
  data: ProgressResponseData[];
  meta: {
    self: string;
    hiddenTeammates: string[];
  };
}
const getServiceHeaders = (env: Env) => ({
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
});
const buildProgressResponse = (
  self: string,
  data: ProgressResponseData[]
): TeamProgressResponse => ({
  data,
  meta: { hiddenTeammates: [], self },
});
const fetchUserModeRow = async (
  env: Env,
  userId: string,
  gameMode: GameMode
): Promise<UserProgressModeRow> => {
  const seasonNumber = await getGameModeSeasonNumber(env, gameMode);
  const legacyProgressField = getLegacyModeProgressField(gameMode);
  const editionSelect = ['user_id', 'game_edition', legacyProgressField]
    .filter(Boolean)
    .join(',');
  const progressUrl = `${env.SUPABASE_URL}/rest/v1/user_game_mode_progress?user_id=eq.${userId}&game_mode=eq.${gameMode}&season_number=eq.${seasonNumber}&select=user_id,progress_data&limit=1`;
  const editionUrl = `${env.SUPABASE_URL}/rest/v1/user_progress?user_id=eq.${userId}&select=${editionSelect}&limit=1`;
  const [progressResponse, editionResponse] = await Promise.all([
    fetch(progressUrl, { headers: getServiceHeaders(env) }),
    fetch(editionUrl, { headers: getServiceHeaders(env) }),
  ]);
  if (!progressResponse.ok || !editionResponse.ok) throw new Error('Failed to fetch user progress');
  const progressRows = (await progressResponse.json()) as ProgressRow[];
  const editionRows = (await editionResponse.json()) as EditionRow[];
  const editionRow = editionRows[0];
  return {
    user_id: progressRows[0]?.user_id ?? userId,
    game_edition: editionRow?.game_edition ?? 1,
    progress_data: resolveModeProgressData(
      gameMode,
      progressRows[0]?.progress_data,
      editionRow
    ),
  };
};
const transformUserModeRow = async (
  env: Env,
  row: UserProgressModeRow,
  userId: string,
  gameMode: GameMode
): Promise<ProgressResponseData> => {
  const [tasks, hideoutStations] = await Promise.all([
    getTasks(gameMode),
    getHideoutStations(gameMode),
  ]);
  return buildProgressData(env, row, userId, tasks, hideoutStations);
};
const buildProgressData = async (
  env: Env,
  row: UserProgressModeRow,
  userId: string,
  tasks: Awaited<ReturnType<typeof getTasks>>,
  hideoutStations: Awaited<ReturnType<typeof getHideoutStations>>
): Promise<ProgressResponseData> => {
  const progressData = extractGameModeData(row);
  const fallbackDisplayName =
    progressData?.displayName?.trim() || (await getUserDisplayName(env, userId));
  return transformProgress(
    progressData,
    userId,
    row.game_edition ?? 1,
    tasks,
    hideoutStations,
    fallbackDisplayName
  );
};
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
  gameMode: GameMode
): Promise<TeamProgressResponse> {
  const membershipUrl = `${env.SUPABASE_URL}/rest/v1/team_memberships?user_id=eq.${token.user_id}&game_mode=eq.${gameMode}&select=team_id&limit=1`;
  const membershipRes = await fetch(membershipUrl, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!membershipRes.ok) {
    throw new Error('Failed to fetch team membership');
  }
  const membershipRows = (await membershipRes.json()) as TeamMembershipRow[];
  const teamId = membershipRows[0]?.team_id ?? null;
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
  const seasonNumber = await getGameModeSeasonNumber(env, gameMode);
  const ids = memberIds.join(',');
  const legacyProgressField = getLegacyModeProgressField(gameMode);
  const editionSelect = ['user_id', 'game_edition', legacyProgressField]
    .filter(Boolean)
    .join(',');
  const progressUrl = `${env.SUPABASE_URL}/rest/v1/user_game_mode_progress?user_id=in.(${ids})&game_mode=eq.${gameMode}&season_number=eq.${seasonNumber}&select=user_id,progress_data`;
  const editionsUrl = `${env.SUPABASE_URL}/rest/v1/user_progress?user_id=in.(${ids})&select=${editionSelect}`;
  const [progressRes, editionsRes] = await Promise.all([
    fetch(progressUrl, {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    }),
    fetch(editionsUrl, {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    }),
  ]);
  if (!progressRes.ok || !editionsRes.ok) {
    throw new Error('Failed to fetch team progress');
  }
  const progressRows = (await progressRes.json()) as ProgressRow[];
  const editionRows = (await editionsRes.json()) as EditionRow[];
  // Step 4: Fetch task and hideout data (cached)
  const [tasks, hideoutStations] = await Promise.all([
    getTasks(gameMode),
    getHideoutStations(gameMode),
  ]);
  // Step 5: Transform progress for each team member
  const teamProgress: ProgressResponseData[] = await Promise.all(
    memberIds.map(async (memberId) => {
      const progressRow = progressRows.find((row) => row.user_id === memberId);
      const editionRow = editionRows.find((row) => row.user_id === memberId);
      const row: UserProgressModeRow = {
        user_id: memberId,
        game_edition: editionRow?.game_edition ?? 1,
        progress_data: resolveModeProgressData(
          gameMode,
          progressRow?.progress_data,
          editionRow
        ),
      };
      return buildProgressData(env, row, memberId, tasks, hideoutStations);
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
  gameMode: GameMode
): Promise<TeamProgressResponse> {
  const row = await fetchUserModeRow(env, token.user_id, gameMode);
  const data = await transformUserModeRow(env, row, token.user_id, gameMode);
  return buildProgressResponse(token.user_id, [data]);
}
