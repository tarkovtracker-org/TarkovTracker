import {
  lowestNetCost,
  netCostOf,
  suggestBalance,
  type ModifierDisplay,
} from '@/features/seasonal-modifiers/planner';
export function useModifierPlanner(items: ComputedRef<ModifierDisplay[]>) {
  const selected = reactive(new Set<string>());
  const picked = computed(() => items.value.filter((item) => selected.has(item.id)));
  const available = computed(() => items.value.filter((item) => !selected.has(item.id)));
  const spent = computed(() => netCostOf(picked.value.filter((item) => item.netCost > 0)));
  const earned = computed(() => -netCostOf(picked.value.filter((item) => item.netCost < 0)));
  const net = computed(() => spent.value - earned.value);
  const floor = computed(() => lowestNetCost(net.value, available.value));
  const suggestion = computed(() => suggestBalance(net.value, available.value));
  const blocked = ref<{ name: string; attempted: number; minimum: number } | null>(null);
  function toggle(item: ModifierDisplay, event: Event) {
    blocked.value = null;
    if (selected.delete(item.id)) return;
    const input = event.target as HTMLInputElement;
    const minimum = floor.value + Math.max(item.netCost, 0);
    if (minimum > 0) {
      input.checked = false;
      blocked.value = { name: item.name, attempted: net.value + item.netCost, minimum };
      return;
    }
    selected.add(item.id);
  }
  function clear() {
    selected.clear();
    blocked.value = null;
  }
  function applySuggestion() {
    for (const item of suggestion.value.additions) selected.add(item.id);
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
    toggle,
    clear,
    applySuggestion,
  };
}
