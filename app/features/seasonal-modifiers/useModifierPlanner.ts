import { useEventListener } from '@vueuse/core';
import {
  lowestNetCost,
  netCostOf,
  suggestBalance,
  type ModifierDisplay,
} from '@/features/seasonal-modifiers/planner';
import { logger } from '@/utils/logger';
import { seasonTwoModifiersStorageKey } from '@/utils/storageKeys';
function readSelection(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
export function useModifierPlanner(
  items: ComputedRef<ModifierDisplay[]>,
  userId: Readonly<Ref<string | null>>
) {
  const storageKey = computed(() => seasonTwoModifiersStorageKey(userId.value));
  const selectedIds = ref(new Set<string>());
  const saveFailed = ref(false);
  const picked = computed(() => items.value.filter((item) => selectedIds.value.has(item.id)));
  const selected = computed(() => new Set(picked.value.map((item) => item.id)));
  const available = computed(() => items.value.filter((item) => !selectedIds.value.has(item.id)));
  const spent = computed(() => netCostOf(picked.value.filter((item) => item.netCost > 0)));
  const earned = computed(() => -netCostOf(picked.value.filter((item) => item.netCost < 0)));
  const net = computed(() => spent.value - earned.value);
  const floor = computed(() => lowestNetCost(net.value, available.value));
  const suggestion = computed(() => suggestBalance(net.value, available.value));
  const blocked = ref<{ name: string; attempted: number; minimum: number } | null>(null);
  function restoreSelection() {
    selectedIds.value = new Set(readSelection(storageKey.value));
    saveFailed.value = false;
    blocked.value = null;
  }
  onMounted(() => {
    watch(storageKey, restoreSelection, { immediate: true, flush: 'sync' });
  });
  useEventListener('storage', (event) => {
    if (saveFailed.value) return;
    if (event.key === storageKey.value || event.key === null) restoreSelection();
  });
  function saveSelection(ids: Set<string>) {
    selectedIds.value = ids;
    try {
      if (ids.size) localStorage.setItem(storageKey.value, JSON.stringify([...ids]));
      else localStorage.removeItem(storageKey.value);
      saveFailed.value = false;
    } catch (error) {
      saveFailed.value = true;
      logger.warn('[ModifierPlanner] Could not save modifier selections', error);
    }
  }
  function retrySave() {
    saveSelection(selectedIds.value);
  }
  function toggle(item: ModifierDisplay, event: Event) {
    blocked.value = null;
    const next = new Set(selectedIds.value);
    if (next.delete(item.id)) {
      saveSelection(next);
      return;
    }
    const input = event.target as HTMLInputElement;
    const minimum = floor.value + Math.max(item.netCost, 0);
    if (minimum > 0) {
      input.checked = false;
      blocked.value = { name: item.name, attempted: net.value + item.netCost, minimum };
      return;
    }
    next.add(item.id);
    saveSelection(next);
  }
  function clear() {
    saveSelection(new Set());
    blocked.value = null;
  }
  function applySuggestion() {
    const additions = suggestion.value.additions.map((item) => item.id);
    saveSelection(new Set([...selectedIds.value, ...additions]));
    blocked.value = null;
  }
  return {
    selected,
    spent,
    earned,
    net,
    floor,
    suggestion,
    blocked,
    saveFailed,
    retrySave,
    toggle,
    clear,
    applySuggestion,
  };
}
