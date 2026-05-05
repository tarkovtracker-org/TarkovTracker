// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import * as cacheUtils from '@/utils/tarkovCache';
import { createDeferred } from '@/utils/test-helpers';
import type {
  TarkovBootstrapQueryResult,
  TarkovItem,
  TarkovItemsQueryResult,
  TarkovTasksCoreQueryResult,
} from '@/types/tarkov';
const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
const createItem = (id: string, name: string): TarkovItem =>
  ({
    id,
    name,
    shortName: name,
  }) as TarkovItem;
const bootstrapData = (level: number): TarkovBootstrapQueryResult => ({
  playerLevels: [{ exp: 0, level, levelBadgeImageLink: '' }],
});
const tasksCoreData = (taskId: string): TarkovTasksCoreQueryResult => ({
  maps: [],
  tasks: [{ id: taskId, name: taskId }] as TarkovTasksCoreQueryResult['tasks'],
  traders: [],
});
describe('useMetadataStore fetchItemsData', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('does not reuse or apply an in-flight lite items response after a locale switch', async () => {
    const store = useMetadataStore();
    const enResponse = createDeferred<{ data: TarkovItemsQueryResult }>();
    const deResponse = createDeferred<{ data: TarkovItemsQueryResult }>();
    const fetchMock = vi.fn((_: string, options?: { query?: Record<string, string> }) => {
      return options?.query?.lang === 'de' ? deResponse.promise : enResponse.promise;
    });
    vi.stubGlobal('$fetch', fetchMock);
    store.itemsLanguage = 'stale';
    const enRequest = store.fetchItemsLiteData();
    await flushPromises();
    store.languageCode = 'de';
    const deRequest = store.fetchItemsLiteData();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.itemsLoading).toBe(true);
    enResponse.resolve({ data: { items: [createItem('en-item', 'English item')] } });
    await enRequest;
    expect(store.itemsLanguage).toBe('stale');
    expect(store.items).toEqual([]);
    expect(store.itemsLoading).toBe(true);
    deResponse.resolve({ data: { items: [createItem('de-item', 'German item')] } });
    await deRequest;
    expect(store.items.map((item) => item.id)).toEqual(['de-item']);
    expect(store.itemsLanguage).toBe('de');
    expect(store.itemsGameMode).toBe('regular');
    expect(store.itemsFullLoaded).toBe(false);
    expect(store.itemsLoading).toBe(false);
  });
  it('does not reuse or apply an in-flight full items response after a locale switch', async () => {
    const store = useMetadataStore();
    const enResponse = createDeferred<{ data: TarkovItemsQueryResult }>();
    const deResponse = createDeferred<{ data: TarkovItemsQueryResult }>();
    const fetchMock = vi.fn((_: string, options?: { query?: Record<string, string> }) => {
      return options?.query?.lang === 'de' ? deResponse.promise : enResponse.promise;
    });
    vi.stubGlobal('$fetch', fetchMock);
    store.itemsLanguage = 'stale';
    const enRequest = store.fetchItemsFullData();
    await flushPromises();
    store.languageCode = 'de';
    const deRequest = store.fetchItemsFullData();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    enResponse.resolve({ data: { items: [createItem('en-item', 'English item')] } });
    await enRequest;
    expect(store.itemsLanguage).toBe('stale');
    expect(store.items).toEqual([]);
    deResponse.resolve({ data: { items: [createItem('de-item', 'German item')] } });
    await deRequest;
    expect(store.items.map((item) => item.id)).toEqual(['de-item']);
    expect(store.itemsLanguage).toBe('de');
    expect(store.itemsGameMode).toBe('regular');
    expect(store.itemsFullLoaded).toBe(true);
  });
  it('does not let a stale item request set the active error state', async () => {
    const store = useMetadataStore();
    const enResponse = createDeferred<{ data: TarkovItemsQueryResult }>();
    const deResponse = createDeferred<{ data: TarkovItemsQueryResult }>();
    const fetchMock = vi.fn((_: string, options?: { query?: Record<string, string> }) => {
      return options?.query?.lang === 'de' ? deResponse.promise : enResponse.promise;
    });
    vi.stubGlobal('$fetch', fetchMock);
    const enRequest = store.fetchItemsLiteData();
    await flushPromises();
    store.languageCode = 'de';
    const deRequest = store.fetchItemsLiteData();
    await flushPromises();
    enResponse.reject(new Error('old locale failed'));
    await enRequest;
    expect(store.itemsError).toBeNull();
    expect(store.itemsLoading).toBe(true);
    deResponse.resolve({ data: { items: [createItem('de-item', 'German item')] } });
    await deRequest;
    expect(store.itemsError).toBeNull();
    expect(store.items.map((item) => item.id)).toEqual(['de-item']);
  });
  it('does not apply an older same-context force refresh after a newer invocation starts', async () => {
    const store = useMetadataStore();
    const firstResponse = createDeferred<{ data: TarkovBootstrapQueryResult }>();
    const secondResponse = createDeferred<{ data: TarkovBootstrapQueryResult }>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    vi.stubGlobal('$fetch', fetchMock);
    const processSpy = vi.spyOn(store, 'processBootstrapData').mockImplementation(() => undefined);
    const firstRequest = store.fetchBootstrapData(true);
    await flushPromises();
    const secondRequest = store.fetchBootstrapData(true);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    firstResponse.resolve({ data: bootstrapData(1) });
    await firstRequest;
    expect(processSpy).not.toHaveBeenCalled();
    secondResponse.resolve({ data: bootstrapData(2) });
    await secondRequest;
    expect(processSpy).toHaveBeenCalledOnce();
    expect(processSpy).toHaveBeenCalledWith(bootstrapData(2));
  });
  it('does not reuse or apply an in-flight task core response after a locale switch', async () => {
    const store = useMetadataStore();
    const enResponse = createDeferred<{ data: TarkovTasksCoreQueryResult }>();
    const deResponse = createDeferred<{ data: TarkovTasksCoreQueryResult }>();
    const fetchMock = vi.fn((_: string, options?: { query?: Record<string, string> }) => {
      return options?.query?.lang === 'de' ? deResponse.promise : enResponse.promise;
    });
    vi.stubGlobal('$fetch', fetchMock);
    const processSpy = vi.spyOn(store, 'processTasksCoreData').mockImplementation(() => undefined);
    const enRequest = store.fetchTasksCoreData();
    await flushPromises();
    store.languageCode = 'de';
    const deRequest = store.fetchTasksCoreData();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    enResponse.resolve({ data: tasksCoreData('en-task') });
    await enRequest;
    expect(processSpy).not.toHaveBeenCalled();
    expect(store.loading).toBe(true);
    deResponse.resolve({ data: tasksCoreData('de-task') });
    await deRequest;
    expect(processSpy).toHaveBeenCalledOnce();
    expect(processSpy).toHaveBeenCalledWith(tasksCoreData('de-task'));
    expect(store.loading).toBe(false);
  });
  it('does not let a stale task core error reset active state', async () => {
    const store = useMetadataStore();
    const enResponse = createDeferred<{ data: TarkovTasksCoreQueryResult }>();
    const deResponse = createDeferred<{ data: TarkovTasksCoreQueryResult }>();
    const fetchMock = vi.fn((_: string, options?: { query?: Record<string, string> }) => {
      return options?.query?.lang === 'de' ? deResponse.promise : enResponse.promise;
    });
    vi.stubGlobal('$fetch', fetchMock);
    const processSpy = vi.spyOn(store, 'processTasksCoreData').mockImplementation(() => undefined);
    const resetSpy = vi.spyOn(store, 'resetTasksData');
    const enRequest = store.fetchTasksCoreData();
    await flushPromises();
    store.languageCode = 'de';
    const deRequest = store.fetchTasksCoreData();
    await flushPromises();
    enResponse.reject(new Error('old locale failed'));
    await enRequest;
    expect(store.error).toBeNull();
    expect(resetSpy).not.toHaveBeenCalled();
    expect(store.loading).toBe(true);
    deResponse.resolve({ data: tasksCoreData('de-task') });
    await deRequest;
    expect(processSpy).toHaveBeenCalledOnce();
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });
});
