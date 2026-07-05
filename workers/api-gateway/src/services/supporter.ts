import { isKnownTier, type ApiTier } from '../limits';
import { getMemoryCache, setMemoryCache } from '../utils/memory-cache';
import type { Env } from '../types';

const TIER_CACHE_TTL_SECONDS = 60;

interface SupporterRow {
  tier?: string | null;
  status?: string | null;
  expires_at?: string | null;
}

/**
 * Resolve the API tier for a user from public.supporters.
 * Fails open to 'free' so a Supabase hiccup never blocks authenticated traffic.
 */
export async function resolveTier(env: Env, userId: string): Promise<ApiTier> {
  const cacheKey = `tier:${userId}`;
  const cached = getMemoryCache<ApiTier>(cacheKey);
  if (cached) return cached;
  let tier: ApiTier = 'free';
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/supporters?user_id=eq.${userId}&select=tier,status,expires_at&limit=1`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (response.ok) {
      const rows = (await response.json()) as SupporterRow[];
      const row = rows[0];
      if (row && row.status === 'active' && !isExpired(row.expires_at)) {
        const value = (row.tier || '').toLowerCase();
        if (isKnownTier(value)) tier = value;
      }
    } else {
      console.warn('resolveTier supabase error', { status: response.status });
    }
  } catch (error) {
    console.warn('resolveTier failed, defaulting to free', { error });
  }
  setMemoryCache(cacheKey, tier, TIER_CACHE_TTL_SECONDS);
  return tier;
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  return Number.isFinite(ts) && ts <= Date.now();
}
