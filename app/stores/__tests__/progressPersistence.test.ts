import { describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import {
  loadModeProgress,
  syncProgressState,
  type ModeProgressClient,
  type ProgressRpcClient,
} from '@/stores/tarkov/progressPersistence';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
describe('progress persistence error handling', () => {
  it('sends the client active season so the server can reject stale seasonal writes', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await syncProgressState({ rpc } as ProgressRpcClient, 'user-1', defaultState);
    expect(rpc).toHaveBeenCalledWith(
      'sync_user_game_mode_progress',
      expect.objectContaining({ p_seasonal_season_number: ACTIVE_SEASON_NUMBER })
    );
  });
  it('uses only active mode timestamps when establishing startup freshness', async () => {
    const query = Promise.resolve({
      error: null,
      data: [
        {
          game_mode: 'seasonal',
          season_number: ACTIVE_SEASON_NUMBER,
          progress_data: { level: 5 },
          progress_updated_at: '2026-09-06T12:00:00Z',
          updated_at: '2026-09-09T12:00:00Z',
        },
        {
          game_mode: 'seasonal',
          season_number: ACTIVE_SEASON_NUMBER + 1,
          progress_data: { level: 1 },
          progress_updated_at: '2026-09-07T12:00:00Z',
        },
        {
          game_mode: 'pvp',
          season_number: 0,
          progress_data: { level: 8 },
          progress_updated_at: 'invalid',
        },
        {
          game_mode: 'pve',
          season_number: 0,
          progress_data: {},
          progress_updated_at: '2026-09-08T12:00:00Z',
        },
      ],
    });
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ in: () => ({ in: () => query }) }) }) }),
    } as unknown as ModeProgressClient;
    const result = await loadModeProgress(client, 'user-1');
    expect(result.updatedAt).toBe(Date.parse('2026-09-06T12:00:00Z'));
    expect(result.updatedAtByMode).toEqual({ seasonal: Date.parse('2026-09-06T12:00:00Z') });
    expect(result.data.seasonal).toEqual({ level: 5 });
    expect(result.data.pve).toBeUndefined();
  });
  it.each(['42703', 'PGRST204'])(
    'loads progress before the freshness migration (%s)',
    async (code) => {
      const select = vi.fn((columns: string) => ({
        eq: () => ({
          in: () => ({
            in: async () =>
              columns.includes('progress_updated_at')
                ? {
                    data: null,
                    error: {
                      code,
                      message: 'column user_game_mode_progress.progress_updated_at does not exist',
                    },
                  }
                : {
                    data: [{ game_mode: 'pvp', season_number: 0, progress_data: { level: 8 } }],
                    error: null,
                  },
          }),
        }),
      }));
      const result = await loadModeProgress(
        { from: () => ({ select }) } as unknown as ModeProgressClient,
        'user-1'
      );
      expect(result.error).toBeNull();
      expect(result.data.pvp).toEqual({ level: 8 });
      expect(result.updatedAtByMode).toEqual({});
      expect(result.updatedAt).toBeUndefined();
      expect(select).toHaveBeenCalledTimes(2);
      expect(select).toHaveBeenLastCalledWith('game_mode,season_number,progress_data');
    }
  );
  it.each([
    { code: '42501', message: 'permission denied for progress_updated_at' },
    { code: '42703', message: 'column progress_data does not exist' },
    { code: 'PGRST204', message: 'column other_progress_updated_at does not exist' },
  ])('does not mask unrelated read errors: $message', async (error) => {
    const select = vi.fn(() => ({
      eq: () => ({ in: () => ({ in: async () => ({ data: null, error }) }) }),
    }));
    const result = await loadModeProgress(
      { from: () => ({ select }) } as unknown as ModeProgressClient,
      'user-1'
    );
    expect(result.error).toEqual(error);
    expect(select).toHaveBeenCalledOnce();
  });
  it('surfaces a failed compatibility read without retrying indefinitely', async () => {
    const error = { code: '42703', message: 'column progress_updated_at does not exist' };
    const select = vi.fn(() => ({
      eq: () => ({ in: () => ({ in: async () => ({ data: null, error }) }) }),
    }));
    const result = await loadModeProgress(
      { from: () => ({ select }) } as unknown as ModeProgressClient,
      'user-1'
    );
    expect(result.error).toEqual(error);
    expect(result.data).toEqual({});
    expect(select).toHaveBeenCalledTimes(2);
  });
  it('normalizes rejected sync RPCs into the error result', async () => {
    const client: ProgressRpcClient = {
      rpc: vi.fn().mockRejectedValue(new Error('network unavailable')),
    };
    const result = await syncProgressState(client, 'user-1', defaultState);
    expect(result.error).toMatchObject({ message: 'network unavailable' });
  });
  it('returns an error result when normalized progress loading rejects', async () => {
    const query = Promise.reject(new Error('query unavailable'));
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              in: () => query,
            }),
          }),
        }),
      }),
    } as unknown as ModeProgressClient;
    const result = await loadModeProgress(client, 'user-1');
    expect(result.data).toEqual({});
    expect(result.error).toMatchObject({ message: 'query unavailable' });
  });
});
