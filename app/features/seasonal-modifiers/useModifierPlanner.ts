import { useEventListener } from '@vueuse/core';
import {
  readLocalModifierPlan,
  writeGuestModifierPlan,
} from '@/features/seasonal-modifiers/modifierPlanStorage';
import {
  lowestNetCost,
  netCostOf,
  suggestBalance,
  type ModifierDisplay,
} from '@/features/seasonal-modifiers/planner';
import { logger } from '@/utils/logger';
import { seasonTwoModifiersStorageKey } from '@/utils/storageKeys';
import type { useAccountModifierPlanStore } from '@/features/seasonal-modifiers/accountModifierPlan';
type AccountPlan = Pick<
  ReturnType<typeof useAccountModifierPlanStore>,
  'modifierIds' | 'status' | 'saving' | 'saveFailed' | 'load' | 'save' | 'retrySave'
>;
export function useModifierPlanner(
  items: ComputedRef<ModifierDisplay[]>,
  userId: Readonly<Ref<string | null>>,
  account: AccountPlan
) {
  const guestIds = shallowRef<string[]>([]);
  const guestSaveFailed = ref(false);
  const selectedIds = computed(() => new Set(userId.value ? account.modifierIds : guestIds.value));
  const status = computed(() => (userId.value ? account.status : 'ready'));
  const saving = computed(() => !!userId.value && account.saving);
  const saveFailed = computed(() => (userId.value ? account.saveFailed : guestSaveFailed.value));
  const picked = computed(() => items.value.filter((item) => selectedIds.value.has(item.id)));
  const selected = computed(() => new Set(picked.value.map((item) => item.id)));
  const available = computed(() => items.value.filter((item) => !selectedIds.value.has(item.id)));
  const spent = computed(() => netCostOf(picked.value.filter((item) => item.netCost > 0)));
  const earned = computed(() => -netCostOf(picked.value.filter((item) => item.netCost < 0)));
  const net = computed(() => spent.value - earned.value);
  const floor = computed(() => lowestNetCost(net.value, available.value));
  const suggestion = computed(() => suggestBalance(net.value, available.value));
  const blocked = ref<{ name: string; attempted: number; minimum: number } | null>(null);
  function restoreGuest() {
    guestIds.value = readLocalModifierPlan();
    guestSaveFailed.value = false;
    blocked.value = null;
  }
  onMounted(() => {
    watch(
      userId,
      (owner) => {
        blocked.value = null;
        if (owner) void account.load();
        else restoreGuest();
      },
      { immediate: true, flush: 'sync' }
    );
  });
  useEventListener('storage', (event) => {
    if (userId.value || guestSaveFailed.value) return;
    if (event.key === seasonTwoModifiersStorageKey(null) || event.key === null) restoreGuest();
  });
  function saveGuest(ids: string[]) {
    guestIds.value = ids;
    try {
      writeGuestModifierPlan(ids);
      guestSaveFailed.value = false;
    } catch (error) {
      guestSaveFailed.value = true;
      logger.warn('[ModifierPlanner] Could not save modifier selections', error);
    }
  }
  function saveSelection(ids: Set<string>) {
    if (userId.value) account.save([...ids]);
    else saveGuest([...ids]);
  }
  function retrySave() {
    if (userId.value) void account.retrySave();
    else saveGuest(guestIds.value);
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
    status,
    saving,
    saveFailed,
    reloadPlan: account.load,
    retrySave,
    toggle,
    clear,
    applySuggestion,
  };
}
