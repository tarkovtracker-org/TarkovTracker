import { createError, defineEventHandler, getQuery, getRequestHeader, setResponseHeader } from 'h3';
import { createLogger } from '~/server/utils/logger';
const logger = createLogger('TeamMembers');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEAM_ID_REGEX = /^[a-zA-Z0-9-]{1,64}$/;
const isValidUuid = (value: string): boolean => UUID_REGEX.test(value);
const isValidTeamId = (value: string): boolean => TEAM_ID_REGEX.test(value);
const buildRestPath = (resource: string, params: Record<string, string | number>): string => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }
  return `${resource}?${searchParams.toString()}`;
};
type ProfileRow = {
  user_id: string;
  current_game_mode?: string | null;
  pvp_display_name?: string | null;
  pvp_level?: number | null;
  pvp_tasks_completed?: number | null;
  pve_display_name?: string | null;
  pve_level?: number | null;
  pve_tasks_completed?: number | null;
};
type MemberProfile = {
  displayName: string | null;
  level: number | null;
  tasksCompleted: number | null;
};
const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const sanitizeDisplayName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 64) : null;
};
function mapProfile(p: ProfileRow): MemberProfile {
  const isPve = ((p.current_game_mode as 'pvp' | 'pve' | null) || 'pvp') === 'pve';
  const level = toFiniteNumber(isPve ? p.pve_level : p.pvp_level);
  const tasksCompleted = toFiniteNumber(isPve ? p.pve_tasks_completed : p.pvp_tasks_completed);
  return {
    displayName: sanitizeDisplayName(isPve ? p.pve_display_name : p.pvp_display_name),
    level: level !== null ? Math.max(1, Math.trunc(level)) : null,
    tasksCompleted: tasksCompleted !== null ? Math.max(0, Math.trunc(tasksCompleted)) : null,
  };
}
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
      statusMessage:
        '[team/members] Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY must both be set',
    });
  }
  const teamId = (getQuery(event).teamId as string | undefined)?.trim();
  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'teamId is required' });
  }
  if (!isValidTeamId(teamId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid teamId' });
  }
  const authHeader = getRequestHeader(event, 'authorization');
  const authContextUser = (event.context as { auth?: { user?: { id?: string } } }).auth?.user;
  let userId = authContextUser?.id || null;
  if (!userId) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError({ statusCode: 401, statusMessage: 'Missing auth token' });
    }
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: supabaseAnonKey,
      },
    });
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
    return fetch(url, { ...init, headers });
  };
  const membershipResp = await restFetch(
    buildRestPath('team_memberships', {
      limit: 1,
      select: 'user_id',
      team_id: `eq.${teamId}`,
      user_id: `eq.${userId}`,
    })
  );
  if (!membershipResp.ok) {
    throw createError({ statusCode: 500, statusMessage: 'Failed membership check' });
  }
  const membershipJson = (await membershipResp.json()) as Array<{ user_id: string }>;
  if (!membershipJson?.length) {
    throw createError({ statusCode: 403, statusMessage: 'Not a team member' });
  }
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
      buildRestPath('team_member_summary', {
        select:
          'user_id,current_game_mode,pvp_display_name,pvp_level,pvp_tasks_completed,pve_display_name,pve_level,pve_tasks_completed',
        user_id: idsParam,
      })
    );
    if (profilesResp.ok) {
      const profiles = (await profilesResp.json()) as ProfileRow[];
      for (const p of profiles) {
        profileMap[p.user_id] = mapProfile(p);
      }
    } else {
      const errorText = await profilesResp.text();
      logger.error(`Profiles fetch error (${profilesResp.status}):`, errorText);
      for (const id of validMemberIds) {
        const resp = await restFetch(
          buildRestPath('team_member_summary', {
            select:
              'user_id,current_game_mode,pvp_display_name,pvp_level,pvp_tasks_completed,pve_display_name,pve_level,pve_tasks_completed',
            user_id: `eq.${id}`,
          })
        );
        if (!resp.ok) continue;
        const profiles = (await resp.json()) as ProfileRow[];
        for (const p of profiles) {
          profileMap[p.user_id] = mapProfile(p);
        }
      }
    }
  }
  return { members: validMemberIds, profiles: profileMap };
});
