import { afterEach, expect, it, vi } from 'vitest';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
const { report, published } = vi.hoisted(() => ({
  report: {
    value: null as {
      rows: Array<{ status: string; served?: string; source?: string }>;
      imports: Array<{ status: string }>;
    } | null,
  },
  published: {
    version: 'catalog-test',
    sha256: 'catalog-sha',
    generated: new Date().toISOString(),
  },
}));
vi.mock('@/server/utils/overlay', () => ({
  fetchOverlay: async () => ({ overlay: { $meta: published } }),
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
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('retains all healthy core evidence and fails verification when an import snapshot is unavailable', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.stubEnv('TARKOV_OPERATIONS_ORIGIN', 'https://catalog-test.example');
  vi.stubEnv('TARKOV_OPERATIONS_CLIENT_ID', '');
  vi.stubEnv('TARKOV_OPERATIONS_CLIENT_SECRET', '');
  const entries = API_SUPPORTED_LANGUAGES.flatMap((lang) =>
    VALID_GAME_MODES.map((gameMode) => ({ lang, gameMode, overlay: published }))
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input);
      if (
        url.pathname === '/api/tarkov/tasks-import' &&
        url.searchParams.get('gameMode') === 'regular'
      )
        return new Response(null, { status: 503 });
      const payload = url.pathname.endsWith('overlay-status')
        ? { completedAt: Date.now(), entries }
        : {
            data: { tasks: [{ id: 'task', objectives: [], failConditions: [] }] },
            dataOverlay: published,
            catalog: { lang: 'en', gameMode: url.searchParams.get('gameMode') },
          };
      return new Response(JSON.stringify(payload), { headers: { 'X-Cache-Status': 'PRECOMPUTE' } });
    })
  );
  await import('@@/scripts/precompute/check-overlay');
  expect(report.value?.rows).toHaveLength(48);
  expect(
    report.value?.rows.every(
      (row) =>
        row.status === 'current' && row.served === 'catalog-sha' && row.source === 'PRECOMPUTE'
    )
  ).toBe(true);
  expect(report.value?.imports).toHaveLength(3);
  expect(report.value?.imports.filter((row) => row.status === 'unverified')).toHaveLength(1);
  expect(report.value?.imports.filter((row) => row.status === 'current')).toHaveLength(2);
  expect(process.exitCode).toBe(1);
  expect(JSON.parse(output.mock.calls.at(-1)?.[0] as string)).toMatchObject({
    importMismatches: 0,
    importUnverified: 1,
  });
});
