import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
export interface ObjectiveUpdate {
  id: string;
  type: 'task' | 'hideout';
  count: number;
  needed: number;
}
export interface DistributionResult {
  updates: ObjectiveUpdate[];
  remainingFir: number;
  remainingNonFir: number;
}
export type UseItemDistributionReturn = {
  distributeItems: (
    firCount: number,
    nonFirCount: number,
    taskObjectives: NeededItemTaskObjective[],
    hideoutModules: NeededItemHideoutModule[]
  ) => DistributionResult;
  applyDistribution: (result: DistributionResult) => void;
  resetObjectives: (
    taskObjectives: NeededItemTaskObjective[],
    hideoutModules: NeededItemHideoutModule[]
  ) => void;
  getObjectiveCurrentCount: (
    objective: NeededItemTaskObjective | NeededItemHideoutModule
  ) => number;
  sortTaskObjectives: (objectives: NeededItemTaskObjective[]) => NeededItemTaskObjective[];
  sortHideoutModules: (modules: NeededItemHideoutModule[]) => NeededItemHideoutModule[];
};
export function useItemDistribution(): UseItemDistributionReturn {
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  function getObjectiveCurrentCount(
    objective: NeededItemTaskObjective | NeededItemHideoutModule
  ): number {
    if (objective.needType === 'taskObjective') {
      return tarkovStore.getObjectiveCount(objective.id) ?? 0;
    }
    return tarkovStore.getHideoutPartCount(objective.id) ?? 0;
  }
  function sortTaskObjectives(objectives: NeededItemTaskObjective[]): NeededItemTaskObjective[] {
    return [...objectives].sort((a, b) => {
      const taskA = metadataStore.getTaskById(a.taskId);
      const taskB = metadataStore.getTaskById(b.taskId);
      const kappaA = taskA?.kappaRequired ? 0 : 1;
      const kappaB = taskB?.kappaRequired ? 0 : 1;
      if (kappaA !== kappaB) return kappaA - kappaB;
      const levelA = taskA?.minPlayerLevel ?? 999;
      const levelB = taskB?.minPlayerLevel ?? 999;
      return levelA - levelB;
    });
  }
  function sortHideoutModules(modules: NeededItemHideoutModule[]): NeededItemHideoutModule[] {
    return [...modules].sort((a, b) => {
      return a.hideoutModule.level - b.hideoutModule.level;
    });
  }
  function distributeItems(
    firCount: number,
    nonFirCount: number,
    taskObjectives: NeededItemTaskObjective[],
    hideoutModules: NeededItemHideoutModule[]
  ): DistributionResult {
    const updates: ObjectiveUpdate[] = [];
    const sortedTaskObjectives = sortTaskObjectives(taskObjectives);
    const sortedHideoutModules = sortHideoutModules(hideoutModules);
    let remainingFir = firCount;
    let remainingNonFir = nonFirCount;
    const taskFir = sortedTaskObjectives.filter((o) => o.foundInRaid);
    const taskNonFir = sortedTaskObjectives.filter((o) => !o.foundInRaid);
    const hideoutFir = sortedHideoutModules.filter((m) => m.foundInRaid);
    const hideoutNonFir = sortedHideoutModules.filter((m) => !m.foundInRaid);
    for (const obj of taskFir) {
      const current = getObjectiveCurrentCount(obj);
      const needed = Math.max(0, obj.count - current);
      if (needed > 0 && remainingFir > 0) {
        const toAssign = Math.min(needed, remainingFir);
        updates.push({
          id: obj.id,
          type: 'task',
          count: current + toAssign,
          needed: obj.count,
        });
        remainingFir -= toAssign;
      }
    }
    for (const obj of taskNonFir) {
      const current = getObjectiveCurrentCount(obj);
      const needed = Math.max(0, obj.count - current);
      if (needed > 0) {
        let toAssign = Math.min(needed, remainingNonFir);
        remainingNonFir -= toAssign;
        if (toAssign < needed && remainingFir > 0) {
          const fromFir = Math.min(needed - toAssign, remainingFir);
          toAssign += fromFir;
          remainingFir -= fromFir;
        }
        if (toAssign > 0) {
          updates.push({
            id: obj.id,
            type: 'task',
            count: current + toAssign,
            needed: obj.count,
          });
        }
      }
    }
    for (const mod of hideoutFir) {
      const current = getObjectiveCurrentCount(mod);
      const needed = Math.max(0, mod.count - current);
      if (needed > 0 && remainingFir > 0) {
        const toAssign = Math.min(needed, remainingFir);
        updates.push({
          id: mod.id,
          type: 'hideout',
          count: current + toAssign,
          needed: mod.count,
        });
        remainingFir -= toAssign;
      }
    }
    for (const mod of hideoutNonFir) {
      const current = getObjectiveCurrentCount(mod);
      const needed = Math.max(0, mod.count - current);
      if (needed > 0) {
        let toAssign = Math.min(needed, remainingNonFir);
        remainingNonFir -= toAssign;
        if (toAssign < needed && remainingFir > 0) {
          const fromFir = Math.min(needed - toAssign, remainingFir);
          toAssign += fromFir;
          remainingFir -= fromFir;
        }
        if (toAssign > 0) {
          updates.push({
            id: mod.id,
            type: 'hideout',
            count: current + toAssign,
            needed: mod.count,
          });
        }
      }
    }
    return { updates, remainingFir, remainingNonFir };
  }
  function applyDistribution(result: DistributionResult): void {
    if (result.updates.length === 0) return;
    const taskObjectiveUpdates: Record<string, { count: number }> = {};
    const hideoutPartUpdates: Record<
      string,
      { count: number; complete: boolean; timestamp?: number }
    > = {};
    const now = Date.now();
    for (const update of result.updates) {
      const isComplete = update.count >= update.needed;
      const entry = {
        count: Math.max(0, update.count),
        complete: isComplete,
        ...(isComplete && { timestamp: now }),
      };
      if (update.type === 'task') {
        taskObjectiveUpdates[update.id] = { count: Math.max(0, update.count) };
      } else {
        hideoutPartUpdates[update.id] = entry;
      }
    }
    try {
      tarkovStore.$patch((state) => {
        const currentData = state.currentGameMode === 'pve' ? state.pve : state.pvp;
        if (!currentData.taskObjectives) {
          currentData.taskObjectives = {};
        }
        if (!currentData.hideoutParts) {
          currentData.hideoutParts = {};
        }
        for (const [id, updates] of Object.entries(taskObjectiveUpdates)) {
          currentData.taskObjectives[id] = {
            ...currentData.taskObjectives[id],
            ...updates,
          };
        }
        for (const [id, updates] of Object.entries(hideoutPartUpdates)) {
          currentData.hideoutParts[id] = {
            ...currentData.hideoutParts[id],
            ...updates,
          };
        }
      });
    } catch (error) {
      logger.error('[useItemDistribution] Failed to apply distribution:', error);
      throw new Error('Failed to update progress data');
    }
  }
  function resetObjectives(
    taskObjectives: NeededItemTaskObjective[],
    hideoutModules: NeededItemHideoutModule[]
  ): void {
    if (taskObjectives.length === 0 && hideoutModules.length === 0) return;
    tarkovStore.$patch((state) => {
      const currentData = state.currentGameMode === 'pve' ? state.pve : state.pvp;
      if (!currentData.taskObjectives) {
        currentData.taskObjectives = {};
      }
      if (!currentData.hideoutParts) {
        currentData.hideoutParts = {};
      }
      for (const obj of taskObjectives) {
        currentData.taskObjectives[obj.id] = {
          ...currentData.taskObjectives[obj.id],
          count: 0,
        };
      }
      for (const mod of hideoutModules) {
        currentData.hideoutParts[mod.id] = {
          ...currentData.hideoutParts[mod.id],
          count: 0,
          complete: false,
          timestamp: undefined,
        };
      }
    });
  }
  return {
    distributeItems,
    applyDistribution,
    resetObjectives,
    getObjectiveCurrentCount,
    sortTaskObjectives,
    sortHideoutModules,
  };
}
