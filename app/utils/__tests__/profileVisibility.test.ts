import { describe, expect, it, vi } from 'vitest';
import {
  collectProfileVisibility,
  fetchProfileVisibilityRows,
  loadCurrentProfileVisibility,
} from '@/utils/profileVisibility';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
type VisibilityClient = Parameters<typeof fetchProfileVisibilityRows>[0];
const createVisibilityClient = (
  modeResult: { data: unknown; error: unknown },
  legacyResult: { data: unknown; error: unknown }
): VisibilityClient =>
  ({
    from: (table: string) => {
      if (table === 'user_game_mode_progress') {
        const query: Record<string, unknown> = {};
        query.select = () => query;
        query.eq = () => query;
        query.in = () => query;
        query.then = (resolve: (value: unknown) => unknown) => resolve(modeResult);
        return query;
      }
      const legacy: Record<string, unknown> = {};
      legacy.select = () => legacy;
      legacy.eq = () => legacy;
      legacy.maybeSingle = async () => legacyResult;
      return legacy;
    },
  }) as unknown as VisibilityClient;
describe('profile visibility loading', () => {
  it('keeps only active-season rows for supported modes', () => {
    expect(
      collectProfileVisibility([
        { game_mode: 'pvp', profile_public: true, season_number: 0 },
        { game_mode: 'pve', profile_public: true, season_number: 0 },
        { game_mode: 'seasonal', profile_public: true, season_number: 1 },
        { game_mode: 'seasonal', profile_public: false, season_number: 2 },
        { game_mode: 'arena', profile_public: true, season_number: 0 },
      ])
    ).toEqual({ pvp: true, pve: true, seasonal: true });
  });
  it('uses legacy persistent-mode visibility only when normalized rows are missing', () => {
    expect(
      collectProfileVisibility([{ game_mode: 'pvp', profile_public: false, season_number: 0 }], {
        profile_share_pve_public: true,
        profile_share_pvp_public: true,
      })
    ).toEqual({ pvp: false, pve: true, seasonal: false });
  });
  it('keeps normalized visibility when the legacy preferences query fails', async () => {
    const legacyError = new Error('preferences unavailable');
    const result = await fetchProfileVisibilityRows(
      createVisibilityClient(
        { data: [{ game_mode: 'pvp', profile_public: true, season_number: 0 }], error: null },
        { data: null, error: legacyError }
      ),
      'user-1'
    );
    expect(result.error).toBeNull();
    expect(result.legacy).toBeNull();
    expect(collectProfileVisibility(result.data, result.legacy)).toEqual({
      pvp: true,
      pve: false,
      seasonal: false,
    });
  });
  it('keeps the normalized query error fatal', async () => {
    const modeError = new Error('mode rows unavailable');
    const result = await fetchProfileVisibilityRows(
      createVisibilityClient({ data: null, error: modeError }, { data: null, error: null }),
      'user-1'
    );
    expect(result.error).toBe(modeError);
  });
  it('discards a completed request when the user context changed', async () => {
    const result = await loadCurrentProfileVisibility(
      async () => ({
        data: [{ game_mode: 'pvp', profile_public: true, season_number: 0 }],
        error: null,
      }),
      () => false
    );
    expect(result).toEqual({ current: false });
  });
  it('returns a current request failure without replacing visibility', async () => {
    const failure = new Error('network unavailable');
    const result = await loadCurrentProfileVisibility(
      async () => {
        throw failure;
      },
      () => true
    );
    expect(result).toEqual({ current: true, error: failure, visibility: null });
  });
});
