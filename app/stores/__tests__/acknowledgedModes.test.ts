import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultState, type UserState } from '@/stores/progressState';
import { clearAcknowledgedModes, recordAcknowledgedModes } from '@/stores/tarkov/acknowledgedModes';
import { syncProgressState, type ProgressRpcClient } from '@/stores/tarkov/progressPersistence';
const withPvpLevel = (level: number): UserState => {
  const state = structuredClone(defaultState);
  state.pvp.level = level;
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
});
