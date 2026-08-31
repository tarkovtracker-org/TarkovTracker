import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGameModeSeasonNumber } from '../utils/gameMode';
import type { Env } from '../types';
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
  it('resolves the active season fresh on each seasonal call', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(2)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGameModeSeasonNumber(env, 'seasonal')).resolves.toBe(2);
    await expect(getGameModeSeasonNumber(env, 'seasonal')).resolves.toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('requests the active season with a redirect mode workerd accepts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(1)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGameModeSeasonNumber(env, 'seasonal')).resolves.toBe(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.redirect).toBe('manual');
    expect(init.redirect).not.toBe('error');
  });
  it('rejects a redirected active-season response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 301, headers: { location: '/elsewhere' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGameModeSeasonNumber(env, 'seasonal')).rejects.toThrow(
      'Failed to fetch active season'
    );
  });
  it('resolves non-seasonal modes to 0 without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGameModeSeasonNumber(env, 'pvp')).resolves.toBe(0);
    await expect(getGameModeSeasonNumber(env, 'pve')).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
