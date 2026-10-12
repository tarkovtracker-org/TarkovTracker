import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
import { buildTaskImportKey, isTaskImportSnapshot } from '@/server/utils/taskImportSnapshot';
import { TASK_IMPORT_MAX_AGE_MS } from '@/utils/taskImportCatalog';
const mocks = vi.hoisted(() => ({
  query: { gameMode: 'regular' },
  get: vi.fn(),
  header: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@/server/utils/logger', () => ({ createLogger: () => ({ warn: mocks.warn }) }));
vi.mock('@/server/utils/overlayResponseHeaders', () => ({ setOverlayResponseHeaders: vi.fn() }));
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
vi.stubGlobal('getQuery', () => mocks.query);
vi.stubGlobal('setHeader', mocks.header);
const { default: handler } = await import('@/server/api/tarkov/tasks-import.get');
const fixture = (gameMode = 'regular') =>
  buildPrecomputedEnvelope({
    data: {
      tasks: [
        {
          id: 'task',
          minPlayerLevel: 25,
          objectives: [{ id: 'obj', count: 9 }],
          failConditions: [],
        },
      ],
    },
    dataOverlay: { version: 'v1', sha256: 'sha1' },
    catalog: { lang: 'en', gameMode },
  });
const event = { context: { cloudflare: { env: { TARKOV_DATA: { get: mocks.get } } } } };
describe('snapshot-only task import route', () => {
  it('tolerates at most one minute of writer/reader clock skew without extending expiration', () => {
    const now = Date.now();
    expect(isTaskImportSnapshot({ ...fixture(), storedAt: now + 60_000 }, 'regular', now)).toBe(
      true
    );
    expect(isTaskImportSnapshot({ ...fixture(), storedAt: now + 60_001 }, 'regular', now)).toBe(
      false
    );
    expect(
      isTaskImportSnapshot(
        { ...fixture(), storedAt: now - TASK_IMPORT_MAX_AGE_MS - 1 },
        'regular',
        now
      )
    ).toBe(false);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.gameMode = 'regular';
    mocks.get.mockResolvedValue(fixture());
  });
  it.each(['regular', 'pve', 'pvp-season'])(
    'serves exactly one %s key without generation',
    async (mode) => {
      mocks.query.gameMode = mode;
      const snapshot = fixture(mode);
      mocks.get.mockResolvedValue(snapshot);
      expect(await handler(event as never)).toEqual(snapshot.payload);
      expect(mocks.get).toHaveBeenCalledExactlyOnceWith(buildTaskImportKey(mode), 'json');
      expect(mocks.header).toHaveBeenCalledWith(event, 'Cache-Control', 'no-store');
      expect(mocks.header).toHaveBeenCalledWith(event, 'X-Cache-Status', 'PRECOMPUTE');
    }
  );
  it.each([
    null,
    fixture('pve'),
    { ...fixture(), storedAt: Date.now() - TASK_IMPORT_MAX_AGE_MS - 1 },
    { ...fixture(), storedAt: Date.now() + TASK_IMPORT_MAX_AGE_MS },
    { ...fixture(), overlay: { version: 'other', sha256: 'other' } },
    { ...fixture(), version: 1 },
  ])('fails closed for missing/corrupt/wrong-mode/expired snapshots', async (snapshot) => {
    mocks.get.mockResolvedValue(snapshot);
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.header).toHaveBeenCalledWith(event, 'Cache-Control', 'no-store');
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  it('fails closed when the KV binding or read is unavailable', async () => {
    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 503 });
    mocks.get.mockRejectedValue(new Error('unavailable'));
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });
  it('serves a bounded last-good snapshot independently of another release SHA', async () => {
    const snapshot = { ...fixture(), storedAt: Date.now() - TASK_IMPORT_MAX_AGE_MS + 60_000 };
    mocks.get.mockResolvedValue(snapshot);
    await expect(handler(event as never)).resolves.toEqual(snapshot.payload);
  });
});
