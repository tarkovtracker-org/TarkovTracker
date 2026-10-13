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
  it('overrides with all while searching, then the picked tab, and drops both on clear', async () => {
    vi.useFakeTimers();
    const { scope, search } = setup();
    search.pinStatus('locked');
    expect(search.searchStatusOverride.value).toBeNull();
    search.searchQuery.value = 'mole';
    await vi.advanceTimersByTimeAsync(180);
    expect(search.searchStatusOverride.value).toBe('all');
    search.pinStatus('locked');
    expect(search.pinnedStatus.value).toBe('locked');
    expect(search.searchStatusOverride.value).toBe('locked');
    search.searchQuery.value = '';
    await nextTick();
    expect(search.searchStatusOverride.value).toBeNull();
    search.searchQuery.value = 'mole';
    await vi.advanceTimersByTimeAsync(180);
    expect(search.searchStatusOverride.value).toBe('all');
    scope.stop();
  });
  it('applies a tab clicked before the debounced query catches up', async () => {
    vi.useFakeTimers();
    const { scope, search } = setup();
    search.searchQuery.value = 'mole';
    await nextTick();
    search.pinStatus('completed');
    expect(search.searchStatusOverride.value).toBe('completed');
    await vi.advanceTimersByTimeAsync(180);
    expect(search.isSearchActive.value).toBe(true);
    expect(search.searchStatusOverride.value).toBe('completed');
    scope.stop();
  });
  it('keeps the pin while a replacement query is still debouncing', async () => {
    vi.useFakeTimers();
    const { scope, search } = setup();
    search.searchQuery.value = 'mole';
    await vi.advanceTimersByTimeAsync(180);
    search.pinStatus('locked');
    search.searchQuery.value = '   ';
    await nextTick();
    expect(search.isSearchActive.value).toBe(true);
    expect(search.searchStatusOverride.value).toBe('locked');
    await vi.advanceTimersByTimeAsync(180);
    expect(search.searchStatusOverride.value).toBeNull();
    search.searchQuery.value = 'mole';
    await vi.advanceTimersByTimeAsync(180);
    expect(search.searchStatusOverride.value).toBe('all');
    scope.stop();
  });
});
describe('resolveEffectiveSecondaryView', () => {
  it('uses the search override when set', () => {
    expect(resolveEffectiveSecondaryView('all', 'available', 'all')).toBe('all');
    expect(resolveEffectiveSecondaryView('all', 'available', 'locked')).toBe('locked');
  });
  it('uses the saved status without an override, and graph forces all', () => {
    expect(resolveEffectiveSecondaryView('all', 'available', null)).toBe('available');
    expect(resolveEffectiveSecondaryView('graph', 'available', 'locked')).toBe('all');
  });
});
