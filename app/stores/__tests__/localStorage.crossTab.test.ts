// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, type UserState } from '@/stores/progressState';
import { GAME_MODE_VALUES } from '@/utils/constants';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
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
const guestEnvelope = (
  state: UserState,
  modeTimestamps = { pvp: 100, pve: 100, seasonal: 100 },
  metadataTimestamp = 100
) =>
  JSON.stringify({
    _userId: null,
    _timestamp: Math.max(...Object.values(modeTimestamps)),
    _metadataTimestamp: metadataTimestamp,
    _modeTimestamps: modeTimestamps,
    data: state,
  });
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
  it('review regression: a stale PvP reset preserves saved PvE corrections and reload', async () => {
    const resetter = await openTab();
    const writer = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pve.level = 42;
    state.pve.skills.strength = 10;
    state.pve.traders.prapor = { level: 4, reputation: 1 };
    state.pve.prestigeLevel = 2;
    state.pve.displayName = 'Old';
    state.pve.xpOffset = 50;
    state.pve.taskCompletions.old = { complete: true, failed: true };
    state.pve.skillOffsets.strength = 3;
    state.seasonal.level = 33;
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    resetter.progressStorageSerializer.reset(resetter.parsePersistedProgressState(original, null));
    writer.progressStorageSerializer.reset(writer.parsePersistedProgressState(original, null));
    const correction = structuredClone(state);
    correction.pve.skills.strength = 3;
    correction.pve.traders.prapor = { level: 1, reputation: 0 };
    correction.pve.prestigeLevel = 1;
    correction.pve.displayName = null;
    correction.pve.xpOffset = 0;
    correction.pve.taskCompletions.old = { complete: false, failed: false };
    delete correction.pve.skillOffsets.strength;
    await writer.persistActiveProgressValue(
      writer.progressStorageSerializer.serialize(correction, null, 200)
    );
    const durable = writer.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    await resetter.resetGuestProgress(
      ['pvp'],
      false,
      () => state,
      (next) => Object.assign(state, next.state)
    );
    const reload = await openTab();
    const saved = reload.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pve).toEqual(durable.state.pve);
    expect(state.pve).toEqual(durable.state.pve);
    expect(saved.modeTimestamps?.pve).toBe(durable.modeTimestamps?.pve);
    expect(saved.state.pvp).toEqual({ ...defaultState.pvp, progressEpoch: 1 });
    expect(saved.state.seasonal).toEqual(durable.state.seasonal);
    expect(resetter.status.progressSaveStatus.local).toBe('saved');
  });
  it('review regression: a quota-failed correction survives a later unrelated save', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pvp.skills.strength = 10;
    state.pvp.displayName = 'Old';
    state.pvp.xpOffset = 50;
    state.pvp.taskCompletions.old = { complete: true, failed: true };
    state.pvp.skillOffsets.strength = 3;
    state.pve.level = 42;
    state.seasonal.level = 33;
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    state.pvp.level = 3;
    state.pvp.skills.strength = 3;
    state.pvp.displayName = null;
    state.pvp.xpOffset = 0;
    state.pvp.taskCompletions.old = { complete: false, failed: false };
    delete state.pvp.skillOffsets.strength;
    const failedIntent = structuredClone(state.pvp);
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Injected failure', 'QuotaExceededError');
    });
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      )
    ).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
    expect(state.pvp).toEqual(failedIntent);
    expect(tab.status.progressSaveStatus.local).toBe('failed');
    expect(tab.status.hasUnsavedProgressChanges()).toBe(true);
    state.pve.level = 55;
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 300)
      )
    ).toBe(true);
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp).toEqual(failedIntent);
    expect(state.pvp).toEqual(failedIntent);
    expect(saved.state.pve.level).toBe(55);
    expect(saved.state.seasonal.level).toBe(33);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
    expect(tab.status.progressSaveStatus.localFailure).toBeNull();
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
  });
  it.each(['{"data":{}}', JSON.stringify({ _userId: null, data: defaultState })])(
    'preserves unchanged raw guest envelope bytes %s',
    async (value) => {
      const tab = await openTab();
      expect(await tab.persistActiveProgressValue(value)).toBe(true);
      expect(values.get(STORAGE_KEYS.progress)).toBe(value);
      expect(await tab.persistActiveProgressValue(value)).toBe(true);
      expect(values.get(STORAGE_KEYS.progress)).toBe(value);
    }
  );
  it.each(['traderLevel', 'traderReputation', 'skillLevel', 'prestigeLevel'] as const)(
    'persists a captured guest %s decrease while preserving unrelated concurrent fields',
    async (kind) => {
      const tab = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.traders.prapor = { level: 4, reputation: 1 };
      state.pvp.skills.strength = 10;
      state.pvp.prestigeLevel = 2;
      const original = guestEnvelope(state);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      const concurrent = structuredClone(state);
      concurrent.pvp.xpOffset = 50;
      concurrent.pvp.skills.endurance = 9;
      concurrent.pve.level = 42;
      values.set(
        STORAGE_KEYS.progress,
        guestEnvelope(concurrent, { pvp: 150, pve: 150, seasonal: 100 })
      );
      if (kind === 'traderLevel') state.pvp.traders.prapor.level = 1;
      if (kind === 'traderReputation') state.pvp.traders.prapor.reputation = 0;
      if (kind === 'skillLevel') state.pvp.skills.strength = 3;
      if (kind === 'prestigeLevel') state.pvp.prestigeLevel = 0;
      const expected = { ...structuredClone(state.pvp), xpOffset: 50 };
      expected.skills.endurance = 9;
      expect(
        await tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 200)
        )
      ).toBe(true);
      const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
      expect(saved.state.pvp).toEqual(expected);
      expect(saved.state.pve.level).toBe(42);
      expect(saved.modeTimestamps).toEqual({ pvp: 200, pve: 150, seasonal: 100 });
      expect(tab.status.progressSaveStatus.local).toBe('saved');
    }
  );
  it.each(['queued', 'after commit'])(
    'orders captured first guest writes %s against their initial zero-clock baseline',
    async (timing) => {
      const first = await openTab();
      const second = await openTab();
      const stateA = structuredClone(defaultState);
      const stateB = structuredClone(defaultState);
      stateA.pvp.traders.prapor = { level: 4, reputation: 1 };
      stateA.pvp.skills.strength = 10;
      stateA.pve.level = 42;
      stateB.pvp.traders.prapor = { level: 1, reputation: 0 };
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      const writeA = first.persistActiveProgressValue(
        first.progressStorageSerializer.serialize(stateA, null, 100)
      );
      if (timing === 'after commit') {
        release();
        await writeA;
      }
      const writeB = second.persistActiveProgressValue(
        second.progressStorageSerializer.serialize(stateB, null, 200)
      );
      release();
      expect(await Promise.all([writeA, writeB])).toEqual([true, true]);
      const saved = second.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
      expect(saved.state.pvp.traders.prapor).toEqual({ level: 1, reputation: 0 });
      expect(saved.state.pvp.skills.strength).toBe(10);
      expect(saved.state.pve.level).toBe(42);
      expect(saved.modeTimestamps).toEqual({ pvp: 200, pve: 100, seasonal: 0 });
      expect(saved.metadataTimestamp).toBe(0);
      expect(second.status.progressSaveStatus.local).toBe('saved');
    }
  );
  it('does not infer captured first guest intent from a concurrently changed shared slot', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.traders.prapor = { level: 1, reputation: 0 };
    const concurrent = structuredClone(defaultState);
    concurrent.pvp.skills.strength = 10;
    values.set(
      STORAGE_KEYS.progress,
      guestEnvelope(concurrent, { pvp: 150, pve: 0, seasonal: 0 }, 0)
    );
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      )
    ).toBe(true);
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp.traders.prapor).toEqual({ level: 1, reputation: 0 });
    expect(saved.state.pvp.skills.strength).toBe(10);
    expect(saved.modeTimestamps).toEqual({ pvp: 200, pve: 0, seasonal: 0 });
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
  it('rebases captured same-epoch corrections beyond a newer durable clock before reporting saved', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.traders.prapor = { level: 4, reputation: 1 };
    state.gameEdition = 4;
    const original = guestEnvelope(state);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    const concurrent = structuredClone(state);
    concurrent.pvp.skills.endurance = 9;
    concurrent.tarkovUid = 123;
    values.set(
      STORAGE_KEYS.progress,
      guestEnvelope(concurrent, { pvp: 10_000, pve: 100, seasonal: 100 }, 10_000)
    );
    state.pvp.traders.prapor.level = 1;
    state.gameEdition = 1;
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 500)
      )
    ).toBe(true);
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp.traders.prapor?.level).toBe(1);
    expect(saved.state.pvp.skills.endurance).toBe(9);
    expect(saved.state.gameEdition).toBe(1);
    expect(saved.state.tarkovUid).toBe(123);
    expect(saved.modeTimestamps).toEqual({ pvp: 10_001, pve: 100, seasonal: 100 });
    expect(saved.metadataTimestamp).toBe(10_001);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
  it('persists captured guest false, deletion and history removal without replacing concurrent entries', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.taskCompletions.old = { complete: true, failed: true, timestamp: 100 };
    state.pvp.taskCompletions.removed = { complete: true, timestamp: 100 };
    state.pvp.skills.strength = 10;
    state.pvp.manualActivityHistory = [
      { id: 'old', timestamp: 100, type: 'task', action: 'complete', title: 'Old' },
    ];
    const original = guestEnvelope(state);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    const concurrent = structuredClone(state);
    concurrent.pvp.taskCompletions.remote = { complete: true, timestamp: 150 };
    concurrent.pvp.manualActivityHistory!.push({
      id: 'remote',
      timestamp: 150,
      type: 'task',
      action: 'complete',
      title: 'Remote',
    });
    values.set(
      STORAGE_KEYS.progress,
      guestEnvelope(concurrent, { pvp: 150, pve: 100, seasonal: 100 })
    );
    state.pvp.taskCompletions.old = { complete: false, failed: false, timestamp: 200 };
    delete state.pvp.taskCompletions.removed;
    delete state.pvp.skills.strength;
    state.pvp.manualActivityHistory = [];
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      )
    ).toBe(true);
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp.taskCompletions).toEqual({
      old: { complete: false, failed: false, timestamp: 200 },
      remote: { complete: true, timestamp: 150 },
    });
    expect(saved.state.pvp.skills).toEqual({});
    expect(saved.state.pvp.manualActivityHistory?.map((row) => row.id)).toEqual(['remote']);
    expect(saved.modeTimestamps).toEqual({ pvp: 200, pve: 100, seasonal: 100 });
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
  it('review regression: repeated failures stay bounded and preserve concurrent corrections', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pve.skills.strength = 10;
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    const fail = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Injected failure', 'QuotaExceededError');
    });
    for (const level of [3, 4, 5]) {
      state.pvp.level = level;
      expect(
        await tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 200)
        )
      ).toBe(false);
      expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(1);
      expect(tab.status.hasUnsavedProgressChanges()).toBe(true);
    }
    fail.mockRestore();
    const concurrent = structuredClone(defaultState);
    concurrent.pvp.level = 20;
    concurrent.pve.skills.strength = 3;
    values.set(
      STORAGE_KEYS.progress,
      guestEnvelope(concurrent, { pvp: 100, pve: 500, seasonal: 100 })
    );
    state.pve.level = 55;
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 600)
      )
    ).toBe(true);
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp.level).toBe(5);
    expect(saved.state.pve.skills.strength).toBe(3);
    expect(saved.state.pve.level).toBe(55);
    expect(state).toEqual(saved.state);
    expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(0);
    expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
  });
  it('review regression: a queued failure preserves queued undo and live edits', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Injected failure', 'QuotaExceededError');
    });
    state.pvp.level = 3;
    const first = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 200)
    );
    state.pvp.level = 20;
    state.pve.level = 55;
    const second = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 300)
    );
    state.pvp.displayName = 'Live';
    release();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    await tab.flushActiveProgressWrites();
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp.level).toBe(20);
    expect(saved.state.pvp.displayName).toBe('Live');
    expect(saved.state.pve.level).toBe(55);
    expect(saved.state).toEqual(state);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
  it.each(['pvp', 'pve', 'all', 'failure', 'newer epoch'] as const)(
    'review regression: %s reset handles retained failed intent',
    async (mode) => {
      const tab = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.level = 20;
      state.pve.level = 42;
      state.seasonal.level = 33;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      const fail = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Injected failure', 'QuotaExceededError');
      });
      state.pvp.level = 3;
      state.pve.level = 5;
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      );
      if (mode === 'failure') {
        await expect(
          tab.resetGuestProgress(
            ['pve'],
            false,
            () => state,
            (next) => Object.assign(state, next.state)
          )
        ).rejects.toThrow('could not be saved');
        expect(state.pvp.level).toBe(3);
        expect(values.get(STORAGE_KEYS.progress)).toBe(original);
        expect(tab.status.hasUnsavedProgressChanges()).toBe(true);
      }
      fail.mockRestore();
      if (mode === 'newer epoch') {
        const newer = structuredClone(state);
        newer.pvp = { ...structuredClone(defaultState.pvp), progressEpoch: 1 };
        values.set(
          STORAGE_KEYS.progress,
          guestEnvelope(newer, { pvp: 500, pve: 100, seasonal: 100 })
        );
      }
      if (mode === 'failure' || mode === 'newer epoch') {
        state.pve.level = 55;
        await tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 600)
        );
      } else {
        const modes = mode === 'all' ? GAME_MODE_VALUES : [mode];
        await tab.resetGuestProgress(
          modes,
          mode === 'all',
          () => state,
          (next) => Object.assign(state, next.state)
        );
      }
      const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
      expect(saved.state.pvp.level).toBe(['pvp', 'all', 'newer epoch'].includes(mode) ? 1 : 3);
      expect(saved.state.pve.level).toBe(
        ['pve', 'all'].includes(mode) ? 1 : mode === 'pvp' ? 5 : 55
      );
      expect(saved.state.seasonal.level).toBe(mode === 'all' ? 1 : 33);
      expect(saved.state).toEqual(state);
      expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
    }
  );
  it.each([1, 2])(
    'review regression: %s failures plus failed reset preserve concurrent corrections',
    async (failures) => {
      const tab = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.level = 20;
      state.pve.skills.strength = 10;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      const concurrent = structuredClone(state);
      concurrent.pve.skills = { strength: 3, endurance: 7 };
      values.set(
        STORAGE_KEYS.progress,
        guestEnvelope(concurrent, { pvp: 100, pve: 500, seasonal: 100 })
      );
      const fail = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Injected failure', 'QuotaExceededError');
      });
      for (let attempt = 0; attempt < failures; attempt++) {
        state.pvp.level = 3 + attempt;
        expect(
          await tab.persistActiveProgressValue(
            tab.progressStorageSerializer.serialize(state, null, 600 + attempt)
          )
        ).toBe(false);
      }
      await expect(
        tab.resetGuestProgress(
          ['pvp'],
          false,
          () => state,
          (next) => Object.assign(state, next.state)
        )
      ).rejects.toThrow('could not be saved');
      expect(state.pve.skills).toEqual({ strength: 10 });
      expect(tab.status.hasUnsavedProgressChanges()).toBe(true);
      fail.mockRestore();
      state.seasonal.level = 55;
      expect(
        await tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 700)
        )
      ).toBe(true);
      const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
      expect(saved.state.pve.skills).toEqual({ strength: 3, endurance: 7 });
      expect(state.pve.skills).toEqual({ strength: 3, endurance: 7 });
      expect(saved.state.pvp.level).toBe(2 + failures);
      expect(saved.state.seasonal.level).toBe(55);
      expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
    }
  );
  it.each([
    [true, true],
    [false, true],
    [true, false],
  ])(
    'review regression: rebased queued failure=%s and reset failure=%s preserve later corrections',
    async (failQueued, failReset) => {
      const tab = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.level = 20;
      state.pve.skills.strength = 10;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      const concurrent = structuredClone(state);
      concurrent.pve.skills = { strength: 3, endurance: 7 };
      values.set(STORAGE_KEYS.progress, guestEnvelope(concurrent));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      state.pvp.level = 3;
      const first = tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      );
      state.pvp.level = 4;
      const second = tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 300)
      );
      const write = vi.spyOn(localStorage, 'setItem');
      if (failQueued) {
        write.mockImplementationOnce((key, value) => {
          values.set(key, value);
        });
        write.mockImplementation(() => {
          throw new DOMException('Injected failure', 'QuotaExceededError');
        });
      }
      release();
      expect(await first).toBe(true);
      expect(await second).toBe(!failQueued);
      expect(state.pve.skills).toEqual({ strength: 3, endurance: 7 });
      expect(tab.status.progressSaveStatus.local).toBe(failQueued ? 'failed' : 'saved');
      expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(failQueued ? 1 : 0);
      const newer = structuredClone(state);
      newer.pvp.level = 3;
      newer.pve.skills = { strength: 1, endurance: 9 };
      values.set(
        STORAGE_KEYS.progress,
        guestEnvelope(newer, { pvp: 200, pve: 500, seasonal: 100 })
      );
      if (failReset)
        write.mockImplementation(() => {
          throw new DOMException('Injected failure', 'QuotaExceededError');
        });
      else write.mockRestore();
      const reset = tab.resetGuestProgress(
        ['pvp'],
        false,
        () => state,
        (next) => Object.assign(state, next.state)
      );
      if (failReset) {
        await expect(reset).rejects.toThrow('could not be saved');
        expect(tab.status.progressSaveStatus.local).toBe('failed');
        expect(state.pve.skills).toEqual({ strength: 3, endurance: 7 });
        write.mockRestore();
      } else await reset;
      state.seasonal.level = 55;
      expect(
        await tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 600)
        )
      ).toBe(true);
      const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
      expect(saved.state.pve.skills).toEqual({ strength: 1, endurance: 9 });
      expect(saved.state.pvp.level).toBe(failReset ? (failQueued ? 4 : 3) : 1);
      expect(saved.state.seasonal.level).toBe(55);
      expect(saved.modeTimestamps?.pve).toBe(500);
      expect(saved.metadataTimestamp).toBe(100);
      expect(state).toEqual(saved.state);
      expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(0);
      expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
    }
  );
  it('review regression: adoption then compacted queued failures preserves undo, removals and live intent', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pvp.taskCompletions.old = { complete: true, failed: true };
    state.pvp.skills.strength = 10;
    state.pve.skills.strength = 10;
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    const concurrent = structuredClone(state);
    concurrent.pve.skills = { strength: 3, endurance: 7 };
    values.set(STORAGE_KEYS.progress, guestEnvelope(concurrent));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    state.pvp.level = 3;
    const first = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 200)
    );
    state.pvp.level = 4;
    const second = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 300)
    );
    state.pvp.level = 3;
    state.pvp.taskCompletions.old = { complete: false, failed: false };
    delete state.pvp.skills.strength;
    state.pvp.xpOffset = 0;
    const third = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 400)
    );
    state.pvp.displayName = 'Live';
    const write = vi.spyOn(localStorage, 'setItem');
    write.mockImplementationOnce((key, value) => {
      values.set(key, value);
    });
    write.mockImplementation(() => {
      throw new DOMException('Injected failure', 'QuotaExceededError');
    });
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(await third).toBe(false);
    await tab.flushActiveProgressWrites();
    expect(state.pve.skills).toEqual({ strength: 3, endurance: 7 });
    expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(1);
    const newer = structuredClone(concurrent);
    newer.pvp.level = 3;
    newer.pve.skills = { strength: 1, endurance: 9 };
    values.set(STORAGE_KEYS.progress, guestEnvelope(newer, { pvp: 200, pve: 500, seasonal: 100 }));
    await expect(
      tab.resetGuestProgress(
        ['pvp'],
        false,
        () => state,
        (next) => Object.assign(state, next.state)
      )
    ).rejects.toThrow('could not be saved');
    write.mockRestore();
    state.seasonal.level = 55;
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 600)
      )
    ).toBe(true);
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pve.skills).toEqual({ strength: 1, endurance: 9 });
    expect(saved.modeTimestamps?.pve).toBe(500);
    expect(saved.state.pvp.level).toBe(3);
    expect(saved.state.pvp.taskCompletions.old).toEqual({ complete: false, failed: false });
    expect(saved.state.pvp.skills).toEqual({});
    expect(saved.state.pvp.xpOffset).toBe(0);
    expect(saved.state.pvp.displayName).toBe('Live');
    expect(saved.state).toEqual(state);
    expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(0);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
  it.each([true, false])(
    'review regression: successful reset accounts for edits queued during its wait=%s',
    async (during) => {
      const tab = await openTab();
      const writer = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.level = 20;
      state.pve.level = 42;
      state.pve.skills.strength = 10;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      writer.progressStorageSerializer.reset(writer.parsePersistedProgressState(original, null));
      const other = structuredClone(state);
      other.pve.skills.strength = 3;
      await writer.persistActiveProgressValue(
        writer.progressStorageSerializer.serialize(other, null, 200)
      );
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      const reset = tab.resetGuestProgress(
        ['pvp'],
        false,
        () => state,
        (next) => {
          tab.progressStorageSerializer.reset(next);
          Object.assign(state, next.state);
        }
      );
      other.pve.skills.strength = 1;
      const correction = writer.persistActiveProgressValue(
        writer.progressStorageSerializer.serialize(other, null, 300)
      );
      let edit: Promise<boolean> | undefined;
      if (during) {
        state.pve.level = 55;
        edit = tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 400)
        );
      }
      release();
      await reset;
      expect(await correction).toBe(true);
      const corrected = writer.parsePersistedProgressState(
        values.get(STORAGE_KEYS.progress),
        null
      )!;
      if (!during) {
        state.pve.level = 55;
        edit = tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 400)
        );
      }
      await edit;
      await tab.flushActiveProgressWrites();
      const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
      expect(saved.state.pve.skills.strength).toBe(1);
      expect(state.pve.skills.strength).toBe(1);
      expect(saved.state.pve.level).toBe(55);
      expect(saved.state.pvp.progressEpoch).toBe(1);
      if (during) expect(saved.modeTimestamps?.pve).toBe(corrected.modeTimestamps?.pve);
      expect(tab.status.progressSaveStatus.local).toBe('saved');
      expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(0);
    }
  );
  it('review regression: failed reset keeps earlier failed intent for writes queued during its wait', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pve.level = 42;
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    const failure = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Injected failure', 'QuotaExceededError');
    });
    state.pvp.level = 3;
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      )
    ).toBe(false);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    failure.mockImplementationOnce(() => {
      throw new DOMException('Injected reset failure', 'QuotaExceededError');
    });
    const reset = tab.resetGuestProgress(
      ['pve'],
      false,
      () => state,
      (next) => Object.assign(state, next.state)
    );
    state.pve.level = 55;
    const edit = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 300)
    );
    release();
    await expect(reset).rejects.toThrow('could not be saved');
    expect(await edit).toBe(true);
    await tab.flushActiveProgressWrites();
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp.level).toBe(3);
    expect(state.pvp.level).toBe(3);
    expect(saved.state.pve.level).toBe(55);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
  it.each([
    'canceled',
    'successful',
    'successor',
    'pending successor',
    'failed successor',
    'dirty cancel',
    'dirty successor',
    'dirty pending successor',
    'dirty failed successor',
    'dirty live',
  ] as const)(
    'review regression: reset status settles without replacing real intent: %s',
    async (kind) => {
      const tab = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.level = 20;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      if (kind.startsWith('dirty')) {
        vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
          throw new DOMException('Injected failure', 'QuotaExceededError');
        });
        state.pvp.level = 3;
        await tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 200)
        );
      }
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      const reset = tab.resetGuestProgress(
        ['pvp'],
        false,
        () => state,
        (next) => Object.assign(state, next.state)
      );
      if (kind !== 'successful') tab.invalidateActiveProgressWrites();
      let releaseSuccessor: (() => void) | undefined;
      if (kind.endsWith('pending successor')) {
        const successorGate = new Promise<void>((resolve) => {
          releaseSuccessor = resolve;
        });
        void navigator.locks.request('successor held', { mode: 'exclusive' }, () => successorGate);
      }
      let successor: Promise<boolean> | undefined;
      if (kind.includes('successor')) {
        state.pve.level = 55;
        if (kind.endsWith('failed successor'))
          vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
            throw new DOMException('Injected failure', 'QuotaExceededError');
          });
        successor = tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 300)
        );
      }
      if (kind === 'dirty live') state.pve.level = 55;
      release();
      if (kind === 'successful') await reset;
      else await expect(reset).rejects.toThrow('could not be saved');
      if (releaseSuccessor) {
        expect(tab.status.progressSaveStatus.local).toBe('pending');
        expect(tab.status.hasUnsavedProgressChanges()).toBe(true);
        releaseSuccessor();
      }
      if (successor) expect(await successor).toBe(!kind.endsWith('failed successor'));
      await tab.flushActiveProgressWrites();
      expect(tab.status.progressSaveStatus.local).toBe(
        kind === 'successful' || (kind.includes('successor') && !kind.endsWith('failed successor'))
          ? 'saved'
          : 'failed'
      );
      expect(tab.status.hasUnsavedProgressChanges()).toBe(
        ['dirty cancel', 'dirty live'].includes(kind) || kind.endsWith('failed successor')
      );
      expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(
        ['dirty cancel', 'dirty live'].includes(kind) || kind.endsWith('failed successor') ? 1 : 0
      );
      if (kind.startsWith('dirty')) {
        if (!successor || kind.endsWith('failed successor')) {
          state.seasonal.level = 55;
          await tab.persistActiveProgressValue(
            tab.progressStorageSerializer.serialize(state, null, 400)
          );
        }
        expect(
          tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)?.state.pvp.level
        ).toBe(3);
        if (kind !== 'dirty cancel')
          expect(
            tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)?.state.pve
              .level
          ).toBe(55);
      }
    }
  );
  it.each([false, true])(
    'review regression: reset refuses a different source arriving during its wait=%s',
    async (during) => {
      const tab = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.level = 20;
      const other = structuredClone(state);
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      let reset: Promise<unknown> | undefined;
      if (during)
        reset = tab.resetGuestProgress(
          ['pvp'],
          false,
          () => state,
          (next) => Object.assign(state, next.state)
        );
      other.pve.level = 55;
      const edit = tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(other, null, 200)
      );
      if (!during)
        reset = tab.resetGuestProgress(
          ['pvp'],
          false,
          () => state,
          (next) => Object.assign(state, next.state)
        );
      const rejected = expect(reset).rejects.toThrow(
        during ? 'could not be saved' : 'another progress source'
      );
      release();
      await rejected;
      expect(await edit).toBe(true);
      expect(state.pvp.level).toBe(20);
      expect(other.pve.level).toBe(55);
      expect(tab.status.progressSaveStatus.local).toBe('saved');
    }
  );
  it.each(['dirty', 'clean', 'queued', 'undo', 'double undo', 'live', 'failed last'] as const)(
    'review regression: retained intent survives reset successors: %s',
    async (kind) => {
      const tab = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.level = 20;
      state.pve.level = 42;
      state.seasonal.level = 33;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      if (!['clean', 'queued'].includes(kind)) {
        vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
          throw new DOMException('Injected failure', 'QuotaExceededError');
        });
        state.pvp.level = 3;
        await tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 200)
        );
      }
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      let edit: Promise<boolean> | undefined;
      if (kind === 'queued') {
        state.pvp.level = 3;
        edit = tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 200)
        );
      }
      if (kind === 'undo' || kind === 'double undo') {
        const other = structuredClone(state);
        other.pvp.level = 5;
        values.set(STORAGE_KEYS.progress, guestEnvelope(other));
        state.pvp.level = 20;
      }
      const resets: Promise<boolean>[] = [];
      const count = kind === 'dirty' || kind === 'undo' ? 5 : 2;
      for (let index = 0; index < count; index++) {
        if (kind === 'double undo' && index === 1) state.pvp.level = 3;
        if (kind === 'live' && index === 1) state.seasonal.level = 55;
        resets.push(
          tab
            .resetGuestProgress(
              [index === count - 1 ? 'pve' : 'seasonal'],
              false,
              () => state,
              (next) => Object.assign(state, next.state)
            )
            .then(
              () => true,
              () => false
            )
        );
      }
      const heldPrefixCount = tab.getPendingProgressWritesForOwners([null]).length;
      if (kind === 'failed last')
        vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
          throw new DOMException('Injected failure', 'QuotaExceededError');
        });
      release();
      const outcomes = await Promise.all(resets);
      if (kind === 'undo') expect(heldPrefixCount).toBe(2);
      expect(outcomes.slice(0, -1)).toEqual(Array(count - 1).fill(false));
      expect(outcomes.at(-1)).toBe(kind !== 'failed last');
      if (edit) expect(await edit).toBe(false);
      if (kind === 'failed last') {
        state.seasonal.level = 55;
        await tab.persistActiveProgressValue(
          tab.progressStorageSerializer.serialize(state, null, 300)
        );
      }
      await tab.flushActiveProgressWrites();
      const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
      const level = ['clean', 'undo'].includes(kind) ? 20 : 3;
      expect(saved.state.pvp.level).toBe(level);
      expect(state.pvp.level).toBe(level);
      expect(saved.state.pve.level).toBe(kind === 'failed last' ? 42 : 1);
      expect(saved.state.seasonal.level).toBe(['live', 'failed last'].includes(kind) ? 55 : 33);
      expect(tab.status.progressSaveStatus.local).toBe('saved');
      expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
      expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(0);
    }
  );
  it.each(['cancel', 'read failure'] as const)(
    'review regression: ordinary intent survives %s before a successor',
    async (kind) => {
      const tab = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.level = 20;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      state.pvp.level = 3;
      const first = tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      );
      if (kind === 'cancel') tab.invalidateActiveProgressWrites();
      state.pve.level = 55;
      const second = tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 300)
      );
      if (kind === 'read failure')
        vi.spyOn(localStorage, 'getItem').mockImplementationOnce(() => {
          throw new DOMException('Injected read failure', 'SecurityError');
        });
      release();
      expect(await first).toBe(false);
      expect(await second).toBe(true);
      await tab.flushActiveProgressWrites();
      const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
      expect(saved.state.pvp.level).toBe(3);
      expect(saved.state.pve.level).toBe(55);
      expect(tab.status.progressSaveStatus.local).toBe('saved');
      expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(0);
    }
  );
  it('review regression: a refused raw owned envelope cannot discard guest intent', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Injected failure', 'QuotaExceededError');
    });
    state.pvp.level = 3;
    await tab.persistActiveProgressValue(tab.progressStorageSerializer.serialize(state, null, 200));
    tab.setActiveProgressRetentionGuard(() => false);
    expect(await tab.persistActiveProgressValue(envelope('foreign-owner', 42))).toBe(false);
    expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(1);
    tab.setActiveProgressRetentionGuard(retain);
    state.pve.level = 55;
    await tab.persistActiveProgressValue(tab.progressStorageSerializer.serialize(state, null, 300));
    expect(
      tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)?.state.pvp.level
    ).toBe(3);
  });
  it('review regression: a completed clear cannot consume a newer failed intent after release', async () => {
    const tab = await openTab();
    values.set(STORAGE_KEYS.progress, guestEnvelope(structuredClone(defaultState)));
    let finishClear!: () => void;
    const cleared = new Promise<void>((resolve) => {
      finishClear = resolve;
    });
    const request = vi.mocked(navigator.locks.request).getMockImplementation()!;
    vi.spyOn(navigator.locks, 'request').mockImplementationOnce((_name, _options, callback) => {
      const result = callback({ name: 'tarkov-progress', mode: 'exclusive' });
      return cleared.then(() => result);
    });
    const clear = tab.clearActiveProgressStorage();
    vi.mocked(navigator.locks.request).mockImplementation(request);
    const state = structuredClone(defaultState);
    state.pvp.level = 3;
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Injected failure', 'QuotaExceededError');
    });
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      )
    ).toBe(false);
    expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(1);
    finishClear();
    expect(await clear).toBe(true);
    expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(1);
    state.pve.level = 55;
    expect(
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 300)
      )
    ).toBe(true);
    expect(
      tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)?.state.pvp.level
    ).toBe(3);
  });
  it.each(['owner', 'source'] as const)(
    'review regression: dirty canceled reset cannot borrow a replacement %s baseline',
    async (replacement) => {
      const tab = await openTab();
      let state = structuredClone(defaultState);
      state.pvp.level = 20;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
        throw new DOMException('Injected failure', 'QuotaExceededError');
      });
      state.pvp.level = 3;
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      );
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      const reset = tab.resetGuestProgress(
        ['pve'],
        false,
        () => state,
        (next) => Object.assign(state, next.state)
      );
      tab.invalidateActiveProgressWrites();
      state = structuredClone(defaultState);
      state.pvp.level = 42;
      if (replacement === 'owner') auth.owner = 'next-owner';
      const nextOwner = auth.owner;
      const next = JSON.stringify({ ...JSON.parse(guestEnvelope(state)), _userId: nextOwner });
      values.set(STORAGE_KEYS.progress, next);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(next, nextOwner));
      state.pve.level = 55;
      const edit = tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, nextOwner, 300)
      );
      release();
      await expect(reset).rejects.toThrow('could not be saved');
      expect(await edit).toBe(true);
      const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), nextOwner)!;
      expect(saved.state.pvp.level).toBe(42);
      expect(saved.state.pve.level).toBe(55);
      expect(state.pvp.level).toBe(42);
    }
  );
  it('review regression: failed reset continuation cannot rewind a newer adopted baseline', async () => {
    const tab = await openTab();
    const writer = await openTab();
    const state = structuredClone(defaultState);
    state.pve.skills.strength = 10;
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    writer.progressStorageSerializer.reset(writer.parsePersistedProgressState(original, null));
    const other = structuredClone(state);
    other.pve.skills.strength = 3;
    await writer.persistActiveProgressValue(
      writer.progressStorageSerializer.serialize(other, null, 200)
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Injected failure', 'QuotaExceededError');
    });
    const reset = tab.resetGuestProgress(
      ['pvp'],
      false,
      () => state,
      (next) => Object.assign(state, next.state)
    );
    state.pve.level = 55;
    const edit = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 300)
    );
    release();
    await expect(reset).rejects.toThrow('could not be saved');
    expect(await edit).toBe(true);
    other.pve.skills.strength = 1;
    await writer.persistActiveProgressValue(
      writer.progressStorageSerializer.serialize(other, null, 400)
    );
    state.seasonal.level = 55;
    await tab.persistActiveProgressValue(tab.progressStorageSerializer.serialize(state, null, 500));
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pve.skills.strength).toBe(1);
    expect(state.pve.skills.strength).toBe(1);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
  it('review regression: reset adoption preserves queued undo, removal, live intent and newer epochs', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pve.skills.strength = 10;
    state.pve.taskCompletions.old = { complete: true, failed: true };
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    const failure = vi.spyOn(localStorage, 'setItem');
    for (const level of [3, 4]) {
      failure.mockImplementationOnce(() => {
        throw new DOMException('Injected failure', 'QuotaExceededError');
      });
      state.pvp.level = level;
      await tab.persistActiveProgressValue(
        tab.progressStorageSerializer.serialize(state, null, 200)
      );
    }
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    const reset = tab.resetGuestProgress(
      ['pvp'],
      false,
      () => state,
      (next) => Object.assign(state, next.state)
    );
    delete state.pve.skills.strength;
    const first = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 300)
    );
    state.pve.skills.strength = 10;
    state.pve.taskCompletions.old = { complete: false, failed: false };
    const second = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 400)
    );
    state.pve.displayName = 'Live';
    const newer = structuredClone(defaultState);
    newer.pvp.progressEpoch = 7;
    newer.pve.skills.strength = 3;
    values.set(STORAGE_KEYS.progress, guestEnvelope(newer, { pvp: 500, pve: 500, seasonal: 100 }));
    release();
    await reset;
    await Promise.all([first, second]);
    await tab.flushActiveProgressWrites();
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp).toEqual({ ...defaultState.pvp, progressEpoch: 8 });
    expect(saved.state.pve.skills.strength).toBe(10);
    expect(saved.state.pve.taskCompletions.old).toEqual({ complete: false, failed: false });
    expect(saved.state.pve.displayName).toBe('Live');
    expect(saved.state).toEqual(state);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
    expect(tab.getPendingProgressWritesForOwners([null])).toHaveLength(0);
  });
  it('adopts a guest reset from another tab before saving a subsequent legitimate edit', async () => {
    const first = await openTab();
    const second = await openTab();
    const stateA = structuredClone(defaultState);
    stateA.pvp.level = 20;
    const stateB = structuredClone(stateA);
    const original = guestEnvelope(stateA);
    values.set(STORAGE_KEYS.progress, original);
    first.progressStorageSerializer.reset(first.parsePersistedProgressState(original, null));
    second.progressStorageSerializer.reset(second.parsePersistedProgressState(original, null));
    await first.resetGuestProgress(
      ['pvp'],
      false,
      () => stateA,
      (accepted) => Object.assign(stateA, accepted.state)
    );
    stateB.pve.level = 2;
    await second.persistActiveProgressValue(
      second.progressStorageSerializer.serialize(stateB, null, Date.now() + 10)
    );
    expect(stateB.pvp).toEqual({ ...defaultState.pvp, progressEpoch: 1 });
    stateB.pvp.level = 2;
    await second.persistActiveProgressValue(
      second.progressStorageSerializer.serialize(stateB, null, Date.now() + 20)
    );
    expect(
      second.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)?.state.pvp.level
    ).toBe(2);
    expect(second.status.progressSaveStatus.local).toBe('saved');
  });
  it.each([
    [3, 5],
    [5, 3],
  ])('keeps same-clock guest scalar edits %s then %s ordered', async (first, second) => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    const original = guestEnvelope(state, { pvp: 900, pve: 900, seasonal: 900 }, 900);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    state.pvp.level = first!;
    await tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 1000)
    );
    state.pvp.level = second!;
    await tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 1000)
    );
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp.level).toBe(second);
    expect(saved.modeTimestamps).toEqual({ pvp: 1001, pve: 900, seasonal: 900 });
    expect(saved.metadataTimestamp).toBe(900);
  });
  it('advances changed guest clocks beyond future baseline clocks without making raw equal ties authoritative', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    const original = guestEnvelope(state, { pvp: 10_000, pve: 10_000, seasonal: 10_000 }, 10_000);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    state.pvp.level = 3;
    state.gameEdition = 4;
    const captured = tab.progressStorageSerializer.serialize(state, null, 1000);
    // Auth handoffs can transfer queued bytes before ordinary guest reconciliation runs.
    const queued = tab.parsePersistedProgressState(captured, null)!;
    expect(queued.modeTimestamps).toEqual({ pvp: 10_001, pve: 10_000, seasonal: 10_000 });
    expect(queued.metadataTimestamp).toBe(10_001);
    await tab.persistActiveProgressValue(captured);
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.modeTimestamps).toEqual({ pvp: 10_001, pve: 10_000, seasonal: 10_000 });
    expect(saved.metadataTimestamp).toBe(10_001);
    const stale = structuredClone(state);
    stale.pvp.level = 5;
    stale.gameEdition = 1;
    const adopt = vi.fn();
    await tab.persistActiveProgressValue(
      guestEnvelope(stale, { pvp: 10_001, pve: 10_000, seasonal: 10_000 }, 10_001),
      false,
      undefined,
      undefined,
      { key: state, readState: () => state, acceptState: adopt }
    );
    expect(adopt).not.toHaveBeenCalled();
    expect(
      tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)?.state.pvp.level
    ).toBe(3);
    expect(
      tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)?.state.gameEdition
    ).toBe(4);
  });
  it('keeps guest intent clocks separate from the prior owner baseline needed for auth handoff', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    const acceptedGuest = guestEnvelope(state);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(acceptedGuest, null));
    const prior = envelope('prior-owner', 20);
    values.set(STORAGE_KEYS.progress, prior);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    state.pve.level = 2;
    const write = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 300)
    );
    const pending = tab.getPendingProgressWritesForOwners([null]);
    try {
      expect(pending[0]?.baseline?.storedUserId).toBe('prior-owner');
      expect(pending[0]?.guestBaseline?.storedUserId).toBeNull();
      expect(pending[0]?.guestBaseline?.state.pve.level).toBe(1);
    } finally {
      release();
    }
    expect(await write).toBe(true);
    expect(values.get('retained:prior-owner')).toBe(prior);
    expect(
      tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)?.state.pve.level
    ).toBe(2);
    expect(pending[0]?.source).toBeUndefined();
  });
  it('releases captured guest source bindings when queued writes expire with their session', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    state.pvp.level = 20;
    const readState = vi.fn(() => state);
    const acceptState = vi.fn();
    const write = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 300),
      false,
      undefined,
      undefined,
      { key: state, readState, acceptState }
    );
    const pending = tab.getPendingProgressWritesForOwners([null]);
    expect(pending[0]?.source).toBeDefined();
    auth.owner = 'new-owner';
    tab.invalidateActiveProgressWrites();
    try {
      expect(pending[0]?.source).toBeUndefined();
    } finally {
      release();
    }
    expect(await write).toBe(false);
    expect(readState).not.toHaveBeenCalled();
    expect(acceptState).not.toHaveBeenCalled();
    expect(values.get(STORAGE_KEYS.progress)).toBe(original);
  });
  it('fences already queued old-epoch task edits while adopting the reset into their live source', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pvp.taskCompletions.old = { complete: true, timestamp: 100 };
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    const reset = structuredClone(state);
    reset.pvp = { ...defaultState.pvp, progressEpoch: 1 };
    values.set(STORAGE_KEYS.progress, guestEnvelope(reset, { pvp: 200, pve: 100, seasonal: 100 }));
    state.pve.level = 2;
    const first = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 300)
    );
    state.pvp.taskCompletions.stale = { complete: true, timestamp: 400 };
    const second = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 400)
    );
    release();
    await Promise.all([first, second]);
    await tab.flushActiveProgressWrites();
    expect(state.pvp).toEqual({ ...defaultState.pvp, progressEpoch: 1 });
    expect(
      tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)?.state.pvp
    ).toEqual(state.pvp);
    expect(state.pve.level).toBe(2);
  });
  it('persists uncaptured live intent after adopting a future-clock reset without resurrecting old maps or history', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pvp.taskCompletions.old = { complete: true, timestamp: 100 };
    state.pvp.manualActivityHistory = [
      { id: 'old', timestamp: 100, type: 'task', action: 'complete', title: 'Old' },
    ];
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    let release!: () => void;
    let releaseFollowup!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const followupGate = new Promise<void>((resolve) => {
      releaseFollowup = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    const reset = structuredClone(state);
    reset.pvp = { ...defaultState.pvp, progressEpoch: 1 };
    const future = Date.now() + 100_000;
    values.set(
      STORAGE_KEYS.progress,
      guestEnvelope(reset, { pvp: future, pve: 100, seasonal: 100 })
    );
    state.pve.level = 2;
    const write = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 300)
    );
    void navigator.locks.request('held followup', { mode: 'exclusive' }, () => followupGate);
    state.pvp.level = 2;
    state.pvp.taskCompletions.fresh = { complete: true, timestamp: 400 };
    state.pvp.manualActivityHistory.push({
      id: 'fresh',
      timestamp: 400,
      type: 'task',
      action: 'complete',
      title: 'Fresh',
    });
    release();
    try {
      await write;
      expect(tab.status.progressSaveStatus.local).toBe('pending');
      expect(state.pvp.level).toBe(2);
      expect(state.pvp.progressEpoch).toBe(1);
      expect(state.pvp.taskCompletions.old).toBeUndefined();
      expect(state.pvp.manualActivityHistory?.map((row) => row.id)).toEqual(['fresh']);
    } finally {
      releaseFollowup();
    }
    await tab.flushActiveProgressWrites();
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp).toEqual(state.pvp);
    expect(saved.modeTimestamps?.pvp).toBeGreaterThan(future);
    expect(saved.modeTimestamps?.seasonal).toBe(100);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
  it('preserves same-epoch queued undo, false, null, zero and removal intent in order', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 5;
    state.pvp.displayName = 'Old';
    state.pvp.xpOffset = 50;
    state.pvp.skillOffsets.strength = 3;
    state.pvp.taskCompletions.old = { complete: true, timestamp: 100 };
    state.pvp.manualActivityHistory = [
      { id: 'old', timestamp: 100, type: 'task', action: 'complete', title: 'Old' },
    ];
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    state.pvp.level = 3;
    const first = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 1000)
    );
    state.pvp.level = 5;
    state.pvp.displayName = null;
    state.pvp.xpOffset = 0;
    state.pvp.skillOffsets.strength = 0;
    state.pvp.taskCompletions.old = { complete: false, timestamp: 1001 };
    state.pvp.manualActivityEpoch = 1;
    state.pvp.manualActivityHistory = [];
    const second = tab.persistActiveProgressValue(
      tab.progressStorageSerializer.serialize(state, null, 1000)
    );
    delete state.pvp.skillOffsets.strength;
    release();
    await Promise.all([first, second]);
    await tab.flushActiveProgressWrites();
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state.pvp).toMatchObject({
      level: 5,
      displayName: null,
      xpOffset: 0,
      taskCompletions: { old: { complete: false } },
      manualActivityEpoch: 1,
      manualActivityHistory: [],
    });
    expect(saved.state.pvp.skillOffsets.strength).toBeUndefined();
    expect(state.pvp).toEqual(saved.state.pvp);
  });
  it.each(['pvp', 'pve', 'seasonal', 'all'] as const)(
    'reconciles a queued guest %s reset with newer durable modes and fences a stale tab write',
    async (mode) => {
      const first = await openTab();
      const second = await openTab();
      const state = structuredClone(defaultState);
      for (const other of GAME_MODE_VALUES) state[other].level = 40;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      first.progressStorageSerializer.reset(first.parsePersistedProgressState(original, null));
      const newer = structuredClone(state);
      for (const other of GAME_MODE_VALUES) newer[other].level = 3;
      newer.gameEdition = 4;
      const clocks = { pvp: 200, pve: 200, seasonal: 200 };
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      const intervening = second.persistActiveProgressValue(guestEnvelope(newer, clocks, 200));
      const modes = mode === 'all' ? GAME_MODE_VALUES : [mode];
      const adopt = vi.fn((accepted) => Object.assign(state, accepted.state));
      const reset = first.resetGuestProgress(modes, mode === 'all', () => state, adopt);
      const stale = structuredClone(defaultState);
      for (const other of GAME_MODE_VALUES) {
        stale[other].level = 40;
        stale[other].displayName = 'Old name';
        stale[other].pmcFaction = 'BEAR';
        stale[other].xpOffset = 500;
        stale[other].skillOffsets = { strength: 4 };
        stale[other].taskCompletions.old = { complete: true, timestamp: 900 };
        stale[other].storyChapters.old = {
          objectives: { old: { complete: true, timestamp: 900 } },
        };
        stale[other].taskAvailability = {
          old: { requirements: 'old requirements', timestamp: 900 },
        };
        stale[other].manualActivityHistory = [
          { id: 'old', timestamp: 900, type: 'task', action: 'complete', title: 'Old' },
        ];
      }
      // The obsolete reset-mode payload has a later scalar clock than the reset.
      const staleClocks = { pvp: 100, pve: 100, seasonal: 100 };
      for (const resetMode of modes) staleClocks[resetMode] = Date.now() + 100_000;
      const trailing = second.persistActiveProgressValue(guestEnvelope(stale, staleClocks));
      expect(adopt).not.toHaveBeenCalled();
      release();
      expect(await intervening).toBe(true);
      await reset;
      expect(await trailing).toBe(true);
      const saved = first.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
      expect(adopt).toHaveBeenCalledOnce();
      for (const other of GAME_MODE_VALUES) {
        if (modes.includes(other)) {
          expect(saved.state[other]).toEqual({ ...defaultState[other], progressEpoch: 1 });
          expect(saved.modeTimestamps?.[other]).toBe(adopt.mock.calls[0]![0].modeTimestamps[other]);
        } else {
          expect(saved.state[other].level).toBe(3);
          expect(saved.modeTimestamps?.[other]).toBe(200);
        }
      }
      expect(saved.state.gameEdition).toBe(mode === 'all' ? defaultState.gameEdition : 4);
      expect(saved.metadataTimestamp).toBe(
        mode === 'all' ? adopt.mock.calls[0]![0].metadataTimestamp : 200
      );
    }
  );
  it("cancels this tab's earlier pending guest write before committing a reset", async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.level = 40;
    state.pve.level = 5;
    const original = guestEnvelope(state);
    values.set(STORAGE_KEYS.progress, original);
    tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    const pending = tab.persistActiveProgressValue(original);
    const adopt = vi.fn((snapshot) => Object.assign(state, snapshot.state));
    const reset = tab.resetGuestProgress(['pvp'], false, () => state, adopt);
    release();
    expect(await pending).toBe(false);
    await reset;
    expect(state.pvp).toEqual({ ...defaultState.pvp, progressEpoch: 1 });
    expect(state.pve.level).toBe(5);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
  it('bases guest reset epochs on the newer stored epoch and includes live edits made while waiting', async () => {
    const tab = await openTab();
    const state = structuredClone(defaultState);
    state.pvp.progressEpoch = 2;
    values.set(STORAGE_KEYS.progress, guestEnvelope(state));
    tab.progressStorageSerializer.reset(
      tab.parsePersistedProgressState(guestEnvelope(state), null)
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
    const adopt = vi.fn((snapshot) => Object.assign(state, snapshot.state));
    const reset = tab.resetGuestProgress(['pvp'], false, () => state, adopt);
    state.pve.level = 5;
    const current = structuredClone(defaultState);
    current.pvp.progressEpoch = 7;
    current.pvp.level = 9;
    values.set(STORAGE_KEYS.progress, guestEnvelope(current));
    release();
    await reset;
    expect(state.pvp).toEqual({ ...defaultState.pvp, progressEpoch: 8 });
    expect(state.pve.level).toBe(5);
    const saved = tab.parsePersistedProgressState(values.get(STORAGE_KEYS.progress), null)!;
    expect(saved.state).toEqual(state);
    expect(saved.modeTimestamps?.seasonal).toBe(100);
  });
  it.each([
    'foreign',
    'unparseable',
    'read',
    'quota',
    'inaccessible',
    'blocked',
    'retention',
    'locks',
    'session',
    'generation',
  ] as const)(
    'refuses a guest reset without adopting memory or reporting success when %s prevents commit',
    async (failure) => {
      const tab = await openTab();
      const state = structuredClone(defaultState);
      state.pvp.level = 40;
      const original = guestEnvelope(state);
      values.set(STORAGE_KEYS.progress, original);
      tab.progressStorageSerializer.reset(tab.parsePersistedProgressState(original, null));
      const adopt = vi.fn();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      void navigator.locks.request('held', { mode: 'exclusive' }, () => gate);
      if (failure === 'locks') vi.stubGlobal('navigator', {});
      values.set(LEGACY_STORAGE_KEYS.progress, original);
      const reset = tab.resetGuestProgress(['pvp'], false, () => state, adopt);
      if (failure === 'foreign') values.set(STORAGE_KEYS.progress, envelope('foreign', 9));
      if (failure === 'unparseable') values.set(STORAGE_KEYS.progress, '{opaque');
      if (failure === 'read')
        vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
          throw new Error('read failed');
        });
      if (failure === 'quota')
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw new DOMException('full', 'QuotaExceededError');
        });
      if (failure === 'inaccessible')
        vi.stubGlobal(
          'localStorage',
          new Proxy(
            {},
            {
              get: () => {
                throw new DOMException('blocked', 'SecurityError');
              },
            }
          )
        );
      if (failure === 'blocked') tab.setActiveProgressWritesBlocked(true);
      if (failure === 'retention') tab.setActiveProgressRetentionGuard(() => false);
      if (failure === 'session') auth.owner = 'new-owner';
      if (failure === 'generation') tab.invalidateActiveProgressWrites();
      release();
      await expect(reset).rejects.toThrow('Local guest progress could not be saved');
      expect(values.get(STORAGE_KEYS.progress)).toBe(
        failure === 'foreign'
          ? envelope('foreign', 9)
          : failure === 'unparseable'
            ? '{opaque'
            : original
      );
      expect(values.get(LEGACY_STORAGE_KEYS.progress)).toBe(original);
      expect(adopt).not.toHaveBeenCalled();
      expect(state.pvp.level).toBe(40);
      expect(tab.status.progressSaveStatus.local).toBe('failed');
    }
  );
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
    // Clock-only writes preserve accepted freshness for an immediate auth handoff.
    const pending = tab.parsePersistedProgressState(
      tab.progressPersistStorage.getItem(STORAGE_KEYS.progress),
      'owner'
    );
    expect(pending?.modeTimestamps).toEqual({ pvp: 60, pve: 60, seasonal: 60 });
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
  it.each(['missing', 'rejected', 'throw', 'no-op'] as const)(
    'reports active clear failure without releasing durable bytes: %s',
    async (failure) => {
      const tab = await openTab();
      const original = envelope('owner', 10);
      values.set(STORAGE_KEYS.progress, original);
      if (failure === 'missing') vi.stubGlobal('navigator', {});
      if (failure === 'rejected')
        vi.mocked(navigator.locks.request).mockRejectedValue(
          new DOMException('denied', 'SecurityError')
        );
      if (failure === 'throw')
        vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
          throw new DOMException('denied', 'SecurityError');
        });
      if (failure === 'no-op') vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {});
      expect(await tab.clearActiveProgressStorage('owner', true)).toBe(false);
      expect(values.get(STORAGE_KEYS.progress)).toBe(original);
      expect(tab.status.progressSaveStatus.local).toBe('failed');
      expect(tab.status.hasUnsavedProgressChanges()).toBe(false);
    }
  );
  it('keeps newer pending save status when an older clear fails', async () => {
    const tab = await openTab();
    values.set(STORAGE_KEYS.progress, envelope('owner', 10));
    vi.mocked(navigator.locks.request).mockRejectedValueOnce(
      new DOMException('denied', 'SecurityError')
    );
    const clear = tab.clearActiveProgressStorage('owner');
    const newer = tab.persistActiveProgressValue(envelope('owner', 20));
    expect(await clear).toBe(false);
    expect(tab.status.progressSaveStatus.local).not.toBe('failed');
    expect(await newer).toBe(true);
    expect(tab.status.progressSaveStatus.local).toBe('saved');
  });
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
  it.each(['saved', 'failed'] as const)(
    'rechecks acknowledgements after another tab commits independently newer modes, preserving %s status',
    async (localStatus) => {
      const first = await openTab();
      const second = await openTab();
      const originalState = structuredClone(defaultState);
      const originalSerializer = first.createProgressStorageSerializer(() => null);
      const original = originalSerializer.serialize(originalState, 'owner', 100);
      values.set(STORAGE_KEYS.progress, original);
      first.status.recordLocalSave(localStatus === 'saved', 'quota');
      const localSaveBefore = { ...first.status.progressSaveStatus };
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
      // Accepted clocks remain visible for hydration and session handoff while the ack queues.
      const pending = first.readPersistedProgressState('owner')!;
      expect(pending.modeTimestamps).toEqual({ pvp: 50, pve: 50, seasonal: 50 });
      expect(pending.metadataTimestamp).toBe(50);
      expect(await write).toBe(true);
      await first.flushActiveProgressWrites();
      const reloaded = first.parsePersistedProgressState(
        values.get(STORAGE_KEYS.progress)!,
        'owner'
      )!;
      expect(reloaded.state.pve.level).toBe(42);
      expect(reloaded.modeTimestamps).toEqual({ pvp: 100, pve: 200, seasonal: 100 });
      expect(reloaded.metadataTimestamp).toBe(100);
      expect(first.status.progressSaveStatus).toEqual(localSaveBefore);
    }
  );
  it('keeps an earlier local edit pending until it settles when an acknowledgement queues', async () => {
    const first = await openTab();
    const second = await openTab();
    const state = structuredClone(defaultState);
    const serializer = first.createProgressStorageSerializer(() => null);
    const original = serializer.serialize(state, 'owner', 100);
    const expected = first.parsePersistedProgressState(original, 'owner')!;
    const edit = first.persistActiveProgressValue(original);
    state.pve.level = 42;
    const newer = serializer.serialize(state, 'owner', 200);
    const otherEdit = second.persistActiveProgressValue(newer);
    const acknowledgement = first.persistActiveProgressValue(original, true, expected);
    expect(first.status.progressSaveStatus.local).toBe('pending');
    expect(first.status.hasUnsavedProgressChanges()).toBe(true);
    expect(await edit).toBe(true);
    expect(await otherEdit).toBe(true);
    expect(await acknowledgement).toBe(false);
    expect(values.get(STORAGE_KEYS.progress)).toBe(newer);
    expect(first.status.progressSaveStatus.local).toBe('saved');
    expect(first.status.hasUnsavedProgressChanges()).toBe(false);
  });
  it.each(['cleanup', 'session'] as const)(
    'leaves save status unchanged when %s cancels a queued acknowledgement',
    async (cancellation) => {
      const first = await openTab();
      const second = await openTab();
      const serializer = first.createProgressStorageSerializer(() => null);
      const original = serializer.serialize(structuredClone(defaultState), 'owner', 100);
      const expected = first.parsePersistedProgressState(original, 'owner')!;
      values.set(STORAGE_KEYS.progress, original);
      first.status.recordLocalSave(true);
      const localSaveBefore = { ...first.status.progressSaveStatus };
      const acknowledgement = first.persistActiveProgressValue(original, true, expected);
      if (cancellation === 'cleanup') first.invalidateActiveProgressWrites('owner');
      else auth.owner = 'other';
      const removal = second.clearActiveProgressStorage('owner');
      expect(await acknowledgement).toBe(false);
      await removal;
      expect(values.has(STORAGE_KEYS.progress)).toBe(false);
      expect(first.status.progressSaveStatus).toEqual(localSaveBefore);
    }
  );
});
