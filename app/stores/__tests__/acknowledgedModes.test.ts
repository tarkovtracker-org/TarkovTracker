import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultState, type UserState } from '@/stores/progressState';
import {
  clearAcknowledgedModes,
  noteRemoteProgressApplied,
  recordAcknowledgedModes,
} from '@/stores/tarkov/acknowledgedModes';
import { buildUpsertPayload } from '@/stores/tarkov/progressMerge';
import {
  sendProgressSync,
  syncProgressState,
  type ProgressRpcClient,
} from '@/stores/tarkov/progressPersistence';
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const acknowledgeState = (userId: string, state: UserState): void =>
  recordAcknowledgedModes(userId, { pvp: state.pvp, pve: state.pve, seasonal: state.seasonal });
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
  it('uses the last committed link as the interim UID for a queued relink', async () => {
    recordAcknowledgedModes('user-1', {}, { tarkovUid: 7 });
    const older = { ...withPvpLevel(2), tarkovUid: 1001 };
    const newer = { ...withPvpLevel(3), tarkovUid: 2002 };
    const pending = deferred();
    const echo = (state: UserState, tarkovUid: number) => {
      const metadata = {
        currentGameMode: state.currentGameMode,
        gameEdition: state.gameEdition,
        tarkovUid,
      };
      noteRemoteProgressApplied({ remote: metadata, applied: metadata });
    };
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      if (args.p_tarkov_uid === 1001) {
        echo(older, 7);
        await pending.promise;
        echo(older, 1001);
      } else {
        echo(newer, 1001);
        echo(newer, 2002);
      }
      return { data: { tarkov_uid: args.p_tarkov_uid, tarkov_uid_conflict: false }, error: null };
    });
    const client = { rpc } as ProgressRpcClient;
    const first = syncProgressState(client, 'user-1', older);
    const second = syncProgressState(client, 'user-1', newer);
    pending.resolve();
    expect((await first).error).not.toBeNull();
    expect((await second).error).toBeNull();
  });
  it.each(['before-reply', 'after-reply'])(
    'continues split linking through interim and final metadata echoes: %s',
    async (finalTiming) => {
      recordAcknowledgedModes('user-1', {}, { tarkovUid: 7 });
      const state = withHeavyModes();
      state.tarkovUid = 1001;
      const pending = deferred();
      const echo = (tarkovUid: number | null) => {
        const metadata = {
          currentGameMode: state.currentGameMode,
          gameEdition: state.gameEdition,
          tarkovUid,
        };
        noteRemoteProgressApplied({ remote: metadata, applied: metadata });
      };
      const rpc = vi.fn(async () => {
        if (rpc.mock.calls.length === 1) {
          echo(7);
          if (finalTiming === 'before-reply') echo(1001);
          await pending.promise;
        }
        return { data: { tarkov_uid: 1001, tarkov_uid_conflict: false }, error: null };
      });
      const save = syncProgressState({ rpc } as ProgressRpcClient, 'user-1', state);
      pending.resolve();
      expect((await save).error).toBeNull();
      if (finalTiming === 'after-reply') echo(1001);
      expect(rpc.mock.calls.length).toBe(3);
    }
  );
  it('carries a UID conflict through split batches without resubmitting the rejected UID', async () => {
    recordAcknowledgedModes('user-1', {}, { tarkovUid: null });
    const state = withHeavyModes();
    state.tarkovUid = 1001;
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const metadata = {
        currentGameMode: state.currentGameMode,
        gameEdition: state.gameEdition,
        tarkovUid: null,
      };
      noteRemoteProgressApplied({ remote: metadata, applied: metadata });
      return {
        data: { tarkov_uid: null, tarkov_uid_conflict: args.p_tarkov_uid === 1001 },
        error: null,
      };
    });
    const result = await syncProgressState({ rpc } as ProgressRpcClient, 'user-1', state);
    expect(result.error).toBeNull();
    expect(result.tarkovUidConflict).toEqual({ rejectedUid: 1001, storedUid: null });
    expect(rpc.mock.calls.map((call) => call[1].p_tarkov_uid)).toEqual([1001, null, null]);
  });
  it('stops a split if the old UID returns after the final link echo', async () => {
    recordAcknowledgedModes('user-1', {}, { tarkovUid: 7 });
    const state = withHeavyModes();
    state.tarkovUid = 1001;
    const rpc = vi.fn(async () => {
      for (const tarkovUid of [1001, 7]) {
        const metadata = {
          currentGameMode: state.currentGameMode,
          gameEdition: state.gameEdition,
          tarkovUid,
        };
        noteRemoteProgressApplied({ remote: metadata, applied: metadata });
      }
      return { data: { tarkov_uid: 1001, tarkov_uid_conflict: false }, error: null };
    });
    expect(
      (await syncProgressState({ rpc } as ProgressRpcClient, 'user-1', state)).error
    ).not.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  afterEach(() => clearAcknowledgedModes());
  it('persists a revert while an older upload and a direct reset overlap', async () => {
    const baseline = withPvpLevel(5);
    recordAcknowledgedModes('user-1', {
      pvp: baseline.pvp,
      pve: baseline.pve,
      seasonal: baseline.seasonal,
    });
    const server = structuredClone(baseline);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      if (rpc.mock.calls.length === 1) await pending;
      Object.assign(server, args.p_modes);
      return { error: null };
    });
    const client = { rpc } as ProgressRpcClient;
    const older = syncProgressState(client, 'user-1', withPvpLevel(8));
    const reverted = structuredClone(baseline);
    reverted.pve.progressEpoch = 1;
    const newer = syncProgressState(client, 'user-1', reverted);
    const callsBeforeRelease = rpc.mock.calls.length;
    release();
    const [olderResult, newerResult] = await Promise.all([older, newer]);
    expect(callsBeforeRelease).toBe(1);
    expect(olderResult.error).toEqual({ message: 'Progress sync superseded by newer state' });
    expect(newerResult.error).toBeNull();
    expect(server.pvp.level).toBe(5);
    expect(server.pve.progressEpoch).toBe(1);
    expect(sentModes(rpc)).toEqual({ pvp: reverted.pvp, pve: reverted.pve });
    await syncProgressState(client, 'user-1', reverted);
    expect(sentModes(rpc)).toEqual({});
  });
  it('drops superseded queued saves without dispatching their stale snapshots', async () => {
    acknowledgeState('user-1', withPvpLevel(5));
    const pending = deferred();
    const rpc = vi.fn().mockResolvedValue({ error: null });
    rpc.mockImplementationOnce(async () => {
      await pending.promise;
      return { error: null };
    });
    const client = { rpc } as ProgressRpcClient;
    const older = syncProgressState(client, 'user-1', withPvpLevel(6));
    const superseded = syncProgressState(client, 'user-1', withPvpLevel(7));
    const latest = syncProgressState(client, 'user-1', withPvpLevel(8));
    pending.resolve();
    const results = await Promise.all([older, superseded, latest]);
    expect(results.map((result) => result.error)).toEqual([
      { message: 'Progress sync superseded by newer state' },
      { message: 'Progress sync superseded by newer state' },
      null,
    ]);
    expect(rpc.mock.calls.map((call) => call[1].p_modes.pvp.level)).toEqual([6, 8]);
  });
  it.each(['realtime', 'same-account restart'])(
    'invalidates a baseline reloaded during an outstanding write: %s',
    async (event) => {
      const baseline = withPvpLevel(5);
      acknowledgeState('user-1', baseline);
      const pending = deferred();
      const rpc = vi.fn().mockResolvedValue({ error: null });
      rpc.mockImplementationOnce(async () => {
        await pending.promise;
        return { error: null };
      });
      const client = { rpc } as ProgressRpcClient;
      const older = syncProgressState(client, 'user-1', withPvpLevel(8));
      if (event === 'realtime') noteRemoteProgressApplied();
      else clearAcknowledgedModes();
      acknowledgeState('user-1', baseline);
      const newer = syncProgressState(client, 'user-1', baseline);
      pending.resolve();
      const [olderResult, newerResult] = await Promise.all([older, newer]);
      expect(olderResult.error).toEqual({ message: 'Progress sync superseded by newer state' });
      expect(newerResult.error).toBeNull();
      expect(sentModes(rpc)).toEqual({ pvp: baseline.pvp });
    }
  );
  it('drops a queued save if its session resets before dispatch', async () => {
    const pending = deferred();
    const rpc = vi.fn(async () => {
      await pending.promise;
      return { error: null };
    });
    const client = { rpc } as ProgressRpcClient;
    const older = syncProgressState(client, 'user-1', withPvpLevel(6));
    const queued = syncProgressState(client, 'user-1', withPvpLevel(7));
    clearAcknowledgedModes();
    pending.resolve();
    const results = await Promise.all([older, queued]);
    expect(
      results.every((result) => result.error?.message === 'Progress sync superseded by newer state')
    ).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('does not block or invalidate another account when an old request settles', async () => {
    const baseline = withPvpLevel(5);
    acknowledgeState('user-1', baseline);
    const pending = deferred();
    const oldRpc = vi.fn(async () => {
      await pending.promise;
      return { error: null };
    });
    const older = syncProgressState({ rpc: oldRpc }, 'user-1', withPvpLevel(8));
    clearAcknowledgedModes();
    acknowledgeState('user-2', baseline);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as ProgressRpcClient;
    const newerResult = await syncProgressState(client, 'user-2', baseline);
    expect(newerResult.error).toBeNull();
    expect(sentModes(rpc)).toEqual({});
    pending.resolve();
    expect((await older).error).toEqual({ message: 'Progress sync superseded by newer state' });
    await syncProgressState(client, 'user-2', baseline);
    expect(sentModes(rpc)).toEqual({});
  });
  it.each(['error', 'rejection'])(
    'continues the account queue after an RPC %s',
    async (failure) => {
      const baseline = withPvpLevel(5);
      acknowledgeState('user-1', baseline);
      const pending = deferred();
      const rpc = vi.fn().mockResolvedValue({ error: null });
      rpc.mockImplementationOnce(async () => {
        await pending.promise;
        if (failure === 'rejection') throw new Error('offline');
        return { error: { message: 'AbortError: request aborted' } };
      });
      const client = { rpc } as ProgressRpcClient;
      const older = syncProgressState(client, 'user-1', withPvpLevel(8));
      const newer = syncProgressState(client, 'user-1', baseline);
      pending.resolve();
      const [olderResult, newerResult] = await Promise.all([older, newer]);
      expect(olderResult.error).not.toBeNull();
      if (failure === 'error') {
        expect(olderResult.error).toEqual({ message: 'Progress sync superseded by newer state' });
      }
      expect(newerResult.error).toBeNull();
      expect(sentModes(rpc)).toEqual({ pvp: baseline.pvp });
    }
  );
  it('captures the wire snapshot before a save waits in the account queue', async () => {
    const pending = deferred();
    const rpc = vi.fn().mockResolvedValue({ error: null });
    rpc.mockImplementationOnce(async () => {
      await pending.promise;
      return { error: null };
    });
    const client = { rpc } as ProgressRpcClient;
    const older = syncProgressState(client, 'user-1', withPvpLevel(6));
    const payload = buildUpsertPayload('user-1', withPvpLevel(7));
    const newer = sendProgressSync(client, 'user-1', payload);
    payload.pvp_data.level = 9;
    pending.resolve();
    await Promise.all([older, newer]);
    expect(sentModes(rpc).pvp).toEqual(expect.objectContaining({ level: 7 }));
  });
  it('continues a split save after a delayed matching echo from an earlier batch', async () => {
    let firstMode!: UserState['pvp'];
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const modes = args.p_modes as Partial<UserState>;
      if (modes.pvp) firstMode = modes.pvp;
      if (modes.pve) {
        noteRemoteProgressApplied({ remote: { pvp: firstMode }, applied: { pvp: firstMode } });
      }
      return { error: null };
    });
    const result = await syncProgressState({ rpc }, 'user-1', withHeavyModes());
    expect(result.error).toBeNull();
    expect(rpc.mock.calls.map((call) => Object.keys(call[1].p_modes as object))).toEqual([
      ['pvp'],
      ['pve'],
      ['seasonal'],
    ]);
  });
  it.each(['remote', 'applied'])(
    'interrupts a save when the %s scope differs from its expected echo',
    async (scope) => {
      const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
        const pvp = (args.p_modes as Partial<UserState>).pvp!;
        const update = { remote: { pvp }, applied: { pvp } };
        update[scope as 'remote' | 'applied'] = { pvp: { ...pvp, level: 9 } };
        noteRemoteProgressApplied(update);
        return { error: null };
      });
      const result = await syncProgressState({ rpc }, 'user-1', withPvpLevel(5));
      expect(result.error).toEqual({ message: 'Progress sync superseded by newer state' });
    }
  );
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
    expect(result.error).toEqual({ message: 'Progress sync superseded by newer state' });
    expect(Object.keys(sentModes(rpc))).toEqual(['pvp']);
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockClear();
    await syncProgressState(client, 'user-1', state);
    const batches = rpc.mock.calls.map((call) =>
      Object.keys((call[1] as { p_modes: object }).p_modes)
    );
    expect(batches).toEqual([['pvp'], ['pve'], ['seasonal']]);
  });
  it('keeps a single-mode sync when Realtime updates a mode it does not write', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as ProgressRpcClient;
    const baseline = withPvpLevel(5);
    acknowledgeState('user-1', baseline);
    rpc.mockImplementationOnce(async () => {
      const pve = { ...structuredClone(baseline.pve), level: 30 };
      noteRemoteProgressApplied({ remote: { pve }, applied: { pve } });
      return { error: null };
    });
    const result = await syncProgressState(client, 'user-1', withPvpLevel(6));
    expect(result.error).toBeNull();
    expect(sentModes(rpc)).toEqual({ pvp: expect.objectContaining({ level: 6 }) });
    await syncProgressState(client, 'user-1', withPvpLevel(6));
    expect(sentModes(rpc)).toEqual({});
  });
  it('stops a sync when Realtime changes a mode it writes', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as ProgressRpcClient;
    acknowledgeState('user-1', withPvpLevel(5));
    rpc.mockImplementationOnce(async () => {
      const pvp = structuredClone(withPvpLevel(7).pvp);
      noteRemoteProgressApplied({ remote: { pvp }, applied: { pvp } });
      return { error: null };
    });
    const result = await syncProgressState(client, 'user-1', withPvpLevel(6));
    expect(result.error).toEqual({ message: 'Progress sync superseded by newer state' });
  });
  it('stops an older split sync when a newer same-user sync starts', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as ProgressRpcClient;
    let newer: Promise<unknown> | undefined;
    rpc.mockImplementationOnce(async () => {
      newer = syncProgressState(client, 'user-1', withPvpLevel(9));
      return { error: null };
    });
    const older = await syncProgressState(client, 'user-1', withHeavyModes());
    await newer;
    expect(older.error).toEqual({ message: 'Progress sync superseded by newer state' });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(sentModes(rpc)).toEqual(
      expect.objectContaining({ pvp: expect.objectContaining({ level: 9 }) })
    );
  });
});
