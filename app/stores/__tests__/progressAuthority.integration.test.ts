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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const open = async (owner: string | null = null) => {
    const authority = await import('@/stores/tarkov/progressAuthority');
    await authority.initializeProgressAuthority(owner);
    return authority;
  };
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
    localStorage.setItem(STORAGE_KEYS.progress, 'older-tab edit');
    await a.refreshProgressAuthority();
    expect(a.readAuthoritativeProgress()).toBe('current');
    expect(await a.readCommittedProgressAuthority()).toMatchObject({
      legacyUpdates: ['older-tab edit'],
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
    expect(await a.removeOwnedProgressRecovery('a')).toBe(true);
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
    expect(await a.removeOwnedProgressRecovery('a')).toBe(false);
    expect((await a.readCommittedProgressAuthority()).legacyRaw).toBe('opaque original');
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
});
