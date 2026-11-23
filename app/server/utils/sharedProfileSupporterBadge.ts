import { createLogger } from '@/server/utils/logger';
import { normalizeProfileSupporterBadge } from '@/utils/profileSupporterBadge';
import type { GameMode } from '@/utils/constants';
import type { ProfileSupporterBadge } from '@/utils/profileSupporterBadge';
const logger = createLogger('SharedProfileSupporterBadge');
type RestFetch = (path: string, timeoutMs?: number) => Promise<Response>;
export const loadSharedProfileSupporterBadge = async (
  restFetch: RestFetch,
  userId: string,
  mode: GameMode,
  seasonNumber: number
): Promise<ProfileSupporterBadge | null> => {
  try {
    // Consent, Streamer Mode, and mode visibility are checked on every request, even on cache hits.
    const response = await restFetch(
      `shared_profile_supporter_badges?select=badge&user_id=eq.${userId}&game_mode=eq.${mode}&season_number=eq.${seasonNumber}&limit=1`,
      1000
    );
    if (!response.ok) {
      logger.warn('Supporter badge lookup returned an unsuccessful response', {
        status: response.status,
      });
      return null;
    }
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) throw new TypeError('Unexpected supporter badge response');
    return normalizeProfileSupporterBadge(rows[0]?.badge);
  } catch (error) {
    logger.warn('Supporter badge lookup failed', {
      error: error instanceof Error ? error.name : 'unknown',
      status: (error as { statusCode?: number } | null)?.statusCode,
    });
    return null;
  }
};
export const withSharedProfileSupporterBadge = <T extends object>(
  payload: T,
  badge: ProfileSupporterBadge | null
) => (badge ? { ...payload, supporterBadge: badge } : payload);
