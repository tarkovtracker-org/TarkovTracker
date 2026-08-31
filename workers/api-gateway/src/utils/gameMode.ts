import type { Env, GameMode } from '@/types';
// Resolved fresh from the database on every seasonal request. Caching the value risks returning a
// stale season during the rollover window while the write path (merge_progress_data) resolves the
// current season server-side, which would read and write progress under disagreeing seasons.
const getSupabaseUrl = (env: Env): URL => {
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:') throw new Error('Supabase URL must use HTTPS');
  return url;
};
const ACTIVE_SEASON_FETCH_TIMEOUT_MS = 10_000;
const getServiceHeaders = (env: Env) => ({
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
});
const getActiveSeasonNumber = async (env: Env): Promise<number> => {
  const supabaseUrl = getSupabaseUrl(env);
  const rpcUrl = new URL(supabaseUrl);
  rpcUrl.pathname = `${rpcUrl.pathname.replace(/\/+$/, '')}/rest/v1/rpc/get_active_season_number`;
  rpcUrl.search = '';
  rpcUrl.hash = '';
  const response = await fetch(rpcUrl, {
    method: 'POST',
    // workerd only accepts 'follow' or 'manual'; 'error' throws at the fetch call. 'manual'
    // surfaces a redirect as a non-ok status, which the check below rejects, so service
    // credentials are still never replayed to another host.
    redirect: 'manual',
    headers: { ...getServiceHeaders(env), 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(ACTIVE_SEASON_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('Failed to fetch active season');
  const value = Number(await response.json());
  if (!Number.isInteger(value) || value <= 0) throw new Error('Invalid active season');
  return value;
};
export const getGameModeSeasonNumber = async (env: Env, gameMode: GameMode): Promise<number> =>
  gameMode === 'seasonal' ? getActiveSeasonNumber(env) : 0;
