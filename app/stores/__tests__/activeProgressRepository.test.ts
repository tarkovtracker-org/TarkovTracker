// @vitest-environment node
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openActiveProgressRepository,
  type ProgressOwnerToken,
} from '@/stores/tarkov/progressRepository';
describe('active progress envelope authority', () => {
  let factory: IDBFactory;
  let repository: Awaited<ReturnType<typeof openActiveProgressRepository>>;
  let token: ProgressOwnerToken;
  beforeEach(async () => {
    factory = new IDBFactory();
    repository = await openActiveProgressRepository(factory, 'active-test');
    token = await repository.activateOwner(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    repository.close();
  });
  it('retains exact original bytes and never reimports after deletion/reopen', async () => {
    const legacy = ' {"opaque":"original"} ';
    await repository.read(token, legacy);
    await repository.mutate(token, () => ({ raw: null, result: true }));
    repository.close();
    repository = await openActiveProgressRepository(factory, 'active-test');
    expect(await repository.read(token, 'stale legacy')).toMatchObject({
      raw: null,
      legacyRaw: legacy,
      revision: 1,
    });
  });
  it('serializes competing mutations against the latest committed envelope', async () => {
    await repository.read(token, '{"pvp":20,"pve":42}');
    const edit = repository.mutate(token, (current) => ({
      raw: JSON.stringify({ ...JSON.parse(current.raw!), pve: 55 }),
      result: true,
    }));
    const reset = repository.mutate(token, (current) => ({
      raw: JSON.stringify({ ...JSON.parse(current.raw!), pvp: 1 }),
      result: true,
    }));
    await Promise.all([edit, reset]);
    expect(JSON.parse((await repository.read(token, null)).raw!)).toEqual({ pvp: 1, pve: 55 });
  });
  it('does not acknowledge put success when the transaction aborts', async () => {
    await repository.read(token, 'original');
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
      repository.mutate(token, () => ({ raw: 'lost', result: true }))
    ).rejects.toBeTruthy();
    vi.restoreAllMocks();
    expect(await repository.read(token, null)).toMatchObject({ raw: 'original', revision: 0 });
  });
  it('rejects operations from an old generation after owner A to B to A', async () => {
    token = await repository.activateOwner('account-a');
    await repository.read(token, 'original');
    await repository.activateOwner('account-b');
    await repository.activateOwner('account-a');
    const mutate = vi.fn(() => ({ raw: 'stale', result: true }));
    await expect(repository.mutate(token, mutate)).rejects.toMatchObject({ reason: 'session' });
    expect(mutate).not.toHaveBeenCalled();
  });
  it('does not retire the current owner for an obsolete queued activation', async () => {
    const b = await repository.activateOwner('b');
    await repository.read(b, 'original');
    let current = true;
    const activation = repository.activateOwner('a', false, () => current);
    current = false;
    await expect(activation).rejects.toMatchObject({ reason: 'session' });
    await expect(
      repository.mutate(b, () => ({ raw: 'saved', result: true }))
    ).resolves.toMatchObject({ result: true });
  });
  it('requires hydration before mutation instead of inventing an empty record', async () => {
    await expect(
      repository.mutate(token, () => ({ raw: 'new', result: true }))
    ).rejects.toMatchObject({ reason: 'import' });
  });
  it('rolls back callback failure with original bytes unchanged', async () => {
    await repository.read(token, 'original');
    await expect(
      repository.mutate(token, () => {
        throw new Error('quota/recovery failure');
      })
    ).rejects.toThrow('quota/recovery failure');
    expect(await repository.read(token, null)).toMatchObject({ raw: 'original', revision: 0 });
  });
  it.each([
    { version: 2, revision: 0, raw: 'newer', legacyRaw: null },
    { version: 1, revision: -1, raw: 'corrupt', legacyRaw: null },
    { version: 1, revision: 0, raw: 42, legacyRaw: null },
    { version: 1, revision: 0, raw: 'ok', legacyRaw: null, legacyUpdates: [42] },
  ])('fails closed on unsupported or corrupt active records: %j', async (value) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('active-test');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put(value, 'active-envelope');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    const legacy = vi.fn(() => 'must not adopt');
    await expect(repository.read(token, legacy)).rejects.toBeTruthy();
    expect(legacy).not.toHaveBeenCalled();
    const mutate = vi.fn(() => ({ raw: 'replacement', result: true }));
    await expect(repository.mutate(token, mutate)).rejects.toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });
});
