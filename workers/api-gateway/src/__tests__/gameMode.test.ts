import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types';
import { getGameModeSeasonNumber } from '../utils/gameMode';
const env = {
  SUPABASE_URL: 'https://supabase.example/project',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
} as Env;
describe('getGameModeSeasonNumber', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('preserves the Supabase URL path when fetching the active season', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(3)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGameModeSeasonNumber(env, 'seasonal')).resolves.toBe(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://supabase.example/project/rest/v1/rpc/get_active_season_number'
    );
  });
});
