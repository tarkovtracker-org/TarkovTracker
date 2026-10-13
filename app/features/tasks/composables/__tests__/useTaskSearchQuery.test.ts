import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive } from 'vue';
import {
  resolveEffectiveSecondaryView,
  useTaskSearchQuery,
} from '@/features/tasks/composables/useTaskSearchQuery';
const routeState = reactive({
  query: reactive<Record<string, string | undefined>>({}),
});
mockNuxtImport('useRoute', () => () => routeState);
const setup = () => {
  const scope = effectScope();
  const search = scope.run(() => useTaskSearchQuery())!;
  return { scope, search };
};
describe('useTaskSearchQuery', () => {
  beforeEach(() => {
    routeState.query.q = undefined;
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('applies initial q before any timer and follows route changes after the debounce', async () => {
    vi.useFakeTimers();
    routeState.query.q = '  AlPhA  ';
    const { scope, search } = setup();
    expect(search.searchQuery.value).toBe('  AlPhA  ');
    expect(search.normalizedSearch.value).toBe('alpha');
    expect(search.isSearchActive.value).toBe(true);
    routeState.query.q = 'beta';
    await nextTick();
    expect(search.searchQuery.value).toBe('beta');
    await vi.advanceTimersByTimeAsync(179);
    expect(search.normalizedSearch.value).toBe('alpha');
    await vi.advanceTimersByTimeAsync(1);
    expect(search.normalizedSearch.value).toBe('beta');
    routeState.query.q = undefined;
    await nextTick();
    expect(search.isSearchActive.value).toBe(false);
    search.searchQuery.value = 'beta';
    await nextTick();
    search.cleanup();
    scope.stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(search.normalizedSearch.value).toBe('');
  });
  it('falls back to the first value when route.query.q is an array', () => {
    routeState.query.q = ['foo', 'bar'] as unknown as string;
    const { scope, search } = setup();
    expect(search.searchQuery.value).toBe('foo');
    scope.stop();
  });
  it('searches all statuses until a status is pinned, and resets the pin on clear', async () => {
    vi.useFakeTimers();
    const { scope, search } = setup();
    search.pinStatus();
    expect(search.searchesAllStatuses.value).toBe(false);
    search.searchQuery.value = 'mole';
    await vi.advanceTimersByTimeAsync(180);
    expect(search.searchesAllStatuses.value).toBe(true);
    search.pinStatus();
    expect(search.searchesAllStatuses.value).toBe(false);
    search.searchQuery.value = '';
    await nextTick();
    search.searchQuery.value = 'mole';
    await vi.advanceTimersByTimeAsync(180);
    expect(search.searchesAllStatuses.value).toBe(true);
    scope.stop();
  });
  it('pins a tab clicked before the debounced query catches up', async () => {
    vi.useFakeTimers();
    const { scope, search } = setup();
    search.searchQuery.value = 'mole';
    await nextTick();
    search.pinStatus();
    await vi.advanceTimersByTimeAsync(180);
    expect(search.isSearchActive.value).toBe(true);
    expect(search.searchesAllStatuses.value).toBe(false);
    search.searchQuery.value = '';
    await nextTick();
    search.searchQuery.value = 'mole';
    await vi.advanceTimersByTimeAsync(180);
    expect(search.searchesAllStatuses.value).toBe(true);
    scope.stop();
  });
});
describe('useTaskSearchQuery pin lifetime', () => {
  it('keeps the pin while a replacement query is still debouncing', async () => {
    vi.useFakeTimers();
    routeState.query.q = undefined;
    const { scope, search } = setup();
    search.searchQuery.value = 'mole';
    await vi.advanceTimersByTimeAsync(180);
    search.pinStatus();
    search.searchQuery.value = '   ';
    await nextTick();
    expect(search.isSearchActive.value).toBe(true);
    expect(search.searchesAllStatuses.value).toBe(false);
    await vi.advanceTimersByTimeAsync(180);
    expect(search.isSearchActive.value).toBe(false);
    search.searchQuery.value = 'mole';
    await vi.advanceTimersByTimeAsync(180);
    expect(search.searchesAllStatuses.value).toBe(true);
    scope.stop();
  });
});
describe('resolveEffectiveSecondaryView', () => {
  it('widens to all while searching unpinned', () => {
    expect(resolveEffectiveSecondaryView('all', 'available', true)).toBe('all');
  });
  it('restores the stored status when not searching all statuses', () => {
    expect(resolveEffectiveSecondaryView('all', 'available', false)).toBe('available');
    expect(resolveEffectiveSecondaryView('all', 'locked', false)).toBe('locked');
  });
});
