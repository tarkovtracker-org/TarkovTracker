import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import { sortTasksByProgression } from '@/utils/taskSorter';
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
  const progressStore = useProgressStore();
  function getObjectiveCurrentCount(
    objective: NeededItemTaskObjective | NeededItemHideoutModule
  ): number {
    if (objective.needType === 'taskObjective') {
      return tarkovStore.getObjectiveCount(objective.id) ?? 0;
    }
    return tarkovStore.getHideoutPartCount(objective.id) ?? 0;
  }
  function sortTaskObjectives(objectives: NeededItemTaskObjective[]): NeededItemTaskObjective[] {
    const taskKey = (objective: NeededItemTaskObjective) =>
      `${objective.taskId}:${objective.teamId ?? 'self'}`;
    const evaluations: import('@/stores/taskAvailability').TaskEvaluationMap = {};
    const objectiveTeamIndex = (objective: NeededItemTaskObjective) =>
      objective.teamId ? progressStore.getTeamIndex(objective.teamId) : 'self';
    const tasks = objectives.flatMap((objective) => {
      const task = metadataStore.getTaskById(objective.taskId);
      const id = taskKey(objective);
      const teamIndex = objectiveTeamIndex(objective);
      const evaluation = progressStore.taskEvaluations[objective.taskId]?.[teamIndex];
      if (evaluation) evaluations[id] = { self: evaluation };
      return task ? [{ ...task, id }] : [];
    });
    const order = new Map(
      sortTasksByProgression(tasks, 'asc', evaluations).map((task, index) => [task.id, index])
    );
    return [...objectives].sort((a, b) => {
      const taskA = metadataStore.getTaskById(a.taskId);
      const taskB = metadataStore.getTaskById(b.taskId);
      const kappaA = taskA?.kappaRequired ? 0 : 1;
      const kappaB = taskB?.kappaRequired ? 0 : 1;
      if (kappaA !== kappaB) return kappaA - kappaB;
      return (
        (order.get(taskKey(a)) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(taskKey(b)) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)
      );
    });
  }
  function sortHideoutModules(modules: NeededItemHideoutModule[]): NeededItemHideoutModule[] {
    return [...modules].sort((a, b) => {
      return a.hideoutModule.level - b.hideoutModule.level;
    });
  }
  type NeedEntry = NeededItemTaskObjective | NeededItemHideoutModule;
  type ItemPool = { fir: number; nonFir: number };
  const takeFir = (pool: ItemPool, needed: number): number => {
    const taken = Math.min(needed, pool.fir);
    pool.fir -= taken;
    return taken;
  };
  const takeNonFirThenFir = (pool: ItemPool, needed: number): number => {
    const taken = Math.min(needed, pool.nonFir);
    pool.nonFir -= taken;
    return taken + takeFir(pool, needed - taken);
  };
  const takeFor = (need: NeedEntry, pool: ItemPool): number =>
    need.foundInRaid ? takeFir(pool, need.count) : takeNonFirThenFir(pool, need.count);
  const firFirst = <T extends NeedEntry>(needs: T[]): T[] => [
    ...needs.filter((need) => need.foundInRaid),
    ...needs.filter((need) => !need.foundInRaid),
  ];
  /**
   * Distributes the total collected FIR / non-FIR counts across the needs from
   * scratch (task FIR, task non-FIR, hideout FIR, hideout non-FIR; non-FIR needs
   * fall back to FIR items). Counts are totals, not additions to current
   * progress, so re-running with the same totals is idempotent (#867). Only
   * needs whose count changes produce an update.
   */
  function distributeItems(
    firCount: number,
    nonFirCount: number,
    taskObjectives: NeededItemTaskObjective[],
    hideoutModules: NeededItemHideoutModule[]
  ): DistributionResult {
    const pool: ItemPool = { fir: firCount, nonFir: nonFirCount };
    const ordered: NeedEntry[] = [
      ...firFirst(sortTaskObjectives(taskObjectives)),
      ...firFirst(sortHideoutModules(hideoutModules)),
    ];
    const updates: ObjectiveUpdate[] = [];
    for (const need of ordered) {
      const count = takeFor(need, pool);
      if (count === getObjectiveCurrentCount(need)) continue;
      const type = need.needType === 'taskObjective' ? 'task' : 'hideout';
      updates.push({ id: need.id, type, count, needed: need.count });
    }
    return { updates, remainingFir: pool.fir, remainingNonFir: pool.nonFir };
  }
  function applyDistribution(result: DistributionResult): void {
    if (result.updates.length === 0) return;
    const taskObjectiveUpdates: Record<string, { count: number; complete?: boolean }> = {};
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
        taskObjectiveUpdates[update.id] = {
          count: Math.max(0, update.count),
          ...(update.count < update.needed && { complete: false }),
        };
      } else {
        hideoutPartUpdates[update.id] = entry;
      }
    }
    try {
      tarkovStore.$patch((state) => {
        const currentData = state[state.currentGameMode];
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
      throw new Error('Failed to update progress data', { cause: error });
    }
  }
  function resetObjectives(
    taskObjectives: NeededItemTaskObjective[],
    hideoutModules: NeededItemHideoutModule[]
  ): void {
    if (taskObjectives.length === 0 && hideoutModules.length === 0) return;
    tarkovStore.$patch((state) => {
      const currentData = state[state.currentGameMode];
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
