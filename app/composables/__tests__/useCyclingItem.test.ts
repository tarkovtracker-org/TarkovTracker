import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useCyclingItem } from '@/composables/useCyclingItem';
import type { TarkovItem } from '@/types/tarkov';
const makeItem = (id: string): TarkovItem => ({ id, name: `Item ${id}` }) as TarkovItem;
describe('useCyclingItem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('returns the primary item and does not cycle for a single item', () => {
    const primary = makeItem('a');
    const { currentItem, isCycling, total } = useCyclingItem([makeItem('a')], primary);
    expect(isCycling.value).toBe(false);
    expect(total.value).toBe(1);
    expect(currentItem.value?.id).toBe('a');
    vi.advanceTimersByTime(20000);
    expect(currentItem.value?.id).toBe('a');
  });
  it('returns the primary item when the accepted list is empty', () => {
    const primary = makeItem('primary');
    const { currentItem, isCycling } = useCyclingItem([], primary);
    expect(isCycling.value).toBe(false);
    expect(currentItem.value?.id).toBe('primary');
  });
  it('cycles through accepted items on the interval', async () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const { currentItem, isCycling, currentIndex } = useCyclingItem(items, () => items[0] ?? null, {
      intervalMs: 1000,
    });
    await nextTick();
    expect(isCycling.value).toBe(true);
    expect(currentItem.value?.id).toBe('a');
    vi.advanceTimersByTime(1000);
    expect(currentIndex.value).toBe(1);
    expect(currentItem.value?.id).toBe('b');
    vi.advanceTimersByTime(1000);
    expect(currentItem.value?.id).toBe('c');
    // Wraps back to the start.
    vi.advanceTimersByTime(1000);
    expect(currentItem.value?.id).toBe('a');
  });
  it('pauses cycling and resets to primary when disabled', async () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const enabled = ref(true);
    const { currentItem, isCycling, currentIndex } = useCyclingItem(items, () => items[0] ?? null, {
      intervalMs: 1000,
      enabled,
    });
    await nextTick();
    vi.advanceTimersByTime(1000);
    expect(currentItem.value?.id).toBe('b');
    enabled.value = false;
    await nextTick();
    expect(isCycling.value).toBe(false);
    expect(currentIndex.value).toBe(0);
    expect(currentItem.value?.id).toBe('a');
    // No further advancement while disabled.
    vi.advanceTimersByTime(5000);
    expect(currentItem.value?.id).toBe('a');
  });
  it('exposes hasAlternatives independent of motion/enabled state', async () => {
    const items = [makeItem('a'), makeItem('b')];
    const enabled = ref(false);
    const { hasAlternatives, isCycling } = useCyclingItem(items, () => items[0] ?? null, {
      enabled,
    });
    await nextTick();
    // Alternatives exist even though rotation is disabled.
    expect(hasAlternatives.value).toBe(true);
    expect(isCycling.value).toBe(false);
  });
  it('does not cycle when the user prefers reduced motion', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      const items = [makeItem('a'), makeItem('b'), makeItem('c')];
      const { currentItem, isCycling, hasAlternatives } = useCyclingItem(
        items,
        () => items[0] ?? null,
        { intervalMs: 1000 }
      );
      await nextTick();
      expect(hasAlternatives.value).toBe(true);
      expect(isCycling.value).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(currentItem.value?.id).toBe('a');
    } finally {
      window.matchMedia = original;
    }
  });
  it('keeps the index within bounds when the list shrinks', async () => {
    const items = ref([makeItem('a'), makeItem('b'), makeItem('c')]);
    const { currentItem, currentIndex } = useCyclingItem(items, () => items.value[0] ?? null, {
      intervalMs: 1000,
    });
    await nextTick();
    vi.advanceTimersByTime(2000);
    expect(currentIndex.value).toBe(2);
    expect(currentItem.value?.id).toBe('c');
    items.value = [makeItem('a')];
    await nextTick();
    // Falls back to the primary item; no out-of-bounds access.
    expect(currentItem.value?.id).toBe('a');
  });
});
