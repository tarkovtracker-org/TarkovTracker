import { gzipSync } from 'node:zlib';
import { createApp, defineEventHandler, toWebHandler } from 'h3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openCatalogBody,
  CATALOG_BYTES_HEADER,
  limitCompressedCatalog,
} from '@/server/utils/catalogStream';
import { catalogHandler } from '@/server/utils/serveCatalog';
import {
  catalogByteLimit,
  CATALOG_DATASETS,
  CATALOG_LANGUAGES,
  CATALOG_MANIFEST_KEY,
} from '@/utils/catalogDatasets';
const body = JSON.stringify({
  data: { tasks: [{ id: 'unchanged-id', description: '@tt:pve:tasks:key' }] },
});
function serve(
  dataset: Parameters<typeof catalogHandler>[0],
  scope: string,
  stored: string | null = body
) {
  const key = `neutral-catalog-v1/${scope}/immutable-digest`;
  const manifest = {
    completedAt: 123,
    entries: {
      [scope]: {
        key,
        bytes: new TextEncoder().encode(stored ?? body).byteLength,
        headers: { 'X-Overlay-Sha256': 'active-sha' },
      },
    },
  };
  const get = vi.fn(async (requested: string) => {
    if (requested === CATALOG_MANIFEST_KEY) return manifest;
    return requested === key && stored !== null
      ? new Response(stored).body!.pipeThrough(new CompressionStream('gzip'))
      : null;
  });
  const app = createApp()
    .use(
      defineEventHandler((event) => {
        event.context.cloudflare = { env: { TARKOV_DATA: { get } } };
      })
    )
    .use(catalogHandler(dataset));
  return { request: toWebHandler(app), get, key, manifest };
}
describe('catalog snapshot routes', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('serves comparison input from the current release and falls back for older releases', async () => {
    const scope = 'tasks-objectives/pve';
    const { request, get, key, manifest } = serve('tasks-objectives', scope);
    const url = 'https://example.test/?gameMode=pve&view=counts';
    expect(await (await request(new Request(url))).text()).toBe(body);
    expect(get).toHaveBeenCalledWith(key, 'stream');
    const counts =
      '{"data":{"tasks":[{"id":"quest","objectives":[{"id":"objective","count":2}]}]}}';
    const countsScope = scope + '/counts';
    const countsKey = `neutral-catalog-v1/${countsScope}/immutable-digest`;
    manifest.completedAt++;
    manifest.entries[countsScope] = {
      ...manifest.entries[scope]!,
      key: countsKey,
      bytes: new TextEncoder().encode(counts).byteLength,
    };
    get.mockImplementation(async (requested) => {
      if (requested === CATALOG_MANIFEST_KEY) return manifest;
      return new Response(requested === countsKey ? counts : body).body!.pipeThrough(
        new CompressionStream('gzip')
      );
    });
    const response = await request(new Request(url));
    expect(response.headers.get('X-Catalog-Release')).toBe('124');
    expect(response.headers.get('X-Cache-Status')).toBe('PRECOMPUTE');
    expect(await response.text()).toBe(counts);
    expect(await (await request(new Request('https://example.test/?gameMode=pve'))).text()).toBe(
      body
    );
  });
  it('bounds retained compressed bytes with ordinary chunks', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3));
        controller.enqueue(new Uint8Array(3));
        controller.close();
      },
    });
    const reader = limitCompressedCatalog(source, 4).getReader();
    expect((await reader.read()).value?.byteLength).toBe(3);
    await expect(reader.read()).rejects.toThrow('Compressed catalog byte limit exceeded');
  });
  it.each(['wrong-length', 'cancel'])(
    'keeps the healthy atomic cache slot after a late validation failure: %s',
    async (failure) => {
      const kept = new Map<string, Response>();
      const writes: Promise<void>[] = [];
      vi.stubGlobal('caches', {
        default: {
          match: async (key: string) => kept.get(key)?.clone(),
          put(key: string, value: Response) {
            const write = value.arrayBuffer().then((bytes) => {
              kept.set(key, new Response(bytes, { headers: value.headers }));
            });
            writes.push(write);
            return write;
          },
        },
      });
      const { request, get, manifest } = serve('tasks-core', 'tasks-core/regular');
      const url = new Request('https://example.test/');
      expect(await (await request(url)).text()).toBe(body);
      await Promise.all(writes);
      expect(kept.size).toBe(1);
      manifest.completedAt++;
      const entry = manifest.entries['tasks-core/regular']!;
      entry.key += '-new';
      entry.bytes++;
      get.mockImplementation(async (key) =>
        key === CATALOG_MANIFEST_KEY
          ? manifest
          : new Response(body).body!.pipeThrough(new CompressionStream('gzip'))
      );
      const response = await request(url);
      expect(response.status).toBe(200);
      if (failure === 'cancel') await response.body!.cancel('Consumer left');
      else await expect(response.text()).rejects.toThrow('Catalog byte length mismatch');
      await Promise.allSettled(writes);
      expect(writes).toHaveLength(2);
      expect([...kept.values()][0]?.headers.get('X-Catalog-Release')).toBe('123');
      get.mockRejectedValue(new Error('KV unavailable'));
      const stale = await request(url);
      expect(stale.headers.get('X-Cache-Status')).toBe('STALE');
      expect(await stale.text()).toBe(body);
    }
  );
  it.each([
    0,
    -1,
    1.5,
    catalogByteLimit('tasks-core/regular') + 1,
    Number.MAX_SAFE_INTEGER,
    undefined,
    '123',
  ])('rejects invalid expanded manifest bytes: %s', async (bytes) => {
    const { request, manifest } = serve('tasks-core', 'tasks-core/regular');
    Object.assign(manifest.entries['tasks-core/regular']!, { bytes });
    expect((await request(new Request('https://example.test/'))).status).toBe(503);
  });
  it('propagates consumer cancellation to the compressed source', async () => {
    const cancel = vi.fn();
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue(gzipSync(body));
      },
      cancel,
    });
    const response = new Response(source, {
      headers: { [CATALOG_BYTES_HEADER]: String(new TextEncoder().encode(body).byteLength) },
    });
    const { body: output } = await openCatalogBody(response, 'tasks-core/regular');
    await output.cancel('Consumer left');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith('Consumer left'));
  });
  it('retains streaming and surfaces later source failure without replacing the payload', async () => {
    let sourceController: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller;
        controller.enqueue(gzipSync(body).subarray(0, -8));
      },
    });
    const response = new Response(source, {
      headers: { [CATALOG_BYTES_HEADER]: String(new TextEncoder().encode(body).byteLength) },
    });
    const { body: output } = await openCatalogBody(response, 'tasks-core/regular');
    const reader = output.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe(body);
    sourceController!.error(new Error('Later source failure'));
    await expect(reader.read()).rejects.toThrow('Later source failure');
  });
  it.each([-1, 1])(
    'rejects an expanded body whose length differs from the manifest by %s',
    async (difference) => {
      const { request, manifest } = serve('tasks-core', 'tasks-core/regular');
      manifest.entries['tasks-core/regular']!.bytes += difference;
      const response = await request(new Request('https://example.test/'));
      if (response.status === 200) await expect(response.text()).rejects.toThrow();
      else expect(response.status).toBe(503);
    }
  );
  it('uses the warm scope when a newer compressed stream fails on its first read', async () => {
    const kept = new Map<string, Response>();
    vi.stubGlobal('caches', {
      default: {
        match: async (key: string) => kept.get(key)?.clone(),
        put: async (key: string, value: Response) => {
          kept.set(key, value);
        },
      },
    });
    const { request, get, manifest } = serve('tasks-core', 'tasks-core/regular');
    const url = new Request('https://example.test/');
    expect(await (await request(url)).text()).toBe(body);
    manifest.completedAt++;
    manifest.entries['tasks-core/regular']!.key += '-new';
    get.mockImplementation(async (key) => {
      if (key === CATALOG_MANIFEST_KEY) return manifest;
      return new ReadableStream({
        start(controller) {
          controller.error(new Error('First chunk unavailable'));
        },
      });
    });
    const response = await request(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache-Status')).toBe('STALE');
    expect(response.headers.get('X-Catalog-Bytes')).toBeNull();
    expect(await response.text()).toBe(body);
  });
  it('fails closed on a corrupt cached body instead of returning successful headers', async () => {
    vi.stubGlobal('caches', {
      default: {
        match: async () =>
          new Response('invalid gzip', {
            headers: { 'X-Catalog-Bytes': String(body.length), 'X-Catalog-Release': '122' },
          }),
      },
    });
    const { request, get } = serve('tasks-core', 'tasks-core/regular');
    get.mockRejectedValue(new Error('KV unavailable'));
    expect((await request(new Request('https://example.test/'))).status).toBe(503);
  });
  it('keeps the last verified scope available during a KV read failure', async () => {
    const kept = new Map<string, Response>();
    const cache = {
      match: async (key: string) => kept.get(key)?.clone(),
      put: async (key: string, value: Response) => {
        kept.set(key, value);
      },
    };
    vi.stubGlobal('caches', { default: cache });
    const { request, get } = serve('tasks-core', 'tasks-core/pve');
    const url = 'https://example.test/?gameMode=pve';
    const current = await request(new Request(url));
    expect(await current.text()).toEqual(body);
    get.mockRejectedValue(new Error('KV unavailable'));
    const stale = await request(new Request(url));
    expect(stale.headers.get('X-Cache-Status')).toBe('STALE');
    expect(await stale.text()).toEqual(body);
    const other = await request(new Request('https://example.test/?gameMode=regular'));
    expect(other.status).toBe(503);
  });
  it('forces a KV read and rejects stale fallback only for an enabled bypass request', async () => {
    vi.stubEnv('NUXT_CACHE_BYPASS_ENABLED', 'true');
    const kept = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (key: string) => kept.get(key)?.clone()),
      put: async (key: string, value: Response) => {
        kept.set(key, value);
      },
    };
    vi.stubGlobal('caches', { default: cache });
    try {
      const { request, get, key } = serve('tasks-core', 'tasks-core/regular');
      const url = 'https://example.test/?gameMode=regular';
      expect(await (await request(new Request(url))).text()).toBe(body);
      expect(await (await request(new Request(url + '&cacheBust=1'))).text()).toBe(body);
      expect(get.mock.calls.filter(([k]) => k === key)).toHaveLength(2);
      get.mockRejectedValue(new Error('KV unavailable'));
      expect((await request(new Request(url + '&cacheBust=1'))).status).toBe(503);
      vi.stubEnv('NUXT_CACHE_BYPASS_ENABLED', 'false');
      expect((await request(new Request(url + '&cacheBust=1'))).headers.get('X-Cache-Status')).toBe(
        'STALE'
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each(CATALOG_DATASETS)('reads the same %s snapshot in every language', async (dataset) => {
    const { get, request, key } = serve(dataset, dataset + '/pve');
    for (const lang of CATALOG_LANGUAGES) {
      const res = await request(
        new Request(`https://example.test/api/tarkov/${dataset}?gameMode=pve&lang=${lang}`)
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Overlay-Sha256')).toBe('active-sha');
      expect(res.headers.get('X-Cache-Status')).toBe('PRECOMPUTE');
      expect(res.headers.get(CATALOG_BYTES_HEADER)).toBeNull();
      expect(await res.text()).toBe(body);
    }
    expect(get.mock.calls.map(([k]) => k)).toEqual(
      CATALOG_LANGUAGES.flatMap(() => [CATALOG_MANIFEST_KEY, key])
    );
  });
  it('uses the first language when the strings query repeats it', async () => {
    const { request } = serve('strings', 'strings/de');
    const response = await request(new Request('https://example.test/?lang=de&lang=en'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
  });
  it('selects one German table across game modes', async () => {
    const { request } = serve('strings', 'strings/de');
    for (const mode of ['pve', 'pvp-season', 'regular']) {
      expect(
        (await request(new Request('https://example.test/?lang=de&gameMode=' + mode))).status
      ).toBe(200);
    }
  });
  it.each(['tasks-objectives', 'editions'] as const)(
    'fails closed for missing %s objects after pointer publication',
    async (dataset) => {
      const { request } = serve(dataset, dataset + '/regular', null);
      const res = await request(new Request('https://example.test'));
      expect(res.status).toBe(503);
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    }
  );
});
