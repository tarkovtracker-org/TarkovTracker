// @vitest-environment node
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import {
  openProgressRepository,
  ProgressRepositoryConflict,
  type ProgressOwnerToken,
  type ProgressRepositorySnapshot,
  type ProgressRepositoryCommit,
} from '@/stores/tarkov/progressRepository';
import { classifyLocalSaveFailure } from '@/stores/tarkov/progressSaveStatus';
describe('inactive progress transaction repository', () => {
  let factory: IDBFactory;
  let repository: Awaited<ReturnType<typeof openProgressRepository>>;
  let token: ProgressOwnerToken;
  const state = () => structuredClone(defaultState);
  beforeEach(async () => {
    factory = new IDBFactory();
    repository = await openProgressRepository(factory, 'progress-test');
    token = await repository.activateOwner(null);
  });
  afterEach(() => repository.close());
  it('commits first save and captures the queued intent before caller mutation', async () => {
    const draft = state();
    draft.pvp.level = 20;
    const request: ProgressRepositoryCommit = {
      token,
      expectedRevision: 0,
      kind: 'edit',
      state: draft,
    };
    const saving = repository.commit(request);
    draft.pvp.level = 99;
    expect((await saving).state?.pvp.level).toBe(20);
    expect((await repository.read(token)).revision).toBe(1);
  });
  it('orders genuine scalar decreases without wall clocks', async () => {
    const first = state();
    first.pvp.level = 20;
    await repository.commit({ token, expectedRevision: 0, kind: 'edit', state: first });
    first.pvp.level = 3;
    const accepted = await repository.commit({
      token,
      expectedRevision: 1,
      kind: 'edit',
      state: first,
    });
    expect(accepted.revision).toBe(2);
    expect((await repository.read(token)).state?.pvp.level).toBe(3);
  });
  it('rejects a stale concurrent envelope rather than silently acknowledging it', async () => {
    const peer = await openProgressRepository(factory, 'progress-test');
    try {
      const peerToken = await peer.activateOwner(null);
      expect(peerToken).toEqual(token);
      const first = state();
      first.pve.level = 55;
      await repository.commit({ token, expectedRevision: 0, kind: 'edit', state: first });
      await expect(
        peer.commit({ token: peerToken, expectedRevision: 0, kind: 'edit', state: state() })
      ).rejects.toMatchObject({ reason: 'revision' });
      expect((await peer.read(peerToken)).state?.pve.level).toBe(55);
    } finally {
      peer.close();
    }
  });
  it.each(['pvp', 'pve', 'seasonal'] as const)(
    'resets only %s and preserves unrelated modes after reopen',
    async (mode) => {
      const initial = state();
      initial.pvp.level = 20;
      initial.pve.level = 42;
      initial.seasonal.level = 33;
      await repository.commit({ token, expectedRevision: 0, kind: 'edit', state: initial });
      const fresh = state();
      fresh[mode].progressEpoch = 1;
      await repository.commit({
        token,
        expectedRevision: 1,
        kind: 'reset',
        resetModes: [mode],
        state: fresh,
      });
      repository.close();
      repository = await openProgressRepository(factory, 'progress-test');
      const saved: ProgressRepositorySnapshot = await repository.read(token);
      for (const other of ['pvp', 'pve', 'seasonal'] as const) {
        expect(saved.state?.[other].level).toBe(other === mode ? 1 : initial[other].level);
        expect(saved.epochs[other]).toBe(Number(other === mode));
      }
    }
  );
  it('keeps all-mode epoch fences and permits a legitimate edit after rereading a reset', async () => {
    const fresh = state();
    for (const mode of ['pvp', 'pve', 'seasonal'] as const) fresh[mode].progressEpoch = 1;
    await repository.commit({
      token,
      expectedRevision: 0,
      kind: 'reset',
      resetModes: ['pvp', 'pve', 'seasonal'],
      state: fresh,
    });
    await expect(
      repository.commit({ token, expectedRevision: 1, kind: 'edit', state: state() })
    ).rejects.toMatchObject({ reason: 'epoch' });
    const adopted = await repository.read(token);
    adopted.state!.pvp.level = 2;
    expect(
      (
        await repository.commit({
          token,
          expectedRevision: adopted.revision,
          kind: 'edit',
          state: adopted.state!,
        })
      ).state?.pvp.level
    ).toBe(2);
  });
  it('fences delayed A work across A to B to A and keeps each owner record', async () => {
    const oldA = await repository.activateOwner('A');
    const a = state();
    a.pvp.level = 20;
    await repository.commit({ token: oldA, expectedRevision: 0, kind: 'edit', state: a });
    const b = await repository.activateOwner('B');
    expect((await repository.read(b)).state).toBeNull();
    const newA = await repository.activateOwner('A');
    expect(newA.generation).toBeGreaterThan(oldA.generation);
    await expect(
      repository.commit({ token: oldA, expectedRevision: 1, kind: 'edit', state: a })
    ).rejects.toMatchObject({ reason: 'session' });
    expect((await repository.read(newA)).state?.pvp.level).toBe(20);
  });
  it('imports once, retains exact source bytes, and prevents deleted-owner resurrection on reopen', async () => {
    const raw = '  {"opaque":"exact original bytes"}  ';
    const imported = state();
    imported.pvp.progressEpoch = 4;
    await repository.commit({
      token,
      expectedRevision: 0,
      kind: 'import',
      legacyRaw: raw,
      state: imported,
    });
    imported.pvp.level = 2;
    expect(
      (await repository.commit({ token, expectedRevision: 1, kind: 'edit', state: imported }))
        .legacyRaw
    ).toBe(raw);
    await expect(
      repository.commit({
        token,
        expectedRevision: 2,
        kind: 'import',
        legacyRaw: 'other',
        state: imported,
      })
    ).rejects.toMatchObject({ reason: 'import' });
    const removed = await repository.remove(token, 2);
    expect(removed).toMatchObject({
      deleted: true,
      state: null,
      legacyRaw: null,
      revision: 3,
      epochs: { pvp: 5, pve: 1, seasonal: 1 },
    });
    repository.close();
    repository = await openProgressRepository(factory, 'progress-test');
    await expect(
      repository.commit({
        token,
        expectedRevision: 3,
        kind: 'import',
        legacyRaw: raw,
        state: imported,
      })
    ).rejects.toBeInstanceOf(ProgressRepositoryConflict);
    expect((await repository.read(token)).deleted).toBe(true);
  });
  it('does not acknowledge a successful put request followed by abort before transaction complete', async () => {
    const original = IDBObjectStore.prototype.put;
    let requestSucceeded = false;
    const acknowledged = vi.fn();
    const baseline = { revision: 0 };
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = original.apply(this, args);
      request.addEventListener('success', () => {
        requestSucceeded = true;
        this.transaction.abort();
      });
      return request;
    });
    const saving = repository
      .commit({ token, expectedRevision: 0, kind: 'edit', state: state() })
      .then((saved) => {
        baseline.revision = saved.revision;
        acknowledged();
      });
    await expect(saving).rejects.toMatchObject({ name: 'AbortError' });
    spy.mockRestore();
    expect(requestSucceeded).toBe(true);
    expect(acknowledged).not.toHaveBeenCalled();
    expect(baseline.revision).toBe(0);
    expect(await repository.read(token)).toMatchObject({ revision: 0, state: null });
  });
  it('propagates quota failure without advancing the revision', async () => {
    const quota = new DOMException('Quota exceeded', 'QuotaExceededError');
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw quota;
    });
    const saving = repository.commit({ token, expectedRevision: 0, kind: 'edit', state: state() });
    await expect(saving).rejects.toBe(quota);
    spy.mockRestore();
    expect(classifyLocalSaveFailure(quota)).toBe('quota');
    expect((await repository.read(token)).revision).toBe(0);
  });
  it('propagates unavailable storage without falling back to localStorage', async () => {
    const unavailable = new DOMException('Storage blocked', 'SecurityError');
    vi.spyOn(factory, 'open').mockImplementation(() => {
      throw unavailable;
    });
    await expect(openProgressRepository(factory, 'blocked')).rejects.toBe(unavailable);
    expect(classifyLocalSaveFailure(unavailable)).toBe('unavailable');
  });
});
