// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { logger } from '@/utils/logger';
import { claimMetadataCacheWrite } from '@/utils/metadataLocalization';
import { getCachedData, setCachedData } from '@/utils/tarkovCache';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
afterEach(() => vi.unstubAllGlobals());
it('checks write ownership after opening IndexedDB and preserves the newest cached catalog', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const owner = {};
  const oldClaim = claimMetadataCacheWrite(owner, 'tasks-core/neutral-v1-regular/en');
  const old = setCachedData(
    'tasks-core',
    'neutral-v1-regular',
    'en',
    { name: 'Old' },
    60_000,
    oldClaim
  );
  const currentClaim = claimMetadataCacheWrite(owner, 'tasks-core/neutral-v1-regular/en');
  await old;
  expect(await getCachedData('tasks-core', 'neutral-v1-regular', 'en')).toBeNull();
  expect(logger.debug).not.toHaveBeenCalledWith(
    '[TarkovCache] Cache STORED: tarkov-tasks-core-neutral-v1-regular-en'
  );
  await setCachedData(
    'tasks-core',
    'neutral-v1-regular',
    'en',
    { name: 'Current' },
    60_000,
    currentClaim
  );
  await setCachedData('tasks-core', 'neutral-v1-regular', 'en', { name: 'Old' }, 60_000, oldClaim);
  expect(await getCachedData('tasks-core', 'neutral-v1-regular', 'en')).toEqual({
    name: 'Current',
  });
  expect(
    vi
      .mocked(logger.debug)
      .mock.calls.filter(
        ([message]) =>
          message === '[TarkovCache] Cache STORED: tarkov-tasks-core-neutral-v1-regular-en'
      )
  ).toHaveLength(1);
});
