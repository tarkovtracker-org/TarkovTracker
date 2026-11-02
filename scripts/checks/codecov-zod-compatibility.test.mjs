// @vitest-environment node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const nuxtPlugin = createRequire(require.resolve('@codecov/nuxt-plugin'));
const vitePlugin = createRequire(nuxtPlugin.resolve('@codecov/vite-plugin'));
const entry = vitePlugin.resolve('@codecov/bundler-plugin-core');
const { z } = createRequire(entry)('zod');
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('bounds issue allocation for oversized constrained arrays', () => {
  const schema = z.array(z.string()).max(2);
  const result = schema.safeParse(Array(1000).fill(1));
  expect(result.success).toBe(false);
  expect(result.error.issues).toEqual([expect.objectContaining({ code: 'too_big', path: [] })]);
  expect(schema.parse(['one', 'two'])).toEqual(['one', 'two']);
});
it.each(['CommonJS', 'ESM'])(
  'preserves Codecov GitHub job records with Zod 4 (%s)',
  async (format) => {
    const core =
      format === 'CommonJS'
        ? require(entry)
        : await import(pathToFileURL(entry.replace(/\.cjs$/, '.mjs')).href);
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('GITHUB_REPOSITORY', 'example/repository');
    vi.stubEnv('GITHUB_RUN_ID', '123');
    vi.stubEnv('GITHUB_JOB', 'bundle');
    vi.stubEnv('GITHUB_EVENT_NAME', 'push');
    vi.stubEnv('GITHUB_REF', 'refs/heads/main');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          jobs: [{ name: 'bundle', html_url: 'https://example.invalid/job/123' }],
          metadata: { count: 1, enabled: true, parent: null },
        })
      )
      .mockResolvedValueOnce(Response.json({ error: 'test upload boundary' }, { status: 400 }));
    vi.stubGlobal('fetch', fetch);
    const normalized = core.normalizeOptions({
      bundleName: 'test-bundle',
      enableBundleAnalysis: true,
      uploadToken: 'test-only',
      telemetry: false,
      retryCount: 1,
    });
    expect(normalized.success, JSON.stringify(normalized)).toBe(true);
    const output = new core.Output(normalized.options, { metaFramework: 'nuxt' });
    await expect(output.write(true)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/example/repository/actions/runs/123/jobs'
    );
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.buildURL).toBe('https://example.invalid/job/123');
  }
);
