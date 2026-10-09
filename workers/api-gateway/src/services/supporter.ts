import { isKnownTier, type ApiTier } from '../limits';
import { getMemoryCache, setMemoryCache } from '../utils/memory-cache';
import type { Env } from '../types';
const TIER_CACHE_TTL_SECONDS = 60;
const TIER_FETCH_TIMEOUT_MS = 3000;
interface SupporterRow {
  tier?: string | null;
  status?: string | null;
  expires_at?: string | null;
}
/**
 * Resolve the API tier for a user from public.supporter_entitlements.
 * Fails open to 'free' so a Supabase hiccup never blocks authenticated traffic.
 * Only the result of a successful lookup is cached, so a transient outage does
 * not pin a paid user to free limits for the cache TTL.
 */
export async function resolveTier(env: Env, userId: string): Promise<ApiTier> {
  const cacheKey = `tier:${userId}`;
  const cached = getMemoryCache<ApiTier>(cacheKey);
  if (cached) return cached;
  let tier: ApiTier = 'free';
  let cacheable = false;
  let cacheSeconds = TIER_CACHE_TTL_SECONDS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIER_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchSupporterEntitlement(env, userId, controller.signal);
    if (response.ok) {
      const rows = (await response.json()) as SupporterRow[];
      const row = rows[0];
      if (row && hasActiveEntitlement(row)) {
        const value = (row.tier || '').toLowerCase();
        if (isKnownTier(value)) tier = value;
      }
      cacheSeconds = tierCacheSeconds(row, tier);
      cacheable = true;
    } else {
      console.warn('resolveTier supabase error', { status: response.status });
    }
  } catch (error) {
    console.warn('resolveTier failed, defaulting to free', { error });
  } finally {
    clearTimeout(timeout);
  }
  if (cacheable && cacheSeconds > 0) {
    setMemoryCache(cacheKey, tier, cacheSeconds);
  }
  return tier;
}
function hasActiveEntitlement(row: SupporterRow): boolean {
  if (row.status === 'active') return !isExpired(row.expires_at);
  return row.status === 'past_due' && Boolean(row.expires_at) && !isExpired(row.expires_at);
}
function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  // Fail closed: an unparseable expiry is treated as expired so a malformed
  // supporter row cannot grant elevated limits indefinitely.
  return !Number.isFinite(ts) || ts <= Date.now();
}
const tierCacheSeconds = (row: SupporterRow | undefined, tier: ApiTier): number => {
  if (tier === 'free' || !row?.expires_at) return TIER_CACHE_TTL_SECONDS;
  return Math.min(
    TIER_CACHE_TTL_SECONDS,
    Math.max(0, (Date.parse(row.expires_at) - Date.now()) / 1000)
  );
};
const isMissingEntitlementView = async (response: Response): Promise<boolean> => {
  if (response.status !== 404) return false;
  try {
    return ((await response.clone().json()) as { code?: string }).code === 'PGRST205';
  } catch {
    return false;
  }
};
const fetchSupporterEntitlement = async (
  env: Env,
  userId: string,
  signal: AbortSignal
): Promise<Response> => {
  const options = {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
    signal,
  };
  const query = `?user_id=eq.${encodeURIComponent(userId)}&select=tier,status,expires_at&limit=1`;
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/supporter_entitlements${query}`,
    options
  );
  if (!(await isMissingEntitlementView(response))) return response;
  // Schema may deploy after the Worker; only a specifically missing view permits legacy reads.
  return await fetch(`${env.SUPABASE_URL}/rest/v1/supporters${query}`, options);
};
