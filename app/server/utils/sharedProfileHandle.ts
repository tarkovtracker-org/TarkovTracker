import { createError } from 'h3';
import { isGameMode, type GameMode } from '@/utils/constants';
type RestFetch = (path: string) => Promise<Response>;
export const resolveSharedProfileHandle = async (restFetch: RestFetch, handle: string) => {
  const response = await restFetch(`profile_handles?select=user_id&handle=eq.${handle}&limit=1`);
  if (!response.ok) {
    throw createError({ statusCode: 503, statusMessage: 'Shared profiles unavailable' });
  }
  const rows = (await response.json()) as { user_id: string | null }[];
  if (!rows[0]?.user_id) {
    throw createError({ statusCode: 404, statusMessage: 'Profile not found' });
  }
  return rows[0].user_id;
};
export const resolveDefaultSharedMode = async (
  restFetch: RestFetch,
  userId: string
): Promise<GameMode> => {
  const response = await restFetch(
    `user_game_mode_progress?select=game_mode&user_id=eq.${userId}&profile_public=is.true&game_mode=in.(pvp,pve)&season_number=eq.0`
  );
  if (!response.ok) {
    throw createError({ statusCode: 503, statusMessage: 'Shared profiles unavailable' });
  }
  const rows = (await response.json()) as { game_mode: string }[];
  const available = rows.map((row) => row.game_mode).filter(isGameMode);
  if (available.includes('pvp')) return 'pvp';
  if (available.includes('pve')) return 'pve';
  return 'seasonal'; // The main profile lookup checks the current season and visibility.
};
