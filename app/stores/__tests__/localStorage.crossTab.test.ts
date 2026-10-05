// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import { STORAGE_KEYS } from '@/utils/storageKeys';
const envelope = (owner: string, level: number) =>
  JSON.stringify({
    _userId: owner,
    data: {
      ...structuredClone(defaultState),
      pvp: { ...structuredClone(defaultState.pvp), level },
    },
  });
const auth = vi.hoisted(() => ({ owner: null as string | null }));
vi.mock('@/utils/userScopedStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/userScopedStorage')>()),
  getCurrentSupabaseUserId: () => auth.owner,
}));
const retain = (current: string | null, next: string | null) => {
  if (current && JSON.parse(current)._userId !== (next && JSON.parse(next)._userId)) {
    localStorage.setItem(`retained:${JSON.parse(current)._userId}`, current);
  }
  return true;
};
/** Separate module instances model tab-local barriers and queues over one origin's storage. */
const openTab = async () => {
  vi.resetModules();
  const tab = await import('@/stores/tarkov/localStorage');
  tab.setActiveProgressRetentionGuard(retain);
  return { ...tab, status: await import('@/stores/tarkov/progressSaveStatus') };
};
describe('active progress across tabs', () => {
  let values: Map<string, string>;
  let lockTail: Promise<unknown>;
  beforeEach(() => {
    auth.owner = null;
    values = new Map();
    lockTail = Promise.resolve();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn((_name, _options, callback) => {
          const result = lockTail.then(() => callback());
          lockTail = result.catch(() => {});
          return result;
        }),
      },
    });
  });
  afterEach(async () => {
    await lockTail;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('retains every owner when a second tab writes between the first read and write', async () => {
    const first = await openTab();
    const second = await openTab();
    const original = envelope('original', 10);
    const firstValue = envelope('first', 20);
    const secondValue = envelope('second', 30);
    values.set(STORAGE_KEYS.progress, original);
    let secondWrite: boolean | Promise<boolean> | undefined;
    first.setActiveProgressRetentionGuard((current, next) => {
      retain(current, next);
      secondWrite = second.persistActiveProgressValue(secondValue);
      return true;
    });
    expect(await first.persistActiveProgressValue(firstValue)).toBe(true);
    expect(await secondWrite).toBe(true);
    expect([...values.values()]).toContain(original);
    expect([...values.values()]).toContain(firstValue);
    expect([...values.values()]).toContain(secondValue);
  });
  it('rechecks exact bytes under the lock before removing an owner copy', async () => {
    const first = await openTab();
    const second = await openTab();
    const original = envelope('first', 10);
    const replacement = envelope('second', 20);
    values.set(STORAGE_KEYS.progress, original);
    const write = second.persistActiveProgressValue(replacement);
    const removal = first.removeActiveProgressValue('first', original);
    expect(await write).toBe(true);
    expect(await removal).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(replacement);
    expect(values.get('retained:first')).toBe(original);
  });
  it('keeps queued plugin edits pending, ordered, and readable until both writes settle', async () => {
    const tab = await openTab();
    const firstValue = envelope('owner', 10);
    const latestValue = envelope('owner', 20);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    tab.progressPersistStorage.setItem(STORAGE_KEYS.progress, firstValue);
    const firstWrite = lockTail;
    // A second tab holds the shared lock between this tab's two plugin writes.
    void navigator.locks.request(
      `${STORAGE_KEYS.progress}:mutation`,
      { mode: 'exclusive' },
      () => gate
    );
    tab.progressPersistStorage.setItem(STORAGE_KEYS.progress, latestValue);
    try {
      expect(tab.progressPersistStorage.getItem(STORAGE_KEYS.progress)).toBe(latestValue);
      // Retention and quota pruning must see durable bytes, never this tab's pending overlay.
      expect(tab.safeGetItem(STORAGE_KEYS.progress)).toBeNull();
      expect(tab.status.progressSaveStatus.local).toBe('pending');
      expect(tab.status.hasUnsavedProgressChanges()).toBe(true);
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);
      await firstWrite;
      // Let the storage operation and persist adapter continuations observe the first result.
      await Promise.resolve();
      await Promise.resolve();
      expect(values.get(STORAGE_KEYS.progress)).toBe(firstValue);
      expect(tab.status.progressSaveStatus.local).toBe('pending');
    } finally {
      release();
    }
    await tab.flushActiveProgressWrites();
    expect(values.get(STORAGE_KEYS.progress)).toBe(latestValue);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
  });
  it('fences queued writes across a block/unblock and deliberate reset', async () => {
    const tab = await openTab();
    const original = envelope('owner', 10);
    values.set(STORAGE_KEYS.progress, original);
    const stale = tab.persistActiveProgressValue(envelope('owner', 20));
    tab.setActiveProgressWritesBlocked(true);
    tab.setActiveProgressWritesBlocked(false);
    expect(await stale).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
    const beforeReset = tab.persistActiveProgressValue(envelope('owner', 30));
    await tab.clearActiveProgressStorage('owner');
    expect(await beforeReset).toBe(false);
    expect(values.has(STORAGE_KEYS.progress)).toBe(false);
    expect(values.has('retained:owner')).toBe(false);
  });
  it('fences live account changes and A to B to A session transitions while waiting', async () => {
    const tab = await openTab();
    auth.owner = 'first';
    const staleOwner = tab.persistActiveProgressValue(envelope('first', 10));
    auth.owner = 'second';
    expect(await staleOwner).toBe(false);
    auth.owner = 'first';
    const staleSession = tab.persistActiveProgressValue(envelope('first', 20));
    auth.owner = 'second';
    tab.invalidateActiveProgressWrites();
    auth.owner = 'first';
    expect(await staleSession).toBe(false);
    expect(values.has(STORAGE_KEYS.progress)).toBe(false);
  });
  it("does not cancel another owner's queued edits when old-owner cleanup retries", async () => {
    const tab = await openTab();
    const removedWrite = tab.persistActiveProgressValue(envelope('removed', 10));
    const current = envelope('current', 20);
    const write = tab.persistActiveProgressValue(current);
    tab.invalidateActiveProgressWrites('removed');
    expect(await removedWrite).toBe(false);
    expect(await write).toBe(true);
    expect(values.get(STORAGE_KEYS.progress)).toBe(current);
  });
  it('does not mark canceled cloud-held writes or uploaded resets as unsaved', async () => {
    const tab = await openTab();
    const acknowledgement = tab.persistActiveProgressValue(envelope('owner', 10), true);
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
    tab.invalidateActiveProgressWrites();
    expect(await acknowledgement).toBe(false);
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
    const uploaded = tab.persistActiveProgressValue(envelope('owner', 20));
    tab.status.resetCloudSaveStatus();
    expect(tab.status.hasUnsavedProgressChanges()).toBe(true);
    tab.status.setCloudSaveStatus({
      state: 'saving',
      failure: null,
      retryAttempt: 0,
      nextRetryAt: null,
    });
    tab.status.setCloudSaveStatus({
      state: 'idle',
      failure: null,
      retryAttempt: 0,
      nextRetryAt: null,
    });
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
    tab.invalidateActiveProgressWrites();
    expect(await uploaded).toBe(false);
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
    const resetPatch = tab.persistActiveProgressValue(envelope('owner', 1));
    await tab.clearActiveProgressStorage('owner', true);
    expect(await resetPatch).toBe(false);
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
  });
  it('rechecks acknowledgements after another tab commits independently newer modes', async () => {
    const first = await openTab();
    const second = await openTab();
    const originalState = structuredClone(defaultState);
    const originalSerializer = first.createProgressStorageSerializer(() => null);
    const original = originalSerializer.serialize(originalState, 'owner', 100);
    expect(await first.persistActiveProgressValue(original)).toBe(true);
    const savedAt = first.status.progressSaveStatus.localSavedAt;
    const serializer = first.createProgressStorageSerializer(
      (owner) =>
        first.parsePersistedProgressState(values.get(STORAGE_KEYS.progress) ?? null, owner),
      (value, expected) => {
        void first.persistActiveProgressValue(value, true, expected);
      }
    );
    serializer.serialize(originalState, 'owner', 100);
    const otherState = structuredClone(originalState);
    otherState.pve.level = 42;
    const newer = originalSerializer.serialize(otherState, 'owner', 200);
    const write = second.persistActiveProgressValue(newer);
    serializer.acceptRemote({
      state: originalState,
      userId: 'owner',
      remote: originalState,
      next: originalState,
      updatedAtByMode: { pvp: 50, pve: 50, seasonal: 50 },
      metadataTimestamp: 50,
    });
    expect(await write).toBe(true);
    await first.flushActiveProgressWrites();
    const reloaded = first.parsePersistedProgressState(
      values.get(STORAGE_KEYS.progress)!,
      'owner'
    )!;
    expect(reloaded.state.pve.level).toBe(42);
    expect(reloaded.modeTimestamps).toEqual({ pvp: 100, pve: 200, seasonal: 100 });
    expect(reloaded.metadataTimestamp).toBe(100);
    expect(first.status.progressSaveStatus.local).toBe('saved');
    expect(first.status.progressSaveStatus.localFailure).toBeNull();
    expect(first.status.progressSaveStatus.localSavedAt).toBe(savedAt);
    expect(first.status.hasUnsavedProgressChanges()).toBe(false);
    expect(first.progressPersistStorage.getItem(STORAGE_KEYS.progress)).toBe(newer);
    expect(await first.removeActiveProgressValue('owner', original)).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(newer);
    expect(first.status.progressSaveStatus.local).toBe('saved');
  });
  it('persists the latest clocks from back-to-back serializer acknowledgements', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    const original = tab.progressStorageSerializer.serialize(state, 'owner', 100);
    expect(await tab.persistActiveProgressValue(original)).toBe(true);
    for (const clock of [50, 60]) {
      tab.progressStorageSerializer.acceptRemote({
        state,
        userId: 'owner',
        remote: state,
        next: state,
        updatedAtByMode: { pvp: clock, pve: clock, seasonal: clock },
        metadataTimestamp: clock,
      });
    }
    // Clock bookkeeping must not become a hydration/handoff or unsaved-edit overlay.
    expect(tab.progressPersistStorage.getItem(STORAGE_KEYS.progress)).toBe(original);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
    await tab.flushActiveProgressWrites();
    const reloaded = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress)!, 'owner')!;
    expect(reloaded.modeTimestamps).toEqual({ pvp: 60, pve: 60, seasonal: 60 });
    expect(reloaded.metadataTimestamp).toBe(60);
  });
  it.each(['unknown', 'failed'] as const)(
    'preserves prior %s local status when an acknowledgement loses its baseline',
    async (prior) => {
      const tab = await openTab();
      const original = envelope('owner', 10);
      values.set(STORAGE_KEYS.progress, original);
      const expected = tab.parsePersistedProgressState(original, 'owner')!;
      if (prior === 'failed') tab.status.recordLocalSave(false, 'quota');
      const savedAt = tab.status.progressSaveStatus.localSavedAt;
      const write = tab.persistActiveProgressValue(original, true, expected);
      values.set(STORAGE_KEYS.progress, envelope('owner', 30));
      expect(await write).toBe(false);
      expect(tab.status.progressSaveStatus.local).toBe(prior);
      expect(tab.status.progressSaveStatus.localFailure).toBe(prior === 'failed' ? 'quota' : null);
      expect(tab.status.progressSaveStatus.localSavedAt).toBe(savedAt);
      expect(tab.status.hasUnsavedProgressChanges()).toBe(prior === 'failed');
    }
  );
  it('keeps a genuine failed edit unsaved when an older acknowledgement succeeds', async () => {
    const tab = await openTab();
    const original = envelope('owner', 10);
    expect(await tab.persistActiveProgressValue(original)).toBe(true);
    const expected = tab.parsePersistedProgressState(original, 'owner')!;
    const edit = envelope('owner', 20);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (value === edit) throw new DOMException('full', 'QuotaExceededError');
      values.set(key, value);
    });
    const write = tab.persistActiveProgressValue(edit);
    const acknowledge = tab.persistActiveProgressValue(original, true, expected);
    expect(await write).toBe(false);
    expect(await acknowledge).toBe(true);
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
    expect(tab.status.progressSaveStatus.local).toBe('failed');
    expect(tab.status.progressSaveStatus.localFailure).toBe('quota');
    expect(tab.status.hasUnsavedProgressChanges()).toBe(true);
  });
  it('cancels an owner acknowledgement without changing the prior local save status', async () => {
    const tab = await openTab();
    const original = envelope('owner', 10);
    expect(await tab.persistActiveProgressValue(original)).toBe(true);
    const write = tab.persistActiveProgressValue(
      original,
      true,
      tab.parsePersistedProgressState(original, 'owner')
    );
    tab.invalidateActiveProgressWrites('owner');
    expect(await write).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
    expect(tab.status.progressSaveStatus.localFailure).toBeNull();
  });
  it('reports genuine storage failure for a conditional acknowledgement', async () => {
    const tab = await openTab();
    const original = envelope('owner', 10);
    expect(await tab.persistActiveProgressValue(original)).toBe(true);
    const expected = tab.parsePersistedProgressState(original, 'owner')!;
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(await tab.persistActiveProgressValue(original, true, expected)).toBe(false);
    expect(tab.status.progressSaveStatus.local).toBe('failed');
    expect(tab.status.progressSaveStatus.localFailure).toBe('quota');
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
  });
  it.each([false, true])(
    'keeps genuine queued edits and their result when an acknowledgement is superseded, fail=%s',
    async (fail) => {
      const tab = await openTab();
      const original = envelope('owner', 10);
      expect(await tab.persistActiveProgressValue(original)).toBe(true);
      const expected = tab.parsePersistedProgressState(original, 'owner')!;
      const edit = envelope('owner', 20);
      const write = tab.persistActiveProgressValue(edit);
      const acknowledge = tab.persistActiveProgressValue(envelope('owner', 10), true, expected);
      expect(tab.progressPersistStorage.getItem(STORAGE_KEYS.progress)).toBe(edit);
      expect(tab.status.progressSaveStatus.local).toBe('pending');
      expect(tab.status.hasUnsavedProgressChanges()).toBe(true);
      if (fail) {
        // Another tab has changed the baseline, while this tab's actual edit hits quota.
        values.set(STORAGE_KEYS.progress, envelope('owner', 30));
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw new DOMException('full', 'QuotaExceededError');
        });
      }
      expect(await write).toBe(!fail);
      expect(await acknowledge).toBe(false);
      expect(tab.status.progressSaveStatus.local).toBe(fail ? 'failed' : 'saved');
      expect(tab.status.progressSaveStatus.localFailure).toBe(fail ? 'quota' : null);
      expect(tab.status.hasUnsavedProgressChanges()).toBe(fail);
    }
  );
  it('reports unavailable locking without making an unlocked write', async () => {
    const tab = await openTab();
    const original = envelope('owner', 10);
    values.set(STORAGE_KEYS.progress, original);
    vi.stubGlobal('navigator', {});
    expect(await tab.persistActiveProgressValue(envelope('owner', 20))).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
    expect(tab.status.progressSaveStatus.local).toBe('failed');
    expect(tab.status.progressSaveStatus.localFailure).toBe('unavailable');
  });
  it('reports whether a reset clear left an active copy that a reload could restore', async () => {
    const tab = await openTab();
    const original = envelope('owner', 10);
    values.set(STORAGE_KEYS.progress, original);
    expect(await tab.clearActiveProgressStorage('owner')).toBe(true);
    expect(values.has(STORAGE_KEYS.progress)).toBe(false);
    values.set(STORAGE_KEYS.progress, original);
    const locking = navigator;
    vi.stubGlobal('navigator', {});
    expect(await tab.clearActiveProgressStorage('owner')).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
    vi.stubGlobal('navigator', locking);
    tab.setActiveProgressWritesBlocked(true);
    expect(await tab.clearActiveProgressStorage()).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
    // A write barrier refuses removal, but an empty slot leaves nothing to restore.
    values.delete(STORAGE_KEYS.progress);
    expect(await tab.clearActiveProgressStorage('owner')).toBe(true);
    tab.setActiveProgressWritesBlocked(false);
    // Blocked site data throws on access to `localStorage` itself and holds no copy to restore.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Site data is blocked', 'SecurityError');
      },
    });
    expect(await tab.clearActiveProgressStorage('owner')).toBe(true);
    expect(tab.safeRemoveItem(STORAGE_KEYS.preferences)).toBe(false);
  });
  it('prevents synchronous helpers from bypassing active progress serialization', async () => {
    const tab = await openTab();
    const original = envelope('owner', 10);
    values.set(STORAGE_KEYS.progress, original);
    expect(tab.safeSetItem(STORAGE_KEYS.progress, envelope('owner', 20))).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
    expect(tab.safeRemoveItem(STORAGE_KEYS.progress)).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
  });
  it('does not let a queued acknowledgement recreate progress another tab cleared', async () => {
    const first = await openTab();
    const second = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 42;
    const serializer = first.createProgressStorageSerializer(() => null);
    const original = serializer.serialize(state, 'owner', 100);
    const expected = first.parsePersistedProgressState(original, 'owner')!;
    values.set(STORAGE_KEYS.progress, original);
    const removal = second.clearActiveProgressStorage('owner');
    const acknowledgement = first.persistActiveProgressValue(original, true, expected);
    await removal;
    expect(await acknowledgement).toBe(false);
    expect(values.has(STORAGE_KEYS.progress)).toBe(false);
  });
});
