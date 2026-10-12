// @vitest-environment happy-dom
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { STORAGE_KEYS } from '@/utils/storageKeys';
vi.unmock('@/stores/tarkov/progressAuthority');
describe('native progress authority integration', () => {
  let factory: IDBFactory;
  beforeEach(() => {
    vi.resetModules();
    factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: factory });
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const open = async (owner: string | null = null) => {
    const authority = await import('@/stores/tarkov/progressAuthority');
    await authority.initializeProgressAuthority(owner);
    return authority;
  };
  it('times out a silent database open, closes late success and allows a real reopen', async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const request = { onsuccess: null as null | (() => void), result: { close } };
    const blockedOpen = vi
      .spyOn(factory, 'open')
      .mockReturnValue(request as unknown as IDBOpenDBRequest);
    const a = await import('@/stores/tarkov/progressAuthority');
    let outcome: unknown;
    const opening = a.initializeProgressAuthority(null).then(
      () => null,
      (error: unknown) => {
        outcome = error;
        return error;
      }
    );
    await vi.advanceTimersByTimeAsync(4999);
    expect(a.isProgressAuthorityReady()).toBe(false);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toMatchObject({ name: 'TimeoutError' });
    await opening;
    request.onsuccess!();
    expect(close).toHaveBeenCalledOnce();
    expect(a.isProgressAuthorityReady()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    blockedOpen.mockRestore();
    vi.useRealTimers();
    await a.initializeProgressAuthority(null);
    expect(a.isProgressAuthorityReady()).toBe(true);
  });
  it('hydrates committed progress when capturing a newer legacy copy exceeds quota', async () => {
    const original = JSON.stringify({ _userId: null, data: {} });
    localStorage.setItem(STORAGE_KEYS.progress, original);
    const a = await open();
    await a.commitProgressMutation(
      () => {
        a.writeAuthoritativeProgress('committed');
        return { ok: true };
      },
      () => true,
      null
    );
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({ _userId: null, data: { newer: true } })
    );
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.resetModules();
    const b = await open();
    expect(b.readAuthoritativeProgress()).toBe('committed');
    expect(b.isProgressAuthorityReady()).toBe(true);
    expect(b.legacyProgressRecoveryOverflow.value).toBe(true);
  });
  it('keeps a capture failure visible across durable mutations until capture succeeds', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: null, data: {} }));
    await open();
    const pending = JSON.stringify({ _userId: null, data: { newer: true } });
    localStorage.setItem(STORAGE_KEYS.progress, pending);
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.resetModules();
    const a = await open();
    expect(a.legacyProgressRecoveryOverflow.value).toBe(true);
    put.mockRestore();
    await a.commitProgressMutation(
      () => {
        a.writeAuthoritativeProgress(JSON.stringify({ _userId: null, data: { edited: true } }));
        return { ok: true };
      },
      () => true,
      null
    );
    expect(a.legacyProgressRecoveryOverflow.value).toBe(true);
    await a.refreshProgressAuthority();
    expect(a.legacyProgressRecoveryOverflow.value).toBe(false);
    expect(
      a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), null)
    ).toContain(pending);
  });
  it('retains consecutive failed captures and does not erase them on an unobserved read failure', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: null, data: {} }));
    const a = await open();
    const raws = ['a', 'b'].map((value) => JSON.stringify({ _userId: null, data: { value } }));
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    for (const raw of raws)
      await expect(a.refreshProgressAuthority(() => raw)).rejects.toMatchObject({
        name: 'QuotaExceededError',
      });
    put.mockRestore();
    vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementationOnce(() => {
      throw new DOMException('unavailable', 'AbortError');
    });
    await expect(a.refreshProgressAuthority()).rejects.toMatchObject({ name: 'AbortError' });
    const exported = a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), null);
    expect(exported).toEqual(expect.arrayContaining(raws));
    await a.discardExportedLegacyProgress(null, [raws[0]!]);
    expect(a.legacyProgressRecoveryOverflow.value).toBe(true);
    expect(
      a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), null)
    ).toContain(raws[1]);
    await a.discardExportedLegacyProgress(null, [raws[1]!]);
    expect(a.legacyProgressRecoveryOverflow.value).toBe(false);
  });
  it('bounds failed capture retention and keeps a truncation warning after export', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: null, data: {} }));
    const a = await open();
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    for (let value = 0; value < 21; value++) {
      const raw = JSON.stringify({ _userId: null, data: { value } });
      await expect(a.refreshProgressAuthority(() => raw)).rejects.toMatchObject({
        name: 'QuotaExceededError',
      });
    }
    put.mockRestore();
    const exported = a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), null);
    expect(exported).toHaveLength(20);
    await a.discardExportedLegacyProgress(null, exported);
    expect(a.legacyProgressRecoveryOverflow.value).toBe(true);
    vi.resetModules();
    const reopened = await open();
    expect(reopened.legacyProgressRecoveryOverflow.value).toBe(true);
  });
  it('retains a failed refresh capture after its storage event value is overwritten', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: null, data: {} }));
    const a = await open();
    const missed = JSON.stringify({ _userId: null, data: { missed: true } });
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(a.refreshProgressAuthority(() => missed)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(a.legacyProgressRecoveryOverflow.value).toBe(true);
    put.mockRestore();
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({ _userId: null, data: { newer: true } })
    );
    await a.refreshProgressAuthority();
    expect(a.legacyProgressRecoveryOverflow.value).toBe(true);
    expect(
      a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), null)
    ).toContain(missed);
  });
  it('retains failed recovery across account switches without exposing another owner', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: 'a', data: {} }));
    const a = await open('a');
    const missed = JSON.stringify({ _userId: 'a', data: { missed: true } });
    let put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(a.refreshProgressAuthority(() => missed)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    put.mockRestore();
    localStorage.removeItem(STORAGE_KEYS.progress);
    await a.initializeProgressAuthority('b');
    expect(
      a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), 'b')
    ).not.toContain(missed);
    expect(a.legacyProgressRecoveryOverflow.value).toBe(false);
    const missedB = JSON.stringify({ _userId: 'b', data: { missed: true } });
    put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(a.refreshProgressAuthority(() => missedB)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    put.mockRestore();
    await a.initializeProgressAuthority('a');
    expect(a.legacyProgressRecoveryOverflow.value).toBe(true);
    const exported = a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), 'a');
    expect(exported).toContain(missed);
    await a.discardExportedLegacyProgress('a', exported);
    expect(a.legacyProgressRecoveryOverflow.value).toBe(false);
    await a.initializeProgressAuthority('b');
    expect(a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), 'b')).toContain(
      missedB
    );
    expect(await a.removeOwnedProgressRecovery('b')).toEqual({ complete: true, released: true });
    expect(
      a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), 'b')
    ).not.toContain(missedB);
    expect(a.legacyProgressRecoveryOverflow.value).toBe(false);
  });
  it('reports unknown buffered ownership as incomplete device removal', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: 'a', data: {} }));
    const a = await open('a');
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(a.refreshProgressAuthority(() => '{malformed')).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    put.mockRestore();
    expect(await a.removeOwnedProgressRecovery('a')).toEqual({ complete: false, released: true });
  });
  it('keeps a failed snapshot available when a different legacy snapshot is captured', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: null, data: {} }));
    await open();
    const missed = JSON.stringify({ _userId: null, data: { missed: true } });
    localStorage.setItem(STORAGE_KEYS.progress, missed);
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.resetModules();
    const a = await open();
    put.mockRestore();
    const newer = JSON.stringify({ _userId: null, data: { newer: true } });
    localStorage.setItem(STORAGE_KEYS.progress, newer);
    await a.refreshProgressAuthority();
    expect(a.legacyProgressRecoveryOverflow.value).toBe(true);
    const record = await a.readCommittedProgressAuthority(false);
    expect(record.lastLegacyRaw).toBe(newer);
    const exported = a.exportableLegacyUpdates(record, null);
    expect(exported).toContain(missed);
    await a.discardExportedLegacyProgress(null, exported);
    expect(a.legacyProgressRecoveryOverflow.value).toBe(false);
  });
  it.each([null, 'foreign'])(
    'preserves a known non-target owner %s without blocking writes',
    async (owner) => {
      const raw = JSON.stringify({ _userId: owner, data: null });
      localStorage.setItem(STORAGE_KEYS.progress, raw);
      const a = await open('target');
      expect(await a.removeOwnedProgressRecovery('target')).toEqual({
        complete: true,
        released: true,
      });
      expect((await a.readCommittedProgressAuthority(false)).raw).toBe(raw);
    }
  );
  it.each([null, 'foreign'])(
    'policy double recognizes owner %s independently of payload validity',
    async (owner) => {
      const { createProgressPolicyAuthority } =
        await import('#tests/test-helpers/progressAuthority');
      const double = createProgressPolicyAuthority();
      localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ _userId: owner }));
      expect(await double.removeOwnedProgressRecovery()).toEqual({
        complete: true,
        released: true,
      });
      expect(double.isOwnedProgressRecovery(JSON.stringify({ data: {} }), null)).toBe(false);
    }
  );
  it('retries a transient activation failure within the same owner session', async () => {
    const nativePut = IDBObjectStore.prototype.put;
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementationOnce(function () {
        throw new DOMException('transient', 'AbortError');
      })
      .mockImplementation(function (this: IDBObjectStore, ...args) {
        return nativePut.apply(this, args);
      });
    const a = await open();
    expect(a.isProgressAuthorityReady()).toBe(true);
    expect(put.mock.calls.length).toBeGreaterThan(1);
  });
  it('does not export malformed or unknown recovery ownership as guest data', async () => {
    const a = await open();
    for (const raw of [
      'broken',
      '{}',
      JSON.stringify({ _userId: 7 }),
      JSON.stringify({ data: {} }),
    ]) {
      expect(a.isOwnedProgressRecovery(raw, null)).toBe(false);
    }
    expect(a.isOwnedProgressRecovery(JSON.stringify({ _userId: null, data: {} }), null)).toBe(true);
  });
  it('deletes owned legacy projections before announcing the final native purge', async () => {
    const original = JSON.stringify({ _userId: 'a', data: {} });
    localStorage.setItem(STORAGE_KEYS.progress, original);
    const a = await open('a');
    a.configureProgressSession(() => 'a');
    const { openActiveProgressRepository } = await import('@/stores/tarkov/progressRepository');
    const peer = await openActiveProgressRepository(factory, 'tarkovtracker-active-progress-v1');
    const peerToken = await peer.activateOwner('a');
    let peerRefresh: ReturnType<typeof peer.read> | undefined;
    const { removeAccountDeviceData } = await import('@/stores/tarkov/deviceData');
    let legacyAtPurge: string | null | undefined;
    const postMessage = vi.fn(({ revision }: { revision: number }) => {
      if (revision !== 2) return;
      legacyAtPurge = localStorage.getItem(STORAGE_KEYS.progress);
      const observedLegacy = legacyAtPurge;
      peerRefresh = peer.read(peerToken, () => observedLegacy);
    });
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: unknown, _options: unknown, callback: () => unknown) => callback(),
      },
    });
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        postMessage = postMessage;
        addEventListener() {}
        close() {}
      }
    );
    const stop = a.observeProgressAuthority(vi.fn());
    expect(await removeAccountDeviceData('a')).toBe(true);
    expect(legacyAtPurge).toBeNull();
    expect((await peerRefresh)!.legacyUpdates ?? []).toEqual([]);
    await a.refreshProgressAuthority();
    expect((await a.readCommittedProgressAuthority(false)).legacyUpdates ?? []).toEqual([]);
    stop();
    peer.close();
  });
  it('imports exact legacy bytes once, commits new-only bytes and reloads without legacy resurrection', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, ' original bytes ');
    const a = await open();
    const accepted = vi.fn();
    expect(
      await a.commitProgressMutation(
        () => {
          a.writeAuthoritativeProgress('new-only');
          a.afterProgressCommit(accepted);
          return { ok: true };
        },
        () => true,
        null
      )
    ).toEqual({ ok: true });
    expect(accepted).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe(' original bytes ');
    vi.resetModules();
    const b = await open();
    expect(b.readAuthoritativeProgress()).toBe('new-only');
    await b.commitProgressMutation(
      () => {
        b.writeAuthoritativeProgress(null);
        return { ok: true };
      },
      () => true,
      null
    );
    vi.resetModules();
    expect((await open()).readAuthoritativeProgress()).toBeNull();
  });
  it('keeps observed older edits as recovery without adopting them', async () => {
    const a = await open();
    await a.commitProgressMutation(
      () => {
        a.writeAuthoritativeProgress('current');
        return { ok: true };
      },
      () => true,
      null
    );
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify({ _userId: null, data: { edit: true } })
    );
    await a.refreshProgressAuthority();
    expect(a.readAuthoritativeProgress()).toBe('current');
    expect(await a.readCommittedProgressAuthority()).toMatchObject({
      legacyUpdates: [JSON.stringify({ _userId: null, data: { edit: true } })],
    });
    expect(a.legacyProgressRecoveryCount.value).toBe(1);
  });
  it('does not read unavailable localStorage when an authoritative record already exists', async () => {
    const a = await open();
    await a.commitProgressMutation(
      () => {
        a.writeAuthoritativeProgress('saved');
        return { ok: true };
      },
      () => true,
      null
    );
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.resetModules();
    const b = await open();
    expect(b.readAuthoritativeProgress()).toBe('saved');
    await expect(
      b.commitProgressMutation(
        () => {
          b.writeAuthoritativeProgress(null);
          return { ok: true };
        },
        () => true,
        null
      )
    ).resolves.toEqual({ ok: true });
  });
  it('acknowledges and adopts only transaction completion, never a successful put before abort', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, 'original');
    const a = await open();
    const accept = vi.fn();
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = put.apply(this, args);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    await expect(
      a.commitProgressMutation(
        () => {
          a.writeAuthoritativeProgress('lost');
          a.afterProgressCommit(accept);
          return { ok: true };
        },
        () => true,
        null
      )
    ).rejects.toBeTruthy();
    expect(accept).not.toHaveBeenCalled();
    expect(a.readAuthoritativeProgress()).toBe('original');
    vi.restoreAllMocks();
    expect((await a.readCommittedProgressAuthority()).raw).toBe('original');
  });
  it('lets same-owner tabs commit without retiring their shared session generation', async () => {
    const a = await open('a');
    vi.resetModules();
    const b = await open('a');
    await b.initializeProgressAuthority('a');
    await expect(
      a.commitProgressMutation(
        () => {
          a.writeAuthoritativeProgress('peer-save');
          return { ok: true };
        },
        () => true,
        'a'
      )
    ).resolves.toEqual({ ok: true });
    expect((await b.readCommittedProgressAuthority()).raw).toBe('peer-save');
  });
  it('does not adopt an obsolete activation that finishes reading after the new owner', async () => {
    const module = await import('@/stores/tarkov/progressRepository');
    const db = await module.openActiveProgressRepository(
      factory,
      'tarkovtracker-active-progress-v1'
    );
    let release!: () => void;
    let reading!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      reading = resolve;
    });
    vi.spyOn(module, 'openActiveProgressRepository').mockResolvedValue({
      ...db,
      read: async (...args) => {
        const record = await db.read(...args);
        if (args[0].owner === 'a') {
          reading();
          await gate;
        }
        return record;
      },
    });
    const a = await import('@/stores/tarkov/progressAuthority');
    let owner = 'a';
    a.configureProgressSession(() => owner);
    const old = a.initializeProgressAuthority('a');
    await started;
    owner = 'b';
    await a.initializeProgressAuthority('b');
    release();
    await old;
    expect(a.isProgressAuthorityReady()).toBe(true);
    await expect(
      a.commitProgressMutation(
        () => {
          a.writeAuthoritativeProgress('b-save');
          return { ok: true };
        },
        () => true,
        'b'
      )
    ).resolves.toEqual({ ok: true });
    db.close();
  });
  it.each(['write', 'purge'] as const)(
    'adopts and announces a durable %s canceled after put success',
    async (kind) => {
      const original = JSON.stringify({ _userId: 'a', data: {} });
      localStorage.setItem(STORAGE_KEYS.progress, original);
      const a = await open('a');
      a.configureProgressSession(() => 'a');
      const postMessage = vi.fn();
      vi.stubGlobal(
        'BroadcastChannel',
        class {
          postMessage = postMessage;
          addEventListener() {}
          close() {}
        }
      );
      const stop = a.observeProgressAuthority(vi.fn());
      let current = true;
      const action = vi.fn();
      const nativePut = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        ...args
      ) {
        const request = nativePut.apply(this, args);
        request.addEventListener('success', () => {
          current = false;
        });
        return request;
      });
      const result =
        kind === 'write'
          ? await a.commitProgressMutation(
              () => {
                a.writeAuthoritativeProgress('durable');
                a.afterProgressCommit(action);
                return { ok: true };
              },
              () => current,
              'a'
            )
          : await a.removeOwnedProgressRecovery('a', () => current);
      expect(a.readAuthoritativeProgress()).toBe(kind === 'write' ? 'durable' : null);
      expect(postMessage).toHaveBeenCalledWith({ revision: 1 });
      expect(action).not.toHaveBeenCalled();
      expect(result).toMatchObject(
        kind === 'write' ? { canceled: true } : { complete: false, released: false }
      );
      stop();
    }
  );
  it.each([
    ['owner', 'write'],
    ['revision', 'write'],
    ['owner', 'purge'],
    ['revision', 'purge'],
  ] as const)(
    'does not regress a newer %s when an old durable %s receipt resolves late',
    async (change, kind) => {
      const module = await import('@/stores/tarkov/progressRepository');
      const db = await module.openActiveProgressRepository(
        factory,
        'tarkovtracker-active-progress-v1'
      );
      let release!: () => void;
      let didCommit!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const committed = new Promise<void>((resolve) => {
        didCommit = resolve;
      });
      let delay = true;
      vi.spyOn(module, 'openActiveProgressRepository').mockResolvedValue({
        ...db,
        mutate: async (...args) => {
          const receipt = await db.mutate(...args);
          if (delay) {
            delay = false;
            didCommit();
            await gate;
          }
          return receipt;
        },
      });
      const a = await open('a');
      let owner = 'a';
      a.configureProgressSession(() => owner);
      const action = vi.fn();
      const acknowledged = vi.fn();
      const old =
        kind === 'write'
          ? a.commitProgressMutation(
              () => {
                a.writeAuthoritativeProgress('old');
                a.afterProgressCommit(action);
                a.afterProgressCommit(acknowledged, false);
                return { ok: true };
              },
              () => true,
              'a'
            )
          : a.removeOwnedProgressRecovery('a');
      await committed;
      if (change === 'owner') {
        owner = 'b';
        await a.initializeProgressAuthority('b');
      }
      await a.commitProgressMutation(
        () => {
          a.writeAuthoritativeProgress('newer');
          return { ok: true };
        },
        () => true,
        owner
      );
      release();
      expect(await old).toMatchObject(
        kind === 'write'
          ? change === 'revision'
            ? { ok: true }
            : { canceled: true }
          : { complete: false, released: false }
      );
      expect(acknowledged).toHaveBeenCalledTimes(change === 'revision' && kind === 'write' ? 1 : 0);
      expect(a.readAuthoritativeProgress()).toBe('newer');
      expect(action).not.toHaveBeenCalled();
      db.close();
    }
  );
  it('adopts the newer durable guest state when a reset receipt is delayed', async () => {
    const { defaultState } = await import('@/stores/progressState');
    const state = structuredClone(defaultState);
    state.pvp.level = 40;
    const original = JSON.stringify({ _userId: null, data: state });
    localStorage.setItem(STORAGE_KEYS.progress, original);
    const module = await import('@/stores/tarkov/progressRepository');
    const db = await module.openActiveProgressRepository(
      factory,
      'tarkovtracker-active-progress-v1'
    );
    let release!: () => void;
    let didCommit!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const committed = new Promise<void>((resolve) => {
      didCommit = resolve;
    });
    let delay = true;
    vi.spyOn(module, 'openActiveProgressRepository').mockResolvedValue({
      ...db,
      mutate: async (...args) => {
        const receipt = await db.mutate(...args);
        if (delay) {
          delay = false;
          didCommit();
          await gate;
        }
        return receipt;
      },
    });
    const a = await open();
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: unknown, _options: unknown, callback: () => unknown) => callback(),
      },
    });
    const scoped = await import('@/utils/userScopedStorage');
    vi.spyOn(scoped, 'getCurrentSupabaseUserId').mockReturnValue(null);
    const storage = await import('@/stores/tarkov/localStorage');
    storage.setActiveProgressRetentionGuard(() => true);
    storage.progressStorageSerializer.reset(storage.parsePersistedProgressState(original, null));
    const accept = vi.fn();
    const resetting = storage.resetGuestProgress(['pvp'], false, () => state, accept);
    await Promise.race([
      committed,
      resetting.then(() => {
        throw new Error('Reset settled before its commit');
      }),
    ]);
    const peer = await db.activateOwner(null);
    await db.mutate(peer, (current) => {
      const value = JSON.parse(current.raw!);
      value.data.pve.level = 42;
      return { raw: JSON.stringify(value), result: true };
    });
    await a.refreshProgressAuthority();
    release();
    expect((await resetting).state).toMatchObject({ pvp: { level: 1 }, pve: { level: 42 } });
    expect(accept).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          pvp: expect.objectContaining({ level: 1 }),
          pve: expect.objectContaining({ level: 42 }),
        }),
      })
    );
    db.close();
  });
  it('announces exported cleanup even when identity changes after put success', async () => {
    const a = await open('a');
    let owner = 'a';
    a.configureProgressSession(() => owner);
    const postMessage = vi.fn();
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        postMessage = postMessage;
        addEventListener() {}
        close() {}
      }
    );
    const stop = a.observeProgressAuthority(vi.fn());
    const nativePut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = nativePut.apply(this, args);
      request.addEventListener('success', () => {
        owner = 'b';
      });
      return request;
    });
    await expect(a.discardExportedLegacyProgress('a', [])).rejects.toThrow(
      'Progress owner changed'
    );
    expect(postMessage).toHaveBeenCalledWith({ revision: 1 });
    expect(a.isProgressAuthorityReady()).toBe(false);
    stop();
  });
  it('rejects an old tab after A to B to A before invoking its mutation', async () => {
    const a = await open('a');
    vi.resetModules();
    const b = await open('b');
    await b.initializeProgressAuthority('a', true);
    const write = vi.fn(() => ({ ok: true as const }));
    await expect(a.commitProgressMutation(write, () => true, 'a')).rejects.toMatchObject({
      reason: 'session',
    });
    expect(write).not.toHaveBeenCalled();
  });
  it('blocks writes for a new identity until its explicit activation finishes', async () => {
    const a = await open('a');
    const write = vi.fn(() => ({ ok: true as const }));
    expect(await a.commitProgressMutation(write, () => true, 'b')).toMatchObject({
      ok: false,
      canceled: true,
    });
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps a hydrated failure closed when IndexedDB cannot open', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, 'legacy');
    vi.spyOn(factory, 'open').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const a = await import('@/stores/tarkov/progressAuthority');
    await expect(a.initializeProgressAuthority(null)).rejects.toThrow('blocked');
    expect(a.isProgressAuthorityReady()).toBe(false);
    expect(() => a.readAuthoritativeProgress()).toThrow('unavailable');
    await expect(
      a.commitProgressMutation(
        () => ({ ok: true }),
        () => true,
        null
      )
    ).rejects.toThrow('not hydrated');
  });
  it('removes only the requested account from IndexedDB import and recovery copies', async () => {
    const original = JSON.stringify({ _userId: 'a', data: { pvp: { level: 9 } } });
    const foreign = JSON.stringify({ _userId: 'b', data: { pve: { level: 42 } } });
    localStorage.setItem(STORAGE_KEYS.progress, original);
    const a = await open('a');
    await a.commitProgressMutation(
      () => {
        a.writeAuthoritativeProgress(foreign);
        return { ok: true };
      },
      () => true,
      'a'
    );
    localStorage.setItem(STORAGE_KEYS.progress, foreign);
    await a.refreshProgressAuthority();
    localStorage.setItem(STORAGE_KEYS.progress, original);
    await a.refreshProgressAuthority();
    expect(await a.removeOwnedProgressRecovery('a')).toEqual({ complete: true, released: true });
    // Device removal clears the native legacy key too; it must not be re-observed.
    localStorage.removeItem(STORAGE_KEYS.progress);
    expect(await a.readCommittedProgressAuthority()).toMatchObject({
      raw: foreign,
      legacyRaw: null,
      legacyUpdates: [foreign],
    });
  });
  it('preserves unattributable recovery bytes and reports incomplete device removal', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, 'opaque original');
    const a = await open('a');
    expect(await a.removeOwnedProgressRecovery('a')).toEqual({ complete: false, released: false });
    expect((await a.readCommittedProgressAuthority()).legacyRaw).toBe('opaque original');
  });
  it('purges owned committed active bytes even when this runtime cached an empty slot', async () => {
    const a = await open('a');
    vi.resetModules();
    const b = await open('a');
    const raw = JSON.stringify({ _userId: 'a', data: { pvp: { level: 55 } } });
    await b.commitProgressMutation(
      () => {
        b.writeAuthoritativeProgress(raw);
        return { ok: true };
      },
      () => true,
      'a'
    );
    expect(a.readAuthoritativeProgress()).toBeNull();
    expect(await a.removeOwnedProgressRecovery('a')).toEqual({ complete: true, released: true });
    expect((await a.readCommittedProgressAuthority()).raw).toBeNull();
  });
  it('keeps unattributable active bytes and marks the active slot unreleased', async () => {
    const a = await open('a');
    const raw = JSON.stringify({ data: { pvp: { level: 55 } } });
    await a.commitProgressMutation(
      () => {
        a.writeAuthoritativeProgress(raw);
        return { ok: true };
      },
      () => true,
      'a'
    );
    expect(await a.removeOwnedProgressRecovery('a')).toEqual({ complete: false, released: false });
    expect((await a.readCommittedProgressAuthority()).raw).toBe(raw);
  });
  it('reads existing archives at quota without putting and includes owned pending overflow in export', async () => {
    const original = JSON.stringify({ _userId: 'a', data: {} });
    localStorage.setItem(STORAGE_KEYS.progress, original);
    const a = await open('a');
    const pending = JSON.stringify({ _userId: 'a', data: { level: 25 } });
    localStorage.setItem(STORAGE_KEYS.progress, pending);
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const record = await a.readCommittedProgressAuthority(false);
    expect(put).not.toHaveBeenCalled();
    expect(a.exportableLegacyUpdates(record, 'a')).toEqual([pending]);
    expect(a.exportableLegacyUpdates(record, 'b')).toEqual([]);
    put.mockRestore();
    await a.discardExportedLegacyProgress('a', [pending]);
    expect(await a.readCommittedProgressAuthority()).toMatchObject({
      raw: original,
      legacyRaw: original,
      lastLegacyRaw: pending,
      legacyRecoveryOverflow: false,
    });
    expect((await a.readCommittedProgressAuthority()).legacyUpdates ?? []).toEqual([]);
    expect(a.exportableLegacyUpdates(await a.readCommittedProgressAuthority(false), 'a')).toEqual(
      []
    );
  });
  it('exports captured copies when legacy storage is blocked and keeps unexported pending edits', async () => {
    const original = JSON.stringify({ _userId: 'a', data: { level: 1 } });
    localStorage.setItem(STORAGE_KEYS.progress, original);
    const a = await open('a');
    const captured = JSON.stringify({ _userId: 'a', data: { level: 20 } });
    localStorage.setItem(STORAGE_KEYS.progress, captured);
    await a.refreshProgressAuthority();
    const pending = JSON.stringify({ _userId: 'a', data: { level: 25 } });
    localStorage.setItem(STORAGE_KEYS.progress, pending);
    const record = await a.readCommittedProgressAuthority(false);
    const read = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(a.exportableLegacyUpdates(record, 'a')).toEqual([captured]);
    read.mockRestore();
    await a.discardExportedLegacyProgress('a', [captured]);
    expect((await a.readCommittedProgressAuthority(false)).lastLegacyRaw).toBe(captured);
    expect((await a.readCommittedProgressAuthority()).legacyUpdates).toEqual([pending]);
  });
  it('clears a fresh-account retained failure only after a later native commit', async () => {
    const a = await open('a');
    a.configureProgressSession(() => 'a');
    const storage = await import('@/stores/tarkov/localStorage');
    const { defaultState } = await import('@/stores/progressState');
    const status = await import('@/stores/tarkov/progressSaveStatus');
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: unknown, _options: unknown, callback: () => unknown) => callback(),
      },
    });
    storage.setActiveProgressRetentionGuard(() => true);
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(
      await storage.persistActiveProgressValue(
        storage.progressStorageSerializer.serialize(state, 'a', 200)
      )
    ).toBe(false);
    expect(a.readAuthoritativeProgress()).toBeNull();
    expect(status.progressSaveStatus.local).toBe('failed');
    put.mockRestore();
    state.pvp.level = 23;
    const nativePut = IDBObjectStore.prototype.put;
    const abort = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = nativePut.apply(this, args);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    expect(
      await storage.persistActiveProgressValue(
        storage.progressStorageSerializer.serialize(state, 'a', 250)
      )
    ).toBe(false);
    expect(a.readAuthoritativeProgress()).toBeNull();
    expect(status.progressSaveStatus.local).toBe('failed');
    abort.mockRestore();
    state.pvp.level = 25;
    expect(
      await storage.persistActiveProgressValue(
        storage.progressStorageSerializer.serialize(state, 'a', 300)
      )
    ).toBe(true);
    expect(status.progressSaveStatus.local).toBe('saved');
    state.pvp.skillOffsets.Endurance = 50;
    expect(
      await storage.persistActiveProgressValue(
        storage.progressStorageSerializer.serialize(state, 'a', 400)
      )
    ).toBe(true);
    expect(
      storage.parsePersistedProgressState((await a.readCommittedProgressAuthority(false)).raw, 'a')!
        .state.pvp
    ).toMatchObject({ level: 25, skillOffsets: { Endurance: 50 } });
    expect(status.progressSaveStatus.local).toBe('saved');
  });
  it('rebases each concurrent runtime mutation on the committed envelope', async () => {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({ pvp: 20, pve: 42 }));
    const a = await open();
    vi.resetModules();
    const b = await open();
    const write = (authority: typeof a, patch: Record<string, number>) =>
      authority.commitProgressMutation(
        () => {
          const current = JSON.parse(authority.readAuthoritativeProgress()!);
          authority.writeAuthoritativeProgress(JSON.stringify({ ...current, ...patch }));
          return { ok: true };
        },
        () => true,
        null
      );
    await Promise.all([write(a, { pve: 55 }), write(b, { pvp: 1 })]);
    expect(JSON.parse((await b.readCommittedProgressAuthority()).raw!)).toEqual({
      pvp: 1,
      pve: 55,
    });
  });
  it('does not expose a malformed foreign owner envelope as guest recovery', async () => {
    const a = await open();
    const foreign = JSON.stringify({ _userId: 'other-account', broken: true });
    expect(a.isOwnedProgressRecovery(foreign, null)).toBe(false);
    expect(
      a.ownedLegacyUpdates(
        { version: 1, revision: 0, raw: null, legacyRaw: null, legacyUpdates: [foreign] },
        null
      )
    ).toEqual([]);
    expect(a.isOwnedProgressRecovery(foreign, 'other-account')).toBe(true);
  });
  it('reopens a connection the browser closed and commits the next edit once', async () => {
    const connections: IDBDatabase[] = [];
    const nativeOpen = factory.open.bind(factory);
    vi.spyOn(factory, 'open').mockImplementation((name: string, version?: number) => {
      const request = nativeOpen(name, version);
      request.addEventListener('success', () => connections.push(request.result));
      return request;
    });
    const a = await open();
    let runs = 0;
    const write = (raw: string) =>
      a.commitProgressMutation(
        () => {
          runs += 1;
          a.writeAuthoritativeProgress(raw);
          return { ok: true };
        },
        () => true,
        null
      );
    await expect(write('first')).resolves.toEqual({ ok: true });
    // A forced close (site data cleared, WebKit IDB server loss) leaves the cached handle unusable.
    connections[0]!.close();
    runs = 0;
    await expect(write('second')).resolves.toEqual({ ok: true });
    expect(runs).toBe(1);
    expect(connections).toHaveLength(2);
    expect(a.readAuthoritativeProgress()).toBe('second');
    expect((await a.readCommittedProgressAuthority(false)).raw).toBe('second');
  });
});
