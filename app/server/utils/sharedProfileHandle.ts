import { createError, getRouterParam, type H3Event } from 'h3';
import { isGameMode, type GameMode } from '@/utils/constants';
type RestFetch = (path: string) => Promise<Response>;
const readLookupRows = async <T>(restFetch: RestFetch, path: string): Promise<T[]> => {
  try {
    const response = await restFetch(path);
    if (!response.ok) throw new Error('Profile lookup failed');
    return (await response.json()) as T[];
  } catch (error) {
    if (Object(error).statusCode === 504) throw error;
    throw createError({ statusCode: 503, statusMessage: 'Shared profiles unavailable' });
  }
};
export const resolveSharedProfileHandle = async (restFetch: RestFetch, handle: string) => {
  const rows = await readLookupRows<{ user_id: string | null }>(
    restFetch,
    `profile_handles?select=user_id&handle=eq.${handle}&limit=1`
  );
  if (!rows[0]?.user_id) {
    throw createError({ statusCode: 404, statusMessage: 'Profile not found' });
  }
  return rows[0].user_id;
};
export const resolveDefaultSharedMode = async (
  restFetch: RestFetch,
  userId: string
): Promise<GameMode> => {
  const rows = await readLookupRows<{ game_mode: string }>(
    restFetch,
    `user_game_mode_progress?select=game_mode&user_id=eq.${userId}&profile_public=is.true&game_mode=in.(pvp,pve)&season_number=eq.0`
  );
  const available = rows.map((row) => row.game_mode).filter(isGameMode);
  if (available.includes('pvp')) return 'pvp';
  if (available.includes('pve')) return 'pve';
  return 'seasonal'; // The main profile lookup checks the current season and visibility.
};
const PROFILE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requireStreamerProfileParams(event: H3Event) {
  const userId = (getRouterParam(event, 'userId') || '').trim();
  const mode = getRouterParam(event, 'mode');
  if (!isGameMode(mode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile mode' });
  }
  if (!PROFILE_ID_PATTERN.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile id' });
  }
  return { userId, mode };
}
