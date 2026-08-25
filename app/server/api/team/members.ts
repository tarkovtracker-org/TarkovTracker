import { createError, defineEventHandler, getQuery, getRequestHeader, setResponseHeader } from 'h3';
import { fetchWithTimeout } from '@/server/utils/fetchWithTimeout';
import { createLogger } from '@/server/utils/logger';
import { getProxyAwareClientIdentifier } from '@/server/utils/requestIdentity';
import {
  consumeSharedRateLimit,
  createSharedCacheHandle,
  getRateLimiterBinding,
  readSharedCache,
  writeSharedCache,
  type SharedCacheHandle,
} from '@/server/utils/sharedEdgeStore';
import { getGameModeSeasonNumber, isGameMode, type GameMode } from '@/utils/constants';
import {
  getLegacyModeProgressField,
  hasMaterializedProgress,
  resolveModeProgressData,
  summarizeModeProgressData,
  type LegacyModeProgressRow,
} from '@/utils/modeProgressFallback';
import type { ApiProtectionConfig } from '@/server/middleware/api-protection';
const logger = createLogger('TeamMembers');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REST_FETCH_TIMEOUT_MS = 8000;
const RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_TEAM_MEMBERS_CACHE_TTL_MS = 5000;
const TEAM_MEMBERS_CACHE_PREFIX = 'team-members';
const TEAM_MEMBERS_RATE_LIMIT_PREFIX = 'team-members-rate';
const isTestEnvironment = process.env.NODE_ENV === 'test';
const isValidUuid = (value: string): boolean => UUID_REGEX.test(value);
const buildRestPath = (resource: string, params: Record<string, string | number>): string => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }
  return `${resource}?${searchParams.toString()}`;
};
type ProfileRow = {
  user_id: string;
  display_name?: unknown;
  level?: unknown;
  tasks_completed?: unknown;
};
type EditionRow = {
  game_edition?: unknown;
  user_id: string;
};
type LegacyProgressRow = LegacyModeProgressRow & {
  user_id: string;
};
type MemberProfile = {
  displayName: string | null;
  gameEdition: number;
  gameMode: GameMode;
  level: number | null;
  tasksCompleted: number | null;
};
type TeamMembersPayload = {
  members: string[];
  profiles: Record<string, MemberProfile>;
};
const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const toFiniteProfileNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const sanitizeProfileDisplayName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 64) : null;
};
function mapProfile(p: ProfileRow, gameMode: GameMode, gameEdition: unknown): MemberProfile {
  const level = toFiniteProfileNumber(p.level);
  const tasksCompleted = toFiniteProfileNumber(p.tasks_completed);
  return {
    displayName: sanitizeProfileDisplayName(p.display_name),
    gameEdition:
      typeof gameEdition === 'number' && Number.isFinite(gameEdition)
        ? Math.max(1, Math.trunc(gameEdition))
        : 1,
    gameMode,
    level: level !== null ? Math.max(1, Math.trunc(level)) : null,
    tasksCompleted: tasksCompleted !== null ? Math.max(0, Math.trunc(tasksCompleted)) : null,
  };
}
const toPositiveInteger = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const integer = Math.trunc(numeric);
  return integer > 0 ? integer : fallback;
};
const isTeamMembersPayload = (value: unknown): value is TeamMembersPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as TeamMembersPayload;
  return (
    Array.isArray(candidate.members) &&
    candidate.profiles !== null &&
    typeof candidate.profiles === 'object'
  );
};
const consumeRateLimit = async (
  handle: SharedCacheHandle,
  key: string,
  limit: number
): Promise<boolean> => {
  return consumeSharedRateLimit(
    handle,
    TEAM_MEMBERS_RATE_LIMIT_PREFIX,
    key,
    limit,
    RATE_LIMIT_WINDOW_MS,
    ({ action, error, key: failedKey }) => {
      logger.warn('Team members rate-limit cache operation failed', {
        action,
        error: error instanceof Error ? error.message : String(error),
        key: failedKey,
      });
    }
  );
};
const getCachedTeamMembers = async (
  handle: SharedCacheHandle,
  key: string
): Promise<TeamMembersPayload | null> => {
  const payload = await readSharedCache<unknown>(
    handle,
    TEAM_MEMBERS_CACHE_PREFIX,
    key,
    ({ action, error, key: failedKey }) => {
      logger.warn('Team members cache operation failed', {
        action,
        error: error instanceof Error ? error.message : String(error),
        key: failedKey,
      });
    }
  );
  return isTeamMembersPayload(payload) ? payload : null;
};
const setCachedTeamMembers = async (
  handle: SharedCacheHandle,
  key: string,
  payload: TeamMembersPayload,
  ttlMs: number
): Promise<void> => {
  await writeSharedCache(
    handle,
    TEAM_MEMBERS_CACHE_PREFIX,
    key,
    payload,
    ttlMs,
    ({ action, error, key: failedKey }) => {
      logger.warn('Team members cache operation failed', {
        action,
        error: error instanceof Error ? error.message : String(error),
        key: failedKey,
      });
    }
  );
};
type LegacyTeamFetchers = {
  restFetch: (path: string) => Promise<Response>;
  serviceFetch: (path: string) => Promise<Response | null>;
};
const legacyTeamProgressPath = (gameMode: GameMode, memberIds: string[]): string | null => {
  const legacyProgressField = getLegacyModeProgressField(gameMode);
  if (!legacyProgressField || memberIds.length === 0) return null;
  return buildRestPath('user_progress', {
    select: `user_id,${legacyProgressField}`,
    user_id: `in.(${memberIds.map((id) => `"${id}"`).join(',')})`,
  });
};
const fetchLegacyTeamProgressRows = async (
  fetchers: LegacyTeamFetchers,
  legacyPath: string,
  teamId: string
): Promise<LegacyProgressRow[]> => {
  try {
    const response =
      (await fetchers.serviceFetch(legacyPath)) ?? (await fetchers.restFetch(legacyPath));
    if (response.ok) return (await response.json()) as LegacyProgressRow[];
    logger.warn('Team legacy progress fallback fetch failed', { status: response.status, teamId });
  } catch (error) {
    logger.warn('Team legacy progress fallback fetch failed', {
      error: toErrorMessage(error),
      teamId,
    });
  }
  return [];
};
const applyLegacyTeamProfile = (
  row: LegacyProgressRow,
  gameMode: GameMode,
  profileMap: Record<string, MemberProfile>,
  gameEdition: unknown
): void => {
  const progress = resolveModeProgressData(gameMode, null, row);
  if (profileMap[row.user_id] && !hasMaterializedProgress(progress)) return;
  profileMap[row.user_id] = mapProfile(
    { user_id: row.user_id, ...summarizeModeProgressData(progress) },
    gameMode,
    gameEdition
  );
};
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
  setResponseHeader(event, 'Vary', 'Authorization');
  const config = useRuntimeConfig(event);
  const supabaseUrl = config.supabaseUrl;
  const supabaseServiceKey = config.supabaseServiceKey;
  const supabaseAnonKey = config.supabaseAnonKey;
  if (
    typeof supabaseUrl !== 'string' ||
    !supabaseUrl ||
    typeof supabaseAnonKey !== 'string' ||
    !supabaseAnonKey
  ) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Service configuration error',
    });
  }
  const teamId = (getQuery(event).teamId as string | undefined)?.trim();
  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'teamId is required' });
  }
  if (!isValidUuid(teamId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid teamId' });
  }
  const teamMembersRateLimitPerMinute = toPositiveInteger(
    config.teamMembersRateLimitPerMinute,
    DEFAULT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE
  );
  const teamMembersCacheTtlMs = toPositiveInteger(
    config.teamMembersCacheTtlMs,
    DEFAULT_TEAM_MEMBERS_CACHE_TTL_MS
  );
  const forceRefresh = getQuery(event).refresh === '1';
  const typedConfig = config as ApiProtectionConfig;
  const trustProxy = Boolean(typedConfig.apiProtection?.trustProxy);
  const sharedCacheHandle = createSharedCacheHandle(
    typedConfig.public?.appUrl,
    getRateLimiterBinding(event)
  );
  if (!isTestEnvironment) {
    const preAuthRateLimitKey = `team-members:ip:${getProxyAwareClientIdentifier(
      event,
      trustProxy
    )}`;
    if (
      !(await consumeRateLimit(
        sharedCacheHandle,
        preAuthRateLimitKey,
        teamMembersRateLimitPerMinute
      ))
    ) {
      throw createError({ statusCode: 429, statusMessage: 'Too many requests' });
    }
  }
  const authHeader = getRequestHeader(event, 'authorization');
  const authContextUser = (event.context as { auth?: { user?: { id?: string } } }).auth?.user;
  let userId = authContextUser?.id || null;
  if (!userId) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError({ statusCode: 401, statusMessage: 'Missing auth token' });
    }
    const authResp = await fetchWithTimeout(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          Authorization: authHeader,
          apikey: supabaseAnonKey,
        },
      },
      REST_FETCH_TIMEOUT_MS,
      'Timed out while validating auth token'
    );
    if (!authResp.ok) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid token' });
    }
    const user = (await authResp.json()) as { id: string };
    userId = user.id;
  }
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid token' });
  }
  if (!isValidUuid(userId)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid token' });
  }
  if (!isTestEnvironment) {
    const userRateLimitKey = `team-members:user:${teamId}:${userId}`;
    if (
      !(await consumeRateLimit(sharedCacheHandle, userRateLimitKey, teamMembersRateLimitPerMinute))
    ) {
      throw createError({ statusCode: 429, statusMessage: 'Too many requests' });
    }
  }
  const teamMembersCacheKey = `${teamId}:${userId}`;
  if (!isTestEnvironment && !forceRefresh) {
    const cached = await getCachedTeamMembers(sharedCacheHandle, teamMembersCacheKey);
    if (cached) {
      return cached;
    }
  }
  const restApiKey = supabaseServiceKey || supabaseAnonKey;
  const restAuthorization =
    authHeader || (supabaseServiceKey ? `Bearer ${supabaseServiceKey}` : '');
  if (!restAuthorization) {
    throw createError({ statusCode: 401, statusMessage: 'Missing auth token' });
  }
  const restFetch = async (path: string, init?: RequestInit) => {
    const url = `${supabaseUrl}/rest/v1/${path}`;
    const headers = {
      apikey: restApiKey,
      Authorization: restAuthorization,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };
    return fetchWithTimeout(
      url,
      { ...init, headers },
      REST_FETCH_TIMEOUT_MS,
      `Timed out while loading team members data (${path.split('?')[0] || 'unknown'})`
    );
  };
  const serviceFetch = async (path: string): Promise<Response | null> => {
    if (!supabaseServiceKey) return null;
    return fetchWithTimeout(
      `${supabaseUrl}/rest/v1/${path}`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          Accept: 'application/json',
        },
      },
      REST_FETCH_TIMEOUT_MS,
      `Timed out while loading team metadata (${path.split('?')[0] || 'unknown'})`
    );
  };
  const membershipResp = await restFetch(
    buildRestPath('team_memberships', {
      limit: 1,
      select: 'user_id,game_mode',
      team_id: `eq.${teamId}`,
      user_id: `eq.${userId}`,
    })
  );
  if (!membershipResp.ok) {
    throw createError({ statusCode: 500, statusMessage: 'Failed membership check' });
  }
  const membershipJson = (await membershipResp.json()) as Array<{
    game_mode: string;
    user_id: string;
  }>;
  if (!membershipJson?.length) {
    throw createError({ statusCode: 403, statusMessage: 'Not a team member' });
  }
  const gameModeValue = membershipJson[0]?.game_mode;
  if (!isGameMode(gameModeValue)) {
    throw createError({ statusCode: 500, statusMessage: 'Team has an invalid game mode' });
  }
  const gameMode: GameMode = gameModeValue;
  const membersResp = await restFetch(
    buildRestPath('team_memberships', {
      select: 'user_id',
      team_id: `eq.${teamId}`,
    })
  );
  if (!membersResp.ok) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to load members' });
  }
  const membersJson = (await membersResp.json()) as Array<{ user_id: string }>;
  const validMemberIds = Array.from(new Set(membersJson.map((m) => m.user_id).filter(isValidUuid)));
  const profileMap: Record<string, MemberProfile> = {};
  if (validMemberIds.length > 0) {
    const idsParam = `in.(${validMemberIds.map((id) => `"${id}"`).join(',')})`;
    const profilesResp = await restFetch(
      buildRestPath('team_member_mode_summary', {
        game_mode: `eq.${gameMode}`,
        season_number: `eq.${getGameModeSeasonNumber(gameMode)}`,
        select: 'user_id,display_name,level,tasks_completed',
        user_id: idsParam,
      })
    );
    let editions: EditionRow[] = [];
    try {
      const editionsResp = await serviceFetch(
        buildRestPath('user_progress', {
          select: 'user_id,game_edition',
          user_id: idsParam,
        })
      );
      if (editionsResp?.ok) {
        editions = (await editionsResp.json()) as EditionRow[];
      } else {
        logger.warn('Team edition metadata fetch failed', {
          status: editionsResp?.status,
          teamId,
        });
      }
    } catch (error) {
      logger.warn('Team edition metadata fetch failed', {
        error: toErrorMessage(error),
        teamId,
      });
    }
    const editionsByUserId = new Map(editions.map((row) => [row.user_id, row.game_edition]));
    if (profilesResp.ok) {
      const profiles = (await profilesResp.json()) as ProfileRow[];
      for (const p of profiles) {
        profileMap[p.user_id] = mapProfile(p, gameMode, editionsByUserId.get(p.user_id));
      }
    } else {
      const errorText = await profilesResp.text();
      logger.error(`Profiles fetch error (${profilesResp.status}):`, errorText);
      for (const id of validMemberIds) {
        const resp = await restFetch(
          buildRestPath('team_member_mode_summary', {
            game_mode: `eq.${gameMode}`,
            season_number: `eq.${getGameModeSeasonNumber(gameMode)}`,
            select: 'user_id,display_name,level,tasks_completed',
            user_id: `eq.${id}`,
          })
        );
        if (!resp.ok) continue;
        const profiles = (await resp.json()) as ProfileRow[];
        for (const p of profiles) {
          profileMap[p.user_id] = mapProfile(p, gameMode, editionsByUserId.get(p.user_id));
        }
      }
    }
    const legacyPath = legacyTeamProgressPath(
      gameMode,
      validMemberIds.filter((id) => profileMap[id]?.level == null)
    );
    const legacyRows = legacyPath
      ? await fetchLegacyTeamProgressRows({ restFetch, serviceFetch }, legacyPath, teamId)
      : [];
    for (const row of legacyRows) {
      applyLegacyTeamProfile(row, gameMode, profileMap, editionsByUserId.get(row.user_id));
    }
  }
  const payload: TeamMembersPayload = { members: validMemberIds, profiles: profileMap };
  if (!isTestEnvironment) {
    await setCachedTeamMembers(
      sharedCacheHandle,
      teamMembersCacheKey,
      payload,
      teamMembersCacheTtlMs
    );
  }
  return payload;
});
