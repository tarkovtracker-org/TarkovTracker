// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { reactive, readonly } from 'vue';
import {
  hasCachedGameDataStrings,
  invalidateGameDataStrings,
  localizeMetadata,
} from '@/utils/metadataLocalization';
import * as cache from '@/utils/tarkovCache';
import { createDeferred } from '@/utils/test-helpers';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
describe('metadata string cache', () => {
  beforeEach(() => {
    vi.spyOn(cache, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cache, 'setCachedData').mockResolvedValue();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('fences a persistent string write that finishes after the owner is invalidated', async () => {
    const owner = {};
    const key = '@tt:regular:items:name';
    const commit = createDeferred<undefined>();
    const finished = createDeferred<undefined>();
    const persisted: unknown[] = [];
    vi.mocked(cache.setCachedData).mockImplementation(
      async (_type, _key, _language, data, _ttl, isCurrent) => {
        await commit.promise;
        if (isCurrent?.() ?? true) persisted.push(data);
        finished.resolve(undefined);
      }
    );
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: { strings: { [key]: 'Old' } } }));
    expect(await localizeMetadata(owner, { name: key }, 'en')).toEqual({ name: 'Old' });
    invalidateGameDataStrings(owner);
    commit.resolve(undefined);
    await finished.promise;
    expect(persisted).toEqual([]);
  });
  it('refreshes an older cached table once when a new neutral catalog references a new key', async () => {
    const owner = {};
    const first = '@tt:regular:items:first';
    const added = '@tt:regular:items:added';
    vi.mocked(cache.getCachedData).mockResolvedValue({ [first]: 'First' });
    const fetch = vi
      .fn()
      .mockResolvedValue({ data: { strings: { [first]: 'First', [added]: 'Added' } } });
    vi.stubGlobal('$fetch', fetch);
    expect(await localizeMetadata(owner, { name: first }, 'en')).toEqual({ name: 'First' });
    expect(fetch).not.toHaveBeenCalled();
    const views = await Promise.all([
      localizeMetadata(owner, { name: added }, 'en'),
      localizeMetadata(owner, { shortName: added }, 'en'),
    ]);
    expect(views).toEqual([{ name: 'Added' }, { shortName: 'Added' }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a complete refresh that still omits a referenced key', async () => {
    vi.mocked(cache.getCachedData).mockResolvedValue({});
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: { strings: {} } }));
    await expect(localizeMetadata({}, { name: '@tt:regular:items:absent' }, 'en')).rejects.toThrow(
      'Missing game data string'
    );
    expect($fetch).toHaveBeenCalledTimes(1);
  });
  it('checks cached language eligibility without a network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('$fetch', fetch);
    expect(await hasCachedGameDataStrings({}, 'de')).toBe(false);
    vi.mocked(cache.getCachedData).mockResolvedValue({ '@tt:regular:items:name': 'Name' });
    expect(await hasCachedGameDataStrings({}, 'de')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('shares a table across reactive owners and independent abort signals', async () => {
    const owner = {};
    const key = '@tt:regular:items:name';
    const response = createDeferred<{ data: { strings: Record<string, string> } }>();
    const fetch = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal('$fetch', fetch);
    const firstController = new AbortController();
    const first = localizeMetadata(reactive(owner), { name: key }, 'en', firstController.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = localizeMetadata(
      readonly(owner),
      { name: key },
      'en',
      new AbortController().signal
    );
    const unowned = localizeMetadata(owner, { name: key }, 'en');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    firstController.abort();
    await rejected;
    response.resolve({ data: { strings: { [key]: 'Shared' } } });
    expect(await second).toEqual({ name: 'Shared' });
    expect(await unowned).toEqual({ name: 'Shared' });
    expect(await localizeMetadata(reactive(owner), { name: key }, 'en')).toEqual({
      name: 'Shared',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps a superseded table from replacing the refreshed memory or persistent table', async () => {
    const owner = {};
    const key = '@tt:regular:items:name';
    const first = createDeferred<{ data: { strings: Record<string, string> } }>();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ data: { strings: { [key]: 'New' } } });
    vi.stubGlobal('$fetch', fetch);
    const old = localizeMetadata(owner, { name: key }, 'en');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    invalidateGameDataStrings(owner);
    expect(await localizeMetadata(owner, { name: key }, 'en')).toEqual({ name: 'New' });
    first.resolve({ data: { strings: { [key]: 'Old' } } });
    await old;
    expect(await localizeMetadata(owner, { name: key }, 'en')).toEqual({ name: 'New' });
    expect(cache.setCachedData).toHaveBeenCalledTimes(1);
    expect(cache.setCachedData).toHaveBeenCalledWith(
      'strings',
      'strings-v1',
      'en',
      {
        [key]: 'New',
      },
      undefined,
      expect.any(Function)
    );
  });
});
