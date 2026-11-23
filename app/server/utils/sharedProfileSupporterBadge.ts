import { isProfileSupporterBadge } from '@/utils/profileSupporterBadge';
import type { GameMode } from '@/utils/constants';
type RestFetch = (path: string, timeoutMs?: number) => Promise<Response>;
export const withSharedProfileSupporterBadge = async <T extends object>(
  payload: T,
  restFetch: RestFetch,
  userId: string,
  mode: GameMode,
  seasonNumber: number
) => {
  try {
    // Consent, Streamer Mode, and mode visibility are checked on every request, even on cache hits.
    const response = await restFetch(
      `shared_profile_supporter_badges?select=badge&user_id=eq.${userId}&game_mode=eq.${mode}&season_number=eq.${seasonNumber}&limit=1`,
      1000
    );
    if (!response.ok) return payload;
    const rows = (await response.json()) as { badge?: unknown }[];
    const badge = rows[0]?.badge;
    return isProfileSupporterBadge(badge) ? { ...payload, supporterBadge: badge } : payload;
  } catch {
    return payload;
  }
};
