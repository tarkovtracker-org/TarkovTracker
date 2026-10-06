// @vitest-environment node
import { stringify } from 'devalue';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import {
  exportCommittedProgressRecovery,
  parseProgressRecoveryBundle,
  serializeProgressRecoveryBundle,
  type ProgressRecoveryBundle,
} from '@/stores/tarkov/progressRecoveryBundle';
import {
  decodeRecoveryPayload,
  progressRecoveryLimits,
} from '@/stores/tarkov/progressRecoveryCodec';
import {
  captureProgressRecoverySources,
  ProgressRecoveryBundleError,
  progressRecoveryValidationLimits,
} from '@/stores/tarkov/progressRecoverySources';
import {
  openProgressRepository,
  type ProgressOwnerToken,
} from '@/stores/tarkov/progressRepository';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
const container = (payload: string) =>
  JSON.stringify({
    _format: 'tarkovtracker-progress-recovery',
    _version: 1,
    _codec: 'devalue@5.9.4',
    payload,
  });
const state = () => structuredClone(defaultState);
describe('inactive committed progress recovery bundle', () => {
  let repository: Awaited<ReturnType<typeof openProgressRepository>>;
  let token: ProgressOwnerToken;
  let values: Map<string, string>;
  let storage: { getItem: ReturnType<typeof vi.fn<(key: string) => string | null>> };
  beforeEach(async () => {
    repository = await openProgressRepository(new IDBFactory(), 'recovery-test');
    token = await repository.activateOwner('owner-A');
    values = new Map();
    storage = { getItem: vi.fn((key: string) => values.get(key) ?? null) };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    repository.close();
  });
  const bundle = () =>
    exportCommittedProgressRecovery(repository, token, storage, [...values.keys()]);
  const save = (progress = state()) =>
    repository.commit({ token, expectedRevision: 0, kind: 'edit', state: progress });
  it('captures every supported progress-only namespace with untouched owner/season/raw bytes', async () => {
    const keys = [
      STORAGE_KEYS.progress,
      LEGACY_STORAGE_KEYS.progress,
      `${STORAGE_KEYS.progressBackupPrefix}A_1`,
      `${LEGACY_STORAGE_KEYS.progressBackupPrefix}A_2`,
      `${STORAGE_KEYS.progressRecoveryPrefix}A`,
      `${STORAGE_KEYS.progressSupersededPrefix}A_3`,
      `${STORAGE_KEYS.progressQuarantinePrefix}opaque_0`,
    ];
    const raw =
      ' \n{"_userId":"foreign-B","_timestamp":0,"data":{"seasonalSeasonNumber":17,"unknown":{"retained":true}}}  ';
    keys.forEach((key) => values.set(key, raw));
    const superseded =
      ' {"ownerId":"owner-A","mode":"seasonal","seasonNumber":3,"progress":{"level":42}} ';
    values.set(keys[5]!, superseded);
    values.set(keys[6]!, '\ufeffbroken [ original \ud800');
    const sources = captureProgressRecoverySources(storage, keys);
    expect(sources.map((source) => source.kind)).toEqual([
      'active',
      'active',
      'backup',
      'backup',
      'account-recovery',
      'superseded',
      'quarantine',
    ]);
    expect(sources[0]).toMatchObject({
      raw,
      observed: { declaredOwner: 'foreign-B', originalSeasonNumber: 17 },
    });
    expect(sources[5]).toMatchObject({
      raw: superseded,
      observed: { declaredOwner: 'owner-A', originalSeasonNumber: 3 },
    });
    expect(sources[6]).toMatchObject({
      raw: values.get(keys[6]!),
      observed: { parse: 'opaque', declaredOwner: undefined },
    });
    const restored = parseProgressRecoveryBundle(await bundle());
    expect(restored.sources).toEqual(sources);
    expect(values.get(keys[0]!)).toBe(raw);
  });
  it.each([
    STORAGE_KEYS.preferences,
    STORAGE_KEYS.storageVersion,
    STORAGE_KEYS.activityLogManual,
    'sb-example-auth-token',
    'sb-example-code-verifier',
    `${STORAGE_KEYS.progressQuarantineRemovalMarkerPrefix}A`,
    `${STORAGE_KEYS.deviceDataRemovalIncompletePrefix}A`,
    STORAGE_KEYS.progressBackupPrefix,
  ])('rejects non-payload key %s before any storage read', (key) => {
    expect(() => captureProgressRecoverySources(storage, [STORAGE_KEYS.progress, key])).toThrow(
      ProgressRecoveryBundleError
    );
    expect(storage.getItem).not.toHaveBeenCalled();
  });
  it('never enumerates storage and preserves absence, empty and ownerless values distinctly', () => {
    const source = {
      getItem: storage.getItem,
      key: vi.fn(() => {
        throw new Error('No key enumeration');
      }),
      get length() {
        throw new Error('No key count');
      },
    };
    values.set(LEGACY_STORAGE_KEYS.progress, '');
    const captured = captureProgressRecoverySources(source, [
      STORAGE_KEYS.progress,
      LEGACY_STORAGE_KEYS.progress,
    ]);
    expect(captured[0]).toMatchObject({
      raw: null,
      observed: { parse: 'missing', declaredOwner: undefined },
    });
    expect(captured[1]).toMatchObject({
      raw: '',
      observed: { parse: 'opaque', declaredOwner: undefined },
    });
    expect(source.key).not.toHaveBeenCalled();
    values.set(STORAGE_KEYS.progress, '{"_userId":null,"data":{}}');
    expect(
      captureProgressRecoverySources(source, [STORAGE_KEYS.progress])[0]!.observed.declaredOwner
    ).toBeNull();
    values.set(STORAGE_KEYS.progress, '{"_userId":42,"data":{}}');
    expect(
      captureProgressRecoverySources(source, [STORAGE_KEYS.progress])[0]!.observed.declaredOwner
    ).toBeUndefined();
  });
  it('propagates a blocked read instead of exporting an incomplete absence claim', async () => {
    storage.getItem.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    await expect(
      exportCommittedProgressRecovery(repository, token, storage, [STORAGE_KEYS.progress])
    ).rejects.toMatchObject({ name: 'SecurityError' });
    expect((await repository.read(token)).revision).toBe(0);
  });
  it('retains new-only commits separately from older raw snapshots for rollback', async () => {
    const legacyRaw =
      ' {"_userId":"owner-A","data":{"pve":{"level":40},"seasonalSeasonNumber":17}} ';
    values.set(STORAGE_KEYS.progress, legacyRaw);
    const progress = state();
    progress.seasonalSeasonNumber = 17;
    await repository.commit({
      token,
      expectedRevision: 0,
      kind: 'import',
      state: progress,
      legacyRaw,
    });
    progress.pve.level = 55;
    await repository.commit({ token, expectedRevision: 1, kind: 'edit', state: progress });
    const expected = await repository.read(token);
    const encoded = await bundle();
    const recovered: ProgressRecoveryBundle = parseProgressRecoveryBundle(encoded);
    expect(recovered.committed).toEqual(expected);
    expect(recovered.committed).toMatchObject({
      owner: 'owner-A',
      revision: 2,
      epochs: { pvp: 0, pve: 0, seasonal: 0 },
      state: { pve: { level: 55 }, seasonalSeasonNumber: 17 },
      legacyRaw,
    });
    expect(recovered.sources[0]!.raw).toBe(legacyRaw);
    expect(serializeProgressRecoveryBundle(recovered)).toBe(encoded);
    expect(values.get(STORAGE_KEYS.progress)).toBe(legacyRaw);
  });
  it('roundtrips property presence, undefined, negative zero, shared/cyclic Date/Map/Set and sparse arrays', async () => {
    const progress = state();
    progress.pvp.progressEpoch = undefined;
    const sparse = Array(1024);
    sparse[2] = undefined;
    sparse[1000] = -0;
    const shared: Record<string, unknown> = {
      date: new Date('2020-01-01T00:00:00Z'),
      missing: undefined,
      zero: -0,
      sparse,
      nan: NaN,
    };
    shared.self = shared;
    shared.map = new Map([['self', shared]]);
    shared.set = new Set([shared]);
    Object.assign(progress, { extension: shared, alias: shared });
    await save(progress);
    const recovered = parseProgressRecoveryBundle(await bundle());
    expect(recovered.committed).toEqual(await repository.read(token));
    expect(recovered.committed.state!.pvp).toHaveProperty('progressEpoch', undefined);
    const extension = (recovered.committed.state as unknown as Record<string, unknown>)
      .extension as typeof shared;
    expect(extension).toBe((recovered.committed.state as unknown as Record<string, unknown>).alias);
    expect(extension.self).toBe(extension);
    expect((extension.map as Map<string, unknown>).get('self')).toBe(extension);
    expect((extension.set as Set<unknown>).has(extension)).toBe(true);
    expect(Object.is(extension.zero, -0)).toBe(true);
    const recoveredSparse = extension.sparse as unknown[];
    expect(recoveredSparse.length).toBe(1024);
    expect(Object.hasOwn(recoveredSparse, 0)).toBe(false);
    expect(Object.hasOwn(recoveredSparse, 2)).toBe(true);
    expect(recoveredSparse[2]).toBeUndefined();
    expect(Object.is(recoveredSparse[1000], -0)).toBe(true);
  });
  it('reserializes null-prototype opaque objects without changing their prototype or aliases', async () => {
    await save();
    const recovered = parseProgressRecoveryBundle(await bundle());
    const extension = Object.assign(Object.create(null), { missing: undefined, zero: -0 });
    extension.self = extension;
    Object.assign(recovered.committed.state!, { extension, alias: extension });
    const encoded = serializeProgressRecoveryBundle(recovered);
    const roundtrip = parseProgressRecoveryBundle(encoded);
    const progress = roundtrip.committed.state as unknown as Record<string, unknown>;
    const result = progress.extension as typeof extension;
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(result.self).toBe(result);
    expect(progress.alias).toBe(result);
    expect(Object.hasOwn(result, 'missing')).toBe(true);
    expect(Object.is(result.zero, -0)).toBe(true);
    expect(serializeProgressRecoveryBundle(roundtrip)).toBe(encoded);
    expect(Object.getPrototypeOf(extension)).toBeNull();
  });
  it.each([
    Object.assign([1], { named: 'must survive' }),
    new Blob(['opaque']),
    new Uint8Array([1, 2]),
    /unsupported/,
  ])(
    'rejects unsupported IDB extension %j without losing its stored original',
    async (extension) => {
      await save(Object.assign(state(), { extension }));
      const original = await repository.read(token);
      await expect(bundle()).rejects.toMatchObject({
        name: 'ProgressRecoveryBundleError',
        reason: 'unsupported',
      });
      expect(await repository.read(token)).toEqual(original);
    }
  );
  it('does not export after an owner cursor succeeds but its readonly transaction aborts', async () => {
    await save();
    const original = IDBObjectStore.prototype.openCursor;
    let cursorSucceeded = false;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = original.apply(this, args);
      if (args[0] === 'owner:"owner-A"')
        request.addEventListener('success', () => {
          cursorSucceeded = true;
          this.transaction.abort();
        });
      return request;
    });
    const acknowledged = vi.fn();
    await expect(bundle().then(acknowledged)).rejects.toMatchObject({ name: 'AbortError' });
    spy.mockRestore();
    expect(cursorSucceeded).toBe(true);
    expect(acknowledged).not.toHaveBeenCalled();
    expect((await repository.read(token)).revision).toBe(1);
  });
  it('rejects a stale owner and does not treat a claimed file owner as current authorization', async () => {
    await save();
    const valid = parseProgressRecoveryBundle(await bundle());
    await repository.activateOwner('owner-B');
    await expect(bundle()).rejects.toMatchObject({ reason: 'session' });
    expect(parseProgressRecoveryBundle(serializeProgressRecoveryBundle(valid)).session.owner).toBe(
      'owner-A'
    );
    const forged = { ...valid, session: { ...valid.session, owner: 'owner-B' } };
    expect(() => parseProgressRecoveryBundle(container(stringify(forged)))).toThrowError(/owner/);
  });
  it('retains a deletion tombstone as exported evidence without restoring anything', async () => {
    await save();
    const deleted = await repository.remove(token, 1);
    const recovered = parseProgressRecoveryBundle(await bundle());
    expect(recovered.committed).toEqual(deleted);
    expect((await repository.read(token)).deleted).toBe(true);
  });
  it.each([{ _version: 2 }, { _codec: 'devalue@future' }, { _format: 'tarkovtracker-backup' }])(
    'rejects unsupported file contract %j',
    async (patch) => {
      const valid = JSON.parse(await bundle());
      expect(() => parseProgressRecoveryBundle(JSON.stringify({ ...valid, ...patch }))).toThrow(
        ProgressRecoveryBundleError
      );
      expect((await repository.read(token)).revision).toBe(0);
    }
  );
  it('rejects metadata forgery while retaining raw source bytes', async () => {
    values.set(STORAGE_KEYS.progress, '{"_userId":"foreign","data":{"seasonalSeasonNumber":17}}');
    const recovered = parseProgressRecoveryBundle(await bundle());
    recovered.sources[0]!.observed.declaredOwner = 'owner-A';
    expect(() => parseProgressRecoveryBundle(container(stringify(recovered)))).toThrowError(
      /source/
    );
    expect(values.get(STORAGE_KEYS.progress)).toContain('foreign');
  });
  it.each([Array(1), [undefined], Object.assign(Array(2), { 1: undefined })])(
    'rejects sparse or undefined source inventory on both paths: %j',
    async (sources) => {
      const valid = parseProgressRecoveryBundle(await bundle());
      const request = { ...valid, sources } as ProgressRecoveryBundle;
      expect(() => serializeProgressRecoveryBundle(request)).toThrowError(/source/);
      expect(() => parseProgressRecoveryBundle(container(stringify(request)))).toThrowError(
        /source/
      );
      expect((await repository.read(token)).revision).toBe(0);
    }
  );
  it('charges aliased metadata raw bytes before any raw JSON parsing on both paths', async () => {
    const valid = parseProgressRecoveryBundle(await bundle());
    const raw = JSON.stringify({ _userId: 'owner-A', padding: 'x'.repeat(16_384) });
    valid.sources = Array.from({ length: 600 }, (_, index) => ({
      key: `${STORAGE_KEYS.progressBackupPrefix}${index}`,
      raw,
      kind: 'backup',
      namespace: 'v2',
      observed: { parse: 'json', declaredOwner: 'owner-A', originalSeasonNumber: undefined },
    }));
    const encoded = container(stringify(valid));
    expect(encoded.length).toBeLessThan(150_000);
    const parse = vi.spyOn(JSON, 'parse');
    expect(() => serializeProgressRecoveryBundle(valid)).toThrowError(/limit/);
    expect(() => parseProgressRecoveryBundle(encoded)).toThrowError(/limit/);
    expect(parse.mock.calls.filter(([input]) => input === raw)).toHaveLength(0);
    parse.mockRestore();
    expect(valid.sources[599]!.raw).toBe(raw);
  });
  it('bounds capture metadata work before parsing repeated storage values', () => {
    const raw = 'x'.repeat(100_000);
    const keys = Array.from(
      { length: 100 },
      (_, index) => `${STORAGE_KEYS.progressBackupPrefix}${index}`
    );
    keys.forEach((key) => values.set(key, raw));
    const parse = vi.spyOn(JSON, 'parse');
    expect(() => captureProgressRecoverySources(storage, keys)).toThrowError(/limit/);
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    expect(values.get(keys[99]!)).toBe(raw);
  });
  it('counts shared API history/task validation in every occurrence on both paths', async () => {
    await save();
    const valid = parseProgressRecoveryBundle(await bundle());
    const task = { id: 'task-A', state: 'active' as const };
    const tasks = Array(200).fill(task);
    valid.committed.state!.pvp.apiUpdateHistory = Array(200).fill({
      id: 'update-A',
      at: 1,
      source: 'api',
      tasks,
    });
    const encoded = container(stringify(valid));
    expect(encoded.length).toBeLessThan(4_000);
    const reads = vi.fn(() => 'task-A');
    Object.defineProperty(task, 'id', { get: reads, enumerable: true });
    expect(() => serializeProgressRecoveryBundle(valid)).toThrowError(/limit/);
    expect(reads.mock.calls.length).toBeLessThan(progressRecoveryValidationLimits.checks);
    expect(() => parseProgressRecoveryBundle(encoded)).toThrowError(/limit/);
    expect((await repository.read(token)).revision).toBe(1);
  });
  it('does not memoize away repeated checks across cyclic known chapter contexts', async () => {
    await save();
    const valid = parseProgressRecoveryBundle(await bundle());
    const chapters: Record<string, { objectives: unknown }> = {};
    for (let index = 0; index < 100; index += 1) chapters[String(index)] = { objectives: chapters };
    Object.assign(valid.committed.state!.pvp, { storyChapters: chapters });
    expect(() => serializeProgressRecoveryBundle(valid)).toThrowError(/limit/);
    expect(() => parseProgressRecoveryBundle(container(stringify(valid)))).toThrowError(/limit/);
  });
});
describe('bounded pinned recovery codec before revival', () => {
  it('caps encoded file size before even parsing an invalid container', () => {
    const raw = 'x'.repeat(progressRecoveryLimits.characters + 1);
    expect(() => parseProgressRecoveryBundle(raw)).toThrowError(/limit/);
  });
  it('rejects small sparse-array amplification before revival', () => {
    const payload = `[[-7,${progressRecoveryLimits.arrayLength + 1}]]`;
    expect(payload.length).toBeLessThan(20);
    expect(() => decodeRecoveryPayload(payload)).toThrowError(/limit/);
  });
  it('caps flat table nodes before building its reference graph', () => {
    expect(() =>
      decodeRecoveryPayload(JSON.stringify(Array(progressRecoveryLimits.nodes + 1).fill(null)))
    ).toThrowError(/limit/);
  });
  it('caps reference edges even when many nodes share one target', () => {
    const object = Object.fromEntries(
      Array.from({ length: progressRecoveryLimits.edges + 1 }, (_, index) => [String(index), 1])
    );
    expect(() => decodeRecoveryPayload(JSON.stringify([object, null]))).toThrowError(/limit/);
  });
  it('caps hydration depth while allowing shared references and cycles', () => {
    const table = Array.from({ length: progressRecoveryLimits.depth + 2 }, (_, index) => ({
      next: index + 1,
    }));
    const payload = JSON.stringify([...table, null]);
    expect(() => decodeRecoveryPayload(payload)).toThrowError(/limit/);
    expect((decodeRecoveryPayload('[{"self":0}]') as { self: unknown }).self).toBeDefined();
  });
  it.each(['[["Date",[[]]]]', '[["ArrayBuffer","AAAA"]]', '[["Map",1]]', '[{"x":999}]'])(
    'rejects malformed or unsupported constructor shape %s before revival',
    (payload) => {
      expect(() => decodeRecoveryPayload(payload)).toThrow(ProgressRecoveryBundleError);
    }
  );
});
