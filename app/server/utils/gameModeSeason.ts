import { createError } from 'h3';
import { fetchWithTimeout } from '@/server/utils/fetchWithTimeout';
import type { GameMode } from '@/utils/constants';
type SeasonConfig = { supabaseUrl: string; supabaseServiceKey?: string };
// Resolve each seasonal request independently, including requests with cached profile data.
// Never fall back to the compiled client season when the database cannot be consulted.
export const resolveGameModeSeason = async (
  mode: GameMode,
  config: SeasonConfig
): Promise<number> => {
  if (mode !== 'seasonal') return 0;
  if (!config.supabaseServiceKey) {
    throw createError({ statusCode: 503, statusMessage: 'Seasonal data unavailable' });
  }
  try {
    const url = new URL(config.supabaseUrl);
    if (url.protocol !== 'https:') throw new Error('Expected HTTPS');
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/rest/v1/rpc/get_active_season_number`;
    url.search = '';
    url.hash = '';
    const response = await fetchWithTimeout(
      url.toString(),
      {
        method: 'POST',
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${config.supabaseServiceKey}`,
          apikey: config.supabaseServiceKey,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      8000,
      'Timed out while resolving the active season'
    );
    if (!response.ok) throw new Error('Active season lookup failed');
    const value: unknown = await response.json();
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new Error('Invalid active season');
    }
    return value;
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Seasonal data unavailable' });
  }
};
