import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_SEASON_CACHE_KEY, getGameModeSeasonNumber } from '../utils/gameMode';
import { deleteMemoryCache } from '../utils/memory-cache';
import type { Env } from '../types';
const env = {
  SUPABASE_URL: 'https://supabase.example/project',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
} as Env;
describe('getGameModeSeasonNumber', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    deleteMemoryCache(ACTIVE_SEASON_CACHE_KEY);
  });
  it('preserves the Supabase URL path when fetching the active season', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(3)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGameModeSeasonNumber(env, 'seasonal')).resolves.toBe(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://supabase.example/project/rest/v1/rpc/get_active_season_number'
    );
  });
  it('caches the active season across seasonal calls within the TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(2)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGameModeSeasonNumber(env, 'seasonal')).resolves.toBe(2);
    await expect(getGameModeSeasonNumber(env, 'seasonal')).resolves.toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('resolves non-seasonal modes to 0 without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGameModeSeasonNumber(env, 'pvp')).resolves.toBe(0);
    await expect(getGameModeSeasonNumber(env, 'pve')).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
