// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveGameModeSeason } from '@/server/utils/gameModeSeason';
const config = { supabaseUrl: 'https://example.supabase.co', supabaseServiceKey: 'test-key' };
afterEach(() => vi.unstubAllGlobals());
describe('database season resolution', () => {
  it('keeps persistent modes independent of the season service', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await resolveGameModeSeason('pvp', { supabaseUrl: '' })).toBe(0);
    expect(await resolveGameModeSeason('pve', { supabaseUrl: '' })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('observes rollover on the next request without reusing the compiled season', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(2))
      .mockResolvedValueOnce(Response.json(3));
    vi.stubGlobal('fetch', fetch);
    expect(await resolveGameModeSeason('seasonal', config)).toBe(2);
    expect(await resolveGameModeSeason('seasonal', config)).toBe(3);
    expect(fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/get_active_season_number',
      expect.objectContaining({ method: 'POST', redirect: 'manual', body: '{}' })
    );
  });
  it.each([null, false, '2', [], {}, 0, -1, 1.5])('rejects invalid season %j', async (value) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    await expect(resolveGameModeSeason('seasonal', config)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
  it.each([302, 403, 500])('fails closed on HTTP %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(resolveGameModeSeason('seasonal', config)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
  it('fails closed on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(resolveGameModeSeason('seasonal', config)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
  it('requires service credentials and HTTPS before sending a seasonal request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      resolveGameModeSeason('seasonal', { supabaseUrl: config.supabaseUrl })
    ).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      resolveGameModeSeason('seasonal', { ...config, supabaseUrl: 'http://example.com' })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
