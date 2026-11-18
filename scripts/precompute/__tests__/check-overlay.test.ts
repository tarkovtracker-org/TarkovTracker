import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CATALOG_SCOPES,
  catalogManifestProblems,
  parseCatalogJson,
  verifyCatalogResponse,
} from '../verify-catalog-release';
import type { CatalogRelease } from '@/utils/catalogDatasets';
const { report, published, source } = vi.hoisted(() => ({
  source: { status: 'fresh' },
  report: {
    value: null as {
      rows: Array<{ status: string }>;
      imports: Array<{ status: string }>;
      manifestProblems: string[];
      attempts: number;
    } | null,
  },
  published: {
    version: 'catalog-test',
    sha256: 'a'.repeat(64),
    status: 'applied',
    generated: new Date().toISOString(),
  },
}));
vi.mock('@/server/utils/overlay', () => ({
  fetchOverlay: async () => ({
    overlay: { $meta: published },
    meta: { status: source.status, unconsumedSections: [] },
  }),
}));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  const operations = {
    mkdtemp: async () => '/synthetic-report',
    writeFile: async (_path: string, contents: string) => {
      report.value = JSON.parse(contents);
    },
  };
  return { ...actual, ...operations, default: { ...actual, ...operations } };
});
const originalExitCode = process.exitCode;
it('reports invalid response encoding without recording private body fragments', () => {
  expect(() => parseCatalogJson(Buffer.from('private invalid content'))).toThrow(
    'Response contains invalid JSON or UTF-8'
  );
  expect(() => parseCatalogJson(new Uint8Array([0xff]))).toThrow(
    'Response contains invalid JSON or UTF-8'
  );
});
beforeEach(() => {
  vi.resetModules();
  report.value = null;
  source.status = 'fresh';
  process.exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.stubEnv('TARKOV_OPERATIONS_ORIGIN', 'https://catalog-test.example');
  vi.stubEnv('TARKOV_OPERATIONS_CLIENT_ID', '');
  vi.stubEnv('TARKOV_OPERATIONS_CLIENT_SECRET', '');
  vi.stubEnv('EXPECTED_OVERLAY_SHA', '');
});
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function release(completedAt = Date.now()) {
  const bodies = new Map<string, string>();
  const entries: CatalogRelease['entries'] = {};
  for (const scope of CATALOG_SCOPES) {
    const overlay = !scope.startsWith('bootstrap/') && !scope.startsWith('map-spawns/');
    const body = JSON.stringify({
      data: { rows: [{ id: scope }] },
      ...(overlay ? { dataOverlay: published } : {}),
    });
    bodies.set(scope, body);
    entries[scope] = {
      key: `neutral-catalog-v1/${scope}/${createHash('sha256').update(body).digest('hex')}`,
      bytes: Buffer.byteLength(body),
      headers: overlay
        ? {
            'X-Overlay-Sha256': published.sha256,
            'X-Overlay-Version': published.version,
          }
        : {},
    };
  }
  return { manifest: { completedAt, overlaySha: published.sha256, entries }, bodies };
}
function response(body: string, manifest: CatalogRelease, scope: string) {
  return new Response(body, {
    headers: {
      ...manifest.entries[scope]!.headers,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Cache-Status': 'PRECOMPUTE',
      'X-Catalog-Release': String(manifest.completedAt),
    },
  });
}
function stubRelease(fleet: ReturnType<typeof release>, unavailableImport = false) {
  const fetcher = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('overlay-status'))
      return new Response(JSON.stringify(fleet.manifest));
    const dataset = url.pathname.split('/').at(-1)!;
    if (dataset === 'tasks-import') {
      const mode = url.searchParams.get('gameMode');
      if (unavailableImport && mode === 'regular') return new Response(null, { status: 503 });
      return new Response(
        JSON.stringify({
          data: { tasks: [{ id: 'task', objectives: [], failConditions: [] }] },
          dataOverlay: published,
          catalog: { lang: 'en', gameMode: mode },
        }),
        {
          headers: {
            'X-Cache-Status': 'PRECOMPUTE',
            'Cache-Control': 'no-store',
            'X-Overlay-Sha256': published.sha256,
            'X-Overlay-Version': published.version,
          },
        }
      );
    }
    const value = url.searchParams.get(dataset === 'strings' ? 'lang' : 'gameMode');
    const scope = `${dataset}/${value}`;
    return response(fleet.bodies.get(scope)!, fleet.manifest, scope);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
it('certifies exactly 30 mode catalogs and 13 language bundles, preserving import failure evidence', async () => {
  const fetcher = stubRelease(release(), true);
  await import('../check-overlay');
  expect(report.value?.rows).toHaveLength(43);
  expect(report.value?.rows.every((row) => row.status === 'current')).toBe(true);
  expect(report.value?.imports.filter((row) => row.status === 'current')).toHaveLength(2);
  expect(report.value?.imports.filter((row) => row.status === 'unverified')).toHaveLength(1);
  expect(process.exitCode).toBe(1);
  expect(fetcher).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ redirect: 'error' })
  );
  expect(
    fetcher.mock.calls.every(([input]) => new URL(input).origin === 'https://catalog-test.example')
  ).toBe(true);
});
it('requires the exact scope set, fresh timestamp, overlay SHA, and content-addressed keys', () => {
  const now = Date.now();
  const good = release(now).manifest;
  expect(catalogManifestProblems(published, good, published.sha256, now)).toEqual([]);
  const missing = structuredClone(good);
  delete missing.entries['strings/tr'];
  const unexpected = structuredClone(good);
  unexpected.entries['strings/unknown'] = good.entries['strings/tr']!;
  const scopeMismatch = structuredClone(good);
  scopeMismatch.entries['items/pve'] = good.entries['items/regular']!;
  for (const bad of [
    missing,
    unexpected,
    scopeMismatch,
    { ...good, completedAt: now + 1 },
    { ...good, completedAt: now - 15 * 60 * 60 * 1000 },
    { ...good, overlaySha: 'b'.repeat(64) },
  ]) {
    expect(catalogManifestProblems(published, bad, published.sha256, now).length).toBeGreaterThan(
      0
    );
  }
});
it('checks original response bytes, length, source, cache policy, release timestamp, and overlay headers', async () => {
  const { manifest, bodies } = release();
  const scope = 'tasks-core/pve';
  const body = bodies.get(scope)!;
  const good = response(body, manifest, scope);
  const evidence = { body: new Uint8Array(await good.arrayBuffer()), headers: good.headers };
  expect(verifyCatalogResponse(scope, published, manifest, evidence).status).toBe('current');
  expect(
    verifyCatalogResponse(scope, { ...published, sha256: 'b'.repeat(64) }, manifest, evidence)
      .problems
  ).toContain('Response overlay identity differs');
  const whitespace = { ...evidence, body: Buffer.from(`${body} `) };
  expect(verifyCatalogResponse(scope, published, manifest, whitespace).problems).toContain(
    'Response bytes differ from immutable key digest'
  );
  expect(verifyCatalogResponse(scope, published, manifest, whitespace).problems).toContain(
    'Response byte length differs from manifest'
  );
  for (const [header, value] of [
    ['X-Cache-Status', 'LIVE'],
    ['Cache-Control', 'max-age=5'],
    ['X-Catalog-Release', '1'],
    ['X-Overlay-Sha256', 'wrong'],
    ['Content-Type', 'text/html'],
  ]) {
    const headers = new Headers(evidence.headers);
    headers.set(header!, value!);
    expect(verifyCatalogResponse(scope, published, manifest, { ...evidence, headers }).status).toBe(
      'unverified'
    );
  }
});
it('fails a complete catalog check when any response is corrupt', async () => {
  const fleet = release();
  fleet.bodies.set('strings/de', `${fleet.bodies.get('strings/de')} `);
  stubRelease(fleet);
  await import('../check-overlay');
  expect(report.value?.rows.filter((row) => row.status === 'unverified')).toHaveLength(1);
  expect(process.exitCode).toBe(1);
});
it('keeps import evidence and fails certification for an incomplete manifest', async () => {
  const fleet = release();
  delete fleet.manifest.entries['strings/tr'];
  stubRelease(fleet);
  await import('../check-overlay');
  expect(report.value?.rows.filter((row) => row.status === 'unverified')).toHaveLength(43);
  expect(report.value?.imports.every((row) => row.status === 'current')).toBe(true);
  expect(process.exitCode).toBe(1);
});
it('fails certification when the published overlay refresh falls back to stale data', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  source.status = 'stale';
  stubRelease(release());
  await import('../check-overlay');
  expect(report.value?.manifestProblems).toContain('Published overlay identity unavailable');
  expect(process.exitCode).toBe(1);
});
it('retries once when the manifest changes and verifies only the stable final release', async () => {
  const fleet = release(Date.now() - 1);
  const fetcher = stubRelease(fleet);
  let manifestReads = 0;
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (input) => {
    if (input.endsWith('overlay-status') && ++manifestReads === 2) {
      fleet.manifest.completedAt += 1;
    }
    return original(input);
  });
  await import('../check-overlay');
  expect(report.value?.attempts).toBe(2);
  expect(report.value?.manifestProblems).toEqual([]);
  expect(report.value?.rows.every((row) => row.status === 'current')).toBe(true);
  expect(process.exitCode).toBeUndefined();
});
it('fails if a second release change prevents a consistent observation', async () => {
  const fleet = release(Date.now() - 10);
  const fetcher = stubRelease(fleet);
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (input) => {
    if (input.endsWith('overlay-status')) fleet.manifest.completedAt += 1;
    return original(input);
  });
  await import('../check-overlay');
  expect(report.value?.attempts).toBe(2);
  expect(report.value?.manifestProblems).toContain(
    'Catalog release changed again during verification'
  );
  expect(process.exitCode).toBe(1);
});
it('rejects redirect-capable origins and incomplete Access configuration before sending credentials', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.stubEnv('TARKOV_OPERATIONS_ORIGIN', 'https://catalog-test.example/path');
  await expect(import('../check-overlay')).rejects.toThrow('HTTPS origin without a path');
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  {
    origin: 'https://catalog-test.example',
    id: 'id',
    secret: '',
    message: 'Both operations Access credentials',
  },
  { origin: '', id: 'id', secret: 'secret', message: 'TARKOV_OPERATIONS_ORIGIN is required' },
])(
  'rejects unauthorized Access configuration $message',
  async ({ origin, id, secret, message }) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubEnv('TARKOV_OPERATIONS_ORIGIN', origin);
    vi.stubEnv('TARKOV_OPERATIONS_CLIENT_ID', id);
    vi.stubEnv('TARKOV_OPERATIONS_CLIENT_SECRET', secret);
    await expect(import('../check-overlay')).rejects.toThrow(message);
    expect(fetcher).not.toHaveBeenCalled();
  }
);
