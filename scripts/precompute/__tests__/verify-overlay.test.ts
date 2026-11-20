import { compareImportCatalog } from '@@/scripts/precompute/verify-overlay';
import { describe, expect, it } from 'vitest';
describe('whole import snapshot release verification', () => {
  const published = { version: 'v1', sha256: 'sha1' };
  const snapshot = (gameMode: string) => ({
    data: { tasks: [{ id: 'task', objectives: [], failConditions: [] }] },
    dataOverlay: published,
    catalog: { lang: 'en', gameMode },
  });
  it.each(['regular', 'pve', 'pvp-season'])(
    'checks the complete %s source against the release',
    (mode) => {
      expect(compareImportCatalog(mode, published, snapshot(mode))).toMatchObject({
        status: 'current',
        taskCount: 1,
      });
      expect(
        compareImportCatalog(mode, { version: 'v2', sha256: 'sha2' }, snapshot(mode))
      ).toMatchObject({ status: 'mismatch' });
    }
  );
  it('cannot certify missing, malformed or wrong-scope imports', () => {
    expect(compareImportCatalog('regular', published, undefined).status).toBe('unverified');
    expect(compareImportCatalog('pve', published, snapshot('regular')).status).toBe('unverified');
    expect(
      compareImportCatalog('regular', published, { ...snapshot('regular'), data: { tasks: [] } })
        .status
    ).toBe('unverified');
  });
});
