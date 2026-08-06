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
