import { describe, expect, it } from 'vitest';
import { collectProfileVisibility, loadCurrentProfileVisibility } from '@/utils/profileVisibility';
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
