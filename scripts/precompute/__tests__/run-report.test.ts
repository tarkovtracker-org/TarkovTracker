import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { fetchNeutralOverlay, publishCatalog, writeFile } = vi.hoisted(() => ({
  fetchNeutralOverlay: vi.fn(),
  publishCatalog: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, writeFile, default: { ...original, writeFile } };
});
vi.mock('@/server/utils/neutralCatalog', () => ({}));
vi.mock('@/server/utils/neutralOverlay', () => ({ fetchNeutralOverlay }));
vi.mock('../catalog-release', () => ({ catalogReleaseReport: publishCatalog }));
vi.mock('../import-snapshots', () => ({
  runImportPrecompute: async () => ({ successes: [], failures: [] }),
}));
vi.mock('../kv', () => ({ createKvRestWriter: () => ({}) }));
describe('precompute diagnostic artifact', () => {
  const argv = process.argv;
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    process.argv = ['node', 'run.ts'];
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test');
    vi.stubEnv('TARKOV_DATA_KV_NAMESPACE_ID', 'test');
    vi.stubEnv('PRECOMPUTE_LANG', '');
    vi.stubEnv('PRECOMPUTE_GAME_MODE', '');
    vi.stubEnv('EXPECTED_OVERLAY_SHA', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it('records an early overlay failure before exiting', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('precompute exited');
    });
    fetchNeutralOverlay.mockRejectedValue(new Error('Overlay unavailable'));
    await expect(import('../run')).rejects.toThrow('precompute exited');
    expect(writeFile).toHaveBeenCalledExactlyOnceWith(
      'precompute-manifest.json',
      expect.stringContaining('"error": "Overlay unavailable"')
    );
    expect(publishCatalog).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  it('keeps a successful publication successful if the artifact write fails', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('precompute exited');
    });
    fetchNeutralOverlay.mockResolvedValue({ meta: { sha256: 'published-overlay' } });
    publishCatalog.mockResolvedValue({ catalogRelease: { entries: {} } });
    writeFile.mockRejectedValue(new Error('Disk unavailable'));
    await import('../run');
    expect(publishCatalog).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });
});
