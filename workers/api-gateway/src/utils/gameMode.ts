import type { Env, GameMode } from '../types';
const getServiceHeaders = (env: Env) => ({
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
});
const getActiveSeasonNumber = async (env: Env): Promise<number> => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_active_season_number`, {
    method: 'POST',
    headers: { ...getServiceHeaders(env), 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw new Error('Failed to fetch active season');
  const value = Number(await response.json());
  if (!Number.isInteger(value) || value <= 0) throw new Error('Invalid active season');
  return value;
};
export const getGameModeSeasonNumber = async (env: Env, gameMode: GameMode): Promise<number> =>
  gameMode === 'seasonal' ? getActiveSeasonNumber(env) : 0;
