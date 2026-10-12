import { afterEach, expect, it, vi } from 'vitest';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
const { report, published } = vi.hoisted(() => ({
  report: {
    value: null as {
      rows: Array<{ status: string; served?: string; source?: string }>;
      catalogs: Array<{ status: string }>;
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
it('reports all successful core identities when one objective endpoint fails', async () => {
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
        url.pathname.endsWith('tasks-objectives') &&
        url.searchParams.get('lang') === 'en' &&
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
  expect(report.value?.catalogs.filter((row) => row.status === 'unverified')).toHaveLength(1);
  expect(report.value?.imports).toHaveLength(3);
  expect(report.value?.imports.every((row) => row.status === 'current')).toBe(true);
  expect(process.exitCode).toBe(1);
});
