import { useTarkovStore } from '@/stores/useTarkov';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
type Need = NeededItemTaskObjective | NeededItemHideoutModule;
export const neededCountOf = (need: Need) => need.count || 1;
export const useNeededItemProgress = () => {
  const tarkovStore = useTarkovStore();
  const storedCountOf = (need: Need) =>
    need.needType === 'taskObjective'
      ? tarkovStore.getObjectiveCount(need.id)
      : tarkovStore.getHideoutPartCount(need.id);
  const syncPartCompletion = (need: NeededItemHideoutModule, count: number) => {
    const shouldBeComplete = count >= neededCountOf(need);
    if (shouldBeComplete === tarkovStore.isHideoutPartComplete(need.id)) return;
    if (shouldBeComplete) tarkovStore.setHideoutPartComplete(need.id);
    else tarkovStore.setHideoutPartUncomplete(need.id);
  };
  const setCount = (need: Need, count: number) => {
    if (need.needType === 'taskObjective') {
      tarkovStore.setObjectiveCount(need.id, count);
      return;
    }
    tarkovStore.setHideoutPartCount(need.id, count);
    syncPartCompletion(need, count);
  };
  const increase = (need: Need, current = storedCountOf(need)) => {
    if (current < neededCountOf(need)) setCount(need, current + 1);
  };
  const decrease = (need: Need, current = storedCountOf(need)) => {
    if (current > 0) setCount(need, current - 1);
  };
  const toggle = (need: Need, current = storedCountOf(need)) => {
    const needed = neededCountOf(need);
    setCount(need, current >= needed ? Math.max(0, needed - 1) : needed);
  };
  return { storedCountOf, setCount, increase, decrease, toggle };
};
