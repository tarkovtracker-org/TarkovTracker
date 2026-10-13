// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useRouteSearchQuery } from '@/composables/useRouteSearchQuery';
import { queueQueryWrite } from '@/utils/routeHelpers';
type QueryRecord = Record<string, string | undefined>;
const routeState = reactive({ query: {} as QueryRecord });
const replace = vi.fn(async ({ query }: { query: QueryRecord }) => {
  routeState.query = query;
});
mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useRouter', () => () => ({ replace }));
describe('useRouteSearchQuery', () => {
  beforeEach(() => {
    replace.mockClear();
    routeState.query = {};
  });
  it('writes the query and keeps the other params', async () => {
    routeState.query = { status: 'available' };
    await useRouteSearchQuery().setSearchQuery('mole');
    expect(replace).toHaveBeenCalledWith({ query: { status: 'available', q: 'mole' } });
  });
  it('skips a write that would not change the query', async () => {
    routeState.query = { q: 'mole' };
    await useRouteSearchQuery().setSearchQuery('mole');
    expect(replace).not.toHaveBeenCalled();
    routeState.query = {};
    await useRouteSearchQuery().setSearchQuery('');
    expect(replace).not.toHaveBeenCalled();
  });
  it('runs a write queued behind the search on the query the search landed', async () => {
    replace.mockImplementationOnce(async ({ query }) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      routeState.query = query;
    });
    const search = useRouteSearchQuery().setSearchQuery('mole');
    const status = queueQueryWrite(() =>
      replace({ query: { ...routeState.query, status: 'locked' } })
    );
    await Promise.all([search, status]);
    expect(routeState.query).toEqual({ q: 'mole', status: 'locked' });
  });
  it('reports the queued value before the write lands', async () => {
    let land = () => {};
    replace.mockImplementationOnce(async ({ query }) => {
      await new Promise<void>((resolve) => (land = resolve));
      routeState.query = query;
    });
    const { searchQuery, setSearchQuery } = useRouteSearchQuery();
    const write = setSearchQuery('mole');
    const valueBeforeLanding = searchQuery.value;
    await Promise.resolve();
    land();
    await write;
    expect(valueBeforeLanding).toBe('mole');
    routeState.query = {};
    expect(searchQuery.value).toBe('');
  });
  it('removes an explicit empty q when the search is cleared', async () => {
    routeState.query = { q: '' };
    await useRouteSearchQuery().setSearchQuery('');
    expect(replace).toHaveBeenCalledWith({ query: { q: undefined } });
  });
});
