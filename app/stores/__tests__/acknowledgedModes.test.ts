import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultState, type UserState } from '@/stores/progressState';
import {
  clearAcknowledgedModes,
  noteRemoteProgressApplied,
  recordAcknowledgedModes,
} from '@/stores/tarkov/acknowledgedModes';
import { syncProgressState, type ProgressRpcClient } from '@/stores/tarkov/progressPersistence';
const withPvpLevel = (level: number): UserState => {
  const state = structuredClone(defaultState);
  state.pvp.level = level;
  return state;
};
const withHeavyModes = (): UserState => {
  const state = structuredClone(defaultState);
  const objectives = Object.fromEntries(
    Array.from({ length: 2500 }, (_, i) => [
      `objective-${i}`.padEnd(40, 'x'),
      { complete: true, count: 1 },
    ])
  );
  state.pvp.taskObjectives = objectives;
  state.pve.taskObjectives = structuredClone(objectives);
  return state;
};
const sentModes = (rpc: ReturnType<typeof vi.fn>): Record<string, unknown> =>
  (rpc.mock.calls.at(-1)?.[1] as { p_modes: Record<string, unknown> }).p_modes;
describe('mode-scoped progress sync', () => {
  afterEach(() => clearAcknowledgedModes());
  it('sends every mode when the server copy is unknown', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await syncProgressState({ rpc } as ProgressRpcClient, 'user-1', withPvpLevel(5));
    expect(Object.keys(sentModes(rpc))).toEqual(['pvp', 'pve', 'seasonal']);
  });
  it('sends only modes that changed since the last acknowledged sync', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as ProgressRpcClient;
    await syncProgressState(client, 'user-1', withPvpLevel(5));
    await syncProgressState(client, 'user-1', withPvpLevel(6));
    expect(sentModes(rpc)).toEqual({ pvp: expect.objectContaining({ level: 6 }) });
    await syncProgressState(client, 'user-1', withPvpLevel(6));
    expect(sentModes(rpc)).toEqual({});
  });
  it('resends modes after a failed sync', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as ProgressRpcClient;
    await syncProgressState(client, 'user-1', withPvpLevel(5));
    rpc.mockResolvedValueOnce({ error: { message: 'offline' } });
    await syncProgressState(client, 'user-1', withPvpLevel(6));
    await syncProgressState(client, 'user-1', withPvpLevel(6));
    expect(sentModes(rpc)).toEqual({ pvp: expect.objectContaining({ level: 6 }) });
  });
  it('compares against a loaded server copy regardless of key order', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const state = withPvpLevel(5);
    const reordered = Object.fromEntries(Object.entries(state.pve).reverse());
    recordAcknowledgedModes('user-1', {
      pvp: state.pvp,
      pve: reordered as UserState['pve'],
      seasonal: state.seasonal,
    });
    await syncProgressState({ rpc } as ProgressRpcClient, 'user-1', state);
    expect(sentModes(rpc)).toEqual({});
  });
  it('does not apply another account baseline', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const state = withPvpLevel(5);
    recordAcknowledgedModes('user-1', { pvp: state.pvp, pve: state.pve, seasonal: state.seasonal });
    await syncProgressState({ rpc } as ProgressRpcClient, 'user-2', state);
    expect(Object.keys(sentModes(rpc))).toEqual(['pvp', 'pve', 'seasonal']);
  });
  it('splits a sync of several large modes into one request per mode', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await syncProgressState({ rpc } as ProgressRpcClient, 'user-1', withHeavyModes());
    const batches = rpc.mock.calls.map((call) =>
      Object.keys((call[1] as { p_modes: object }).p_modes)
    );
    expect(batches).toEqual([['pvp'], ['pve'], ['seasonal']]);
  });
  it('resends only the unacknowledged modes after a split request fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'x' } });
    const client = { rpc } as ProgressRpcClient;
    const state = withHeavyModes();
    const first = await syncProgressState(client, 'user-1', state);
    expect(first.error).toEqual({ message: 'x' });
    expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockClear();
    await syncProgressState(client, 'user-1', state);
    const batches = rpc.mock.calls.map((call) =>
      Object.keys((call[1] as { p_modes: object }).p_modes)
    );
    expect(batches).toEqual([['pve', 'seasonal']]);
  });
  it('stops a split sync when the session resets between requests', async () => {
    const rpc = vi.fn().mockImplementation(async () => {
      clearAcknowledgedModes();
      return { error: null };
    });
    const client = { rpc } as ProgressRpcClient;
    await syncProgressState(client, 'user-1', withHeavyModes());
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValue({ error: null });
    await syncProgressState(client, 'user-1', withHeavyModes());
    expect(rpc).toHaveBeenCalledTimes(4);
  });
  it('stops a split sync when another account claims the baseline', async () => {
    const rpc = vi.fn().mockImplementation(async () => {
      recordAcknowledgedModes('user-2', {});
      return { error: null };
    });
    await syncProgressState({ rpc } as ProgressRpcClient, 'user-1', withHeavyModes());
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('stops a split sync once Realtime applies newer progress', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    rpc.mockImplementationOnce(async () => {
      noteRemoteProgressApplied();
      return { error: null };
    });
    const client = { rpc } as ProgressRpcClient;
    const state = withHeavyModes();
    const result = await syncProgressState(client, 'user-1', state);
    expect(result.error).toBeNull();
    expect(Object.keys(sentModes(rpc))).toEqual(['pvp']);
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockClear();
    await syncProgressState(client, 'user-1', state);
    const batches = rpc.mock.calls.map((call) =>
      Object.keys((call[1] as { p_modes: object }).p_modes)
    );
    expect(batches).toEqual([['pvp'], ['pve'], ['seasonal']]);
  });
});
