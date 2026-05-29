import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import type { Task, Trader } from '@/types/tarkov';
export type KappaTaskStatus = 'available' | 'complete' | 'failed' | 'locked';
export type KappaTabKey = 'kappa' | 'lightkeeper';
export type KappaRowEntry = {
  task: Task;
  status: KappaTaskStatus;
  lockedBy?: { id: string; name?: string };
};
export type KappaTraderGroupEntry = {
  trader: Pick<Trader, 'id' | 'name' | 'normalizedName' | 'imageLink'>;
  rows: KappaRowEntry[];
  totalCount: number;
  completedCount: number;
};
const OTHER_GROUP_ID = '__other__';
const taskFilterFor = (tab: KappaTabKey) =>
  tab === 'kappa'
    ? (task: Task) => task.kappaRequired === true
    : (task: Task) => task.lightkeeperRequired === true;
export function useKappaOverview(tab: () => KappaTabKey) {
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const progressStore = useProgressStore();
  const sourceTasks = computed(() => metadataStore.tasks.filter(taskFilterFor(toValue(tab))));
  const tasksWithStatus = computed<KappaRowEntry[]>(() => {
    const unlocked = progressStore.unlockedTasks;
    const tasksById = new Map(metadataStore.tasks.map((task) => [task.id, task]));
    return sourceTasks.value.map((task) => {
      const isComplete = tarkovStore.isTaskComplete(task.id);
      const isFailed = tarkovStore.isTaskFailed(task.id);
      let status: KappaTaskStatus;
      if (isComplete && isFailed) {
        status = 'failed';
      } else if (isComplete) {
        status = 'complete';
      } else if (isFailed) {
        status = 'failed';
      } else if (unlocked[task.id]?.self === true) {
        status = 'available';
      } else {
        status = 'locked';
      }
      let lockedBy: KappaRowEntry['lockedBy'] | undefined;
      if (status === 'locked') {
        for (const requirement of task.taskRequirements ?? []) {
          const requiredId = requirement?.task?.id;
          if (!requiredId) continue;
          if (tarkovStore.isTaskComplete(requiredId)) continue;
          const required = tasksById.get(requiredId);
          lockedBy = {
            id: requiredId,
            name: required?.name ?? requirement.task.name,
          };
          break;
        }
      }
      return { task, status, lockedBy };
    });
  });
  const totals = computed(() => {
    let completed = 0;
    let failed = 0;
    let available = 0;
    let locked = 0;
    for (const row of tasksWithStatus.value) {
      if (row.status === 'complete') completed += 1;
      else if (row.status === 'failed') failed += 1;
      else if (row.status === 'available') available += 1;
      else locked += 1;
    }
    return {
      total: tasksWithStatus.value.length,
      completed,
      failed,
      available,
      locked,
    };
  });
  const groupedByTrader = computed<KappaTraderGroupEntry[]>(() => {
    const orderedTraders = metadataStore.sortedTraders;
    const traderOrder = new Map<string, number>();
    orderedTraders.forEach((trader, index) => traderOrder.set(trader.id, index));
    const groups = new Map<string, KappaTraderGroupEntry>();
    for (const row of tasksWithStatus.value) {
      const traderId = row.task.trader?.id ?? OTHER_GROUP_ID;
      const existing = groups.get(traderId);
      if (existing) {
        existing.rows.push(row);
        existing.totalCount += 1;
        if (row.status === 'complete') existing.completedCount += 1;
        continue;
      }
      const traderRef = row.task.trader;
      groups.set(traderId, {
        trader: {
          id: traderId,
          name: traderRef?.name ?? 'Other',
          normalizedName: traderRef?.normalizedName,
          imageLink: traderRef?.imageLink,
        },
        rows: [row],
        totalCount: 1,
        completedCount: row.status === 'complete' ? 1 : 0,
      });
    }
    /**
     * Sort each trader column purely by required player level (then name as a
     * stable tiebreak). This matches the reference spreadsheet's reading order;
     * dependency-depth was tried first but produced surprising orders such as
     * a Lv 18 prerequisite landing above a Lv 5 follow-up.
     */
    const sortRows = (a: KappaRowEntry, b: KappaRowEntry) => {
      const levelA = a.task.minPlayerLevel ?? 0;
      const levelB = b.task.minPlayerLevel ?? 0;
      if (levelA !== levelB) return levelA - levelB;
      const nameA = a.task.name ?? '';
      const nameB = b.task.name ?? '';
      return nameA.localeCompare(nameB);
    };
    return Array.from(groups.values())
      .map((group) => ({ ...group, rows: [...group.rows].sort(sortRows) }))
      .sort((a, b) => {
        const indexA = traderOrder.get(a.trader.id) ?? Number.MAX_SAFE_INTEGER;
        const indexB = traderOrder.get(b.trader.id) ?? Number.MAX_SAFE_INTEGER;
        if (indexA !== indexB) return indexA - indexB;
        return a.trader.name.localeCompare(b.trader.name);
      });
  });
  return {
    sourceTasks,
    tasksWithStatus,
    totals,
    groupedByTrader,
  };
}
