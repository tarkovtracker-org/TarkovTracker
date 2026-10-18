// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createPrecomputedResponseReader } from '@/server/utils/precomputedResponse';
import { buildPrecomputedEnvelope, isPrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
import type { PrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
const makeSource = (name = 'initial', sha = 'abc') =>
  JSON.stringify(
    buildPrecomputedEnvelope({
      data: { name },
      dataOverlay: { status: 'fresh', version: '1', sha256: sha, generated: '2026-10-18' },
    })
  );
function harness(maxBytes?: number) {
  const validate = vi.fn(isPrecomputedEnvelope);
  const predicate = (value: unknown): value is PrecomputedEnvelope<unknown> => validate(value);
  const read = createPrecomputedResponseReader(predicate, maxBytes);
  const store = { get: vi.fn<(key: string, type: 'json' | 'text') => Promise<unknown>>() };
  store.get.mockResolvedValue(makeSource());
  return { validate, read, store };
}
describe('validated precomputed response reuse', () => {
  it('rereads KV every time but only parses/serializes a byte-identical source once', async () => {
    const { read, store, validate } = harness();
    const parse = vi.spyOn(JSON, 'parse');
    const stringify = vi.spyOn(JSON, 'stringify');
    const first = (await read(store, 'en-regular', 'tarkov'))!;
    first.headers.set('X-Overlay-Sha256', 'client mutation');
    const second = (await read(store, 'en-regular', 'tarkov'))!;
    expect(first).not.toBe(second);
    expect(await first.text()).toBe(await second.text());
    expect(second.headers.get('X-Overlay-Sha256')).toBe('abc');
    expect(second.headers.get('Content-Type')).toBe('application/json');
    expect(store.get.mock.calls).toEqual([
      ['en-regular', 'text'],
      ['en-regular', 'text'],
    ]);
    expect(validate).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledOnce();
    expect(stringify).toHaveBeenCalledOnce();
    parse.mockRestore();
    stringify.mockRestore();
  });
  it('takes a changed payload and overlay identity immediately without an added TTL', async () => {
    const { read, store, validate } = harness();
    await read(store, 'key', 'tarkov');
    store.get.mockResolvedValue(makeSource('new data', 'new-sha'));
    const changed = (await read(store, 'key', 'tarkov'))!;
    expect(changed.headers.get('X-Overlay-Sha256')).toBe('new-sha');
    expect(await changed.json()).toMatchObject({ data: { name: 'new data' } });
    expect(validate).toHaveBeenCalledTimes(2);
  });
  it.each([null, '{}', JSON.stringify({ ...JSON.parse(makeSource()), overlay: null })])(
    'never substitutes an old memo for missing or invalid source %s',
    async (bad) => {
      const { read, store } = harness();
      await read(store, 'key', 'namespace');
      store.get.mockResolvedValue(bad);
      expect(await read(store, 'key', 'namespace')).toBeNull();
    }
  );
  it('propagates failed reads and malformed JSON instead of serving the memo', async () => {
    const { read, store } = harness();
    await read(store, 'key', 'namespace');
    store.get.mockRejectedValueOnce(new Error('KV unavailable'));
    await expect(read(store, 'key', 'namespace')).rejects.toThrow('KV unavailable');
    store.get.mockResolvedValueOnce('{malformed');
    await expect(read(store, 'key', 'namespace')).rejects.toThrow();
    expect((await read(store, 'key', 'namespace'))!.status).toBe(200);
  });
  it('isolates binding identity and namespace even for identical keys and JSON', async () => {
    const { read, store, validate } = harness();
    await read(store, 'same', 'one');
    await read(store, 'same', 'two');
    const other = { get: vi.fn(async () => makeSource()) };
    await read(other, 'same', 'two');
    expect(validate).toHaveBeenCalledTimes(3);
  });
  it('isolates locale and all mode keys', async () => {
    const { read, store, validate } = harness();
    for (const key of ['en-regular', 'fr-regular', 'en-pve', 'en-pvp-season', 'en-regular']) {
      await read(store, key, 'namespace');
    }
    expect(validate).toHaveBeenCalledTimes(5);
  });
  it('never shares validation between independently scoped readers', async () => {
    const { read, store } = harness();
    await read(store, 'key', 'namespace');
    const reject = vi.fn((_value: unknown): _value is never => false);
    const strict = createPrecomputedResponseReader((value: unknown): value is never =>
      reject(value)
    );
    expect(await strict(store, 'key', 'namespace')).toBeNull();
    expect(reject).toHaveBeenCalledOnce();
  });
  it('does not retain an oversized entry or keep the previously retained entry', async () => {
    const { read, store, validate } = harness(2048);
    const small = makeSource();
    await read(store, 'key', 'namespace');
    store.get.mockResolvedValue(makeSource('字'.repeat(1000)));
    for (let i = 0; i < 2; i++) expect((await read(store, 'key', 'namespace'))!.status).toBe(200);
    store.get.mockResolvedValue(small);
    await read(store, 'key', 'namespace');
    expect(validate).toHaveBeenCalledTimes(4);
  });
  it('keeps concurrent reads and their bodies independent when KV resolves out of order', async () => {
    const { read, store } = harness();
    let finishOld!: (value: unknown) => void;
    store.get.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      })
    );
    const old = read(store, 'key', 'namespace');
    store.get.mockResolvedValue(makeSource('new', 'new-sha'));
    const newer = (await read(store, 'key', 'namespace'))!;
    finishOld(makeSource('old', 'old-sha'));
    const older = (await old)!;
    expect(older.headers.get('X-Overlay-Sha256')).toBe('old-sha');
    expect(newer.headers.get('X-Overlay-Sha256')).toBe('new-sha');
    const current = (await read(store, 'key', 'namespace'))!;
    expect(current.headers.get('X-Overlay-Sha256')).toBe('new-sha');
    expect(await older.json()).toMatchObject({ data: { name: 'old' } });
    expect(await newer.json()).toMatchObject({ data: { name: 'new' } });
  });
});
