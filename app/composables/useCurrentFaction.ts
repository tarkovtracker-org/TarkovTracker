import { useTarkovStore } from '@/stores/useTarkov';
import type { PMCFaction } from '@/utils/constants';
export function useCurrentFaction() {
  const tarkovStore = useTarkovStore();
  return computed<PMCFaction>({
    get: () => tarkovStore.getPMCFaction(),
    set: (faction) => tarkovStore.setPMCFaction(faction),
  });
}
