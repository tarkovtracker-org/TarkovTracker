// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, reactive, ref, unref } from 'vue';
import { createAccountModifierPlan } from '@/features/seasonal-modifiers/accountModifierPlan';
import { useModifierPlanner } from '@/features/seasonal-modifiers/useModifierPlanner';
import { seasonTwoModifiersStorageKey } from '@/utils/storageKeys';
import type { ModifierDisplay } from '@/features/seasonal-modifiers/planner';
const modifier = (id: string, netCost: number): ModifierDisplay => ({
  id,
  name: id,
  effect: '',
  netCost,
  category: 'skills',
});
const perk = modifier('perk', 5);
const drawback = modifier('drawback', -5);
const replacement = modifier('replacement', 3);
function openPlanner(owner = ref<string | null>(null), catalog = ref([perk, drawback])) {
  let planner!: ReturnType<typeof useModifierPlanner>;
  const cloud = new Map<string, string[]>();
  const wrapper = mount(
    defineComponent({
      setup() {
        const account = reactive(
          createAccountModifierPlan(
            owner,
            {
              read: async (id) => cloud.get(id) ?? null,
              initialize: async () => null,
              save: async (id, picks) => {
                cloud.set(id, picks);
              },
            },
            () => []
          )
        );
        planner = useModifierPlanner(
          computed(() => catalog.value),
          owner,
          account
        );
        return () => null;
      },
    })
  );
  return { ...planner, close: () => wrapper.unmount() };
}
function toggle(planner: ReturnType<typeof useModifierPlanner>, item: ModifierDisplay) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.addEventListener('change', (event) => planner.toggle(item, event), { once: true });
  input.dispatchEvent(new Event('change'));
}
describe('seasonal modifier selection persistence', () => {
  beforeEach(() => localStorage.clear());
  it('restores picks when revisiting before the catalog is available', () => {
    const first = openPlanner();
    toggle(first, perk);
    first.applySuggestion();
    first.close();
    const catalog = ref<ModifierDisplay[]>([]);
    const reopened = openPlanner(undefined, catalog);
    expect([...unref(reopened.selected)]).toEqual([]);
    catalog.value = [perk, drawback];
    expect([...unref(reopened.selected)]).toEqual([perk.id, drawback.id]);
    expect(reopened.net.value).toBe(0);
    reopened.close();
  });
  it('restores only current modifiers and remembers deselection and Clear all', () => {
    const first = openPlanner();
    toggle(first, perk);
    first.applySuggestion();
    first.close();
    const catalog = ref([drawback, replacement]);
    const second = openPlanner(undefined, catalog);
    expect([...unref(second.selected)]).toEqual([drawback.id]);
    toggle(second, drawback);
    toggle(second, replacement);
    second.close();
    const third = openPlanner(undefined, catalog);
    expect([...unref(third.selected)]).toEqual([replacement.id]);
    third.clear();
    third.close();
    const fourth = openPlanner();
    expect([...unref(fourth.selected)]).toEqual([]);
    fourth.close();
  });
  it('keeps plans separate when switching accounts and returning as a guest', async () => {
    const owner = ref<string | null>(null);
    const planner = openPlanner(owner);
    toggle(planner, drawback);
    owner.value = 'account-a';
    await flushPromises();
    expect([...unref(planner.selected)]).toEqual([]);
    toggle(planner, perk);
    owner.value = 'account-b';
    await flushPromises();
    expect([...unref(planner.selected)]).toEqual([]);
    owner.value = 'account-a';
    await flushPromises();
    expect([...unref(planner.selected)]).toEqual([perk.id]);
    owner.value = null;
    expect([...unref(planner.selected)]).toEqual([drawback.id]);
    planner.close();
  });
  it('updates an open planner when another tab clears its saved plan', () => {
    const key = seasonTwoModifiersStorageKey(null);
    const planner = openPlanner();
    toggle(planner, drawback);
    localStorage.removeItem(key);
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
    expect([...unref(planner.selected)]).toEqual([]);
    planner.close();
  });
  it('warns when a selection fails to save and retries the same picks', () => {
    const key = seasonTwoModifiersStorageKey(null);
    const planner = openPlanner();
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    toggle(planner, drawback);
    expect(planner.saveFailed.value).toBe(true);
    expect([...unref(planner.selected)]).toEqual([drawback.id]);
    expect(localStorage.getItem(key)).toBeNull();
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
    expect(planner.saveFailed.value).toBe(true);
    expect([...unref(planner.selected)]).toEqual([drawback.id]);
    planner.retrySave();
    expect(planner.saveFailed.value).toBe(false);
    expect(localStorage.getItem(key)).toBe(JSON.stringify([drawback.id]));
    planner.close();
  });
  it('lets users retry a failed Clear all with the current plan empty', () => {
    const key = seasonTwoModifiersStorageKey(null);
    const planner = openPlanner();
    toggle(planner, drawback);
    vi.spyOn(localStorage, 'removeItem').mockImplementationOnce(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    planner.clear();
    expect(planner.saveFailed.value).toBe(true);
    expect([...unref(planner.selected)]).toEqual([]);
    expect(localStorage.getItem(key)).toBe(JSON.stringify([drawback.id]));
    planner.retrySave();
    expect(planner.saveFailed.value).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
    planner.close();
  });
});
