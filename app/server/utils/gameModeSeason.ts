import { createError } from 'h3';
import { normalizeSupabaseUrl } from '@/server/utils/adminSupabase';
import { fetchWithTimeout } from '@/server/utils/fetchWithTimeout';
import type { GameMode } from '@/utils/constants';
type SeasonConfig = { supabaseUrl: string; supabaseServiceKey?: string };
const isSeasonNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;
const fetchActiveSeason = async (baseUrl: string, serviceKey: string): Promise<number> => {
  const url = normalizeSupabaseUrl(baseUrl);
  if (!url) throw new Error('Invalid Supabase URL');
  const response = await fetchWithTimeout(
    `${url}/rest/v1/rpc/get_active_season_number`,
    {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
    8000,
    'Timed out while resolving the active season'
  );
  if (!response.ok) throw new Error('Active season lookup failed');
  const value: unknown = await response.json();
  if (!isSeasonNumber(value)) throw new Error('Invalid active season');
  return value;
};
// Resolve each seasonal request independently, including requests with cached profile data.
// Never fall back to the compiled client season when the database cannot be consulted.
export const resolveGameModeSeason = async (
  mode: GameMode,
  config: SeasonConfig
): Promise<number> => {
  if (mode !== 'seasonal') return 0;
  try {
    if (!config.supabaseServiceKey) throw new Error('Missing service credential');
    return await fetchActiveSeason(config.supabaseUrl, config.supabaseServiceKey);
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Seasonal data unavailable' });
  }
};
