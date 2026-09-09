import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { sortTasksByProgression } from '@/utils/taskSorter';
import { isTaskCounted, isTaskRelevant } from '@/utils/taskStatus';
import type { Task, Trader } from '@/types/tarkov';
export type KappaTaskStatus = 'available' | 'complete' | 'failed' | 'locked';
export type KappaTabKey = 'kappa' | 'lightkeeper';
export type KappaRowEntry = {
  task: Task;
  status: KappaTaskStatus;
  isInvalid: boolean;
  lockedBy?: { id: string; name?: string };
};
export type KappaTraderGroupEntry = {
  trader: Pick<Trader, 'id' | 'name' | 'normalizedName' | 'imageLink'>;
  rows: KappaRowEntry[];
  totalCount: number;
  completedCount: number;
};
const FENCE_NORMALIZED_NAME = 'fence';
const OTHER_GROUP_ID = '__other__';
const CHAIN_PART_REGEX = /^(.*?)\s*[-\u2013\u2014]\s*Part\s+(\d+)\s*$/i;
type ChainKey = {
  chain: string;
  part: number;
};
/**
 * Detects multi-part quest chains by name (e.g. 'Healthcare Privacy - Part 2').
 * Returns the chain prefix and the part number, or null when the task is not
 * a numbered part.
 */
function parseChainKey(name: string | undefined): ChainKey | null {
  if (!name) return null;
  const match = name.match(CHAIN_PART_REGEX);
  if (!match) return null;
  const prefix = match[1]?.trim();
  const partRaw = match[2];
  if (!prefix || !partRaw) return null;
  const part = Number.parseInt(partRaw, 10);
  if (!Number.isFinite(part)) return null;
  return { chain: prefix.toLocaleLowerCase(), part };
}
/** Sort rows against a possibly partial progression index without mutating the input. */
export const sortKappaRowsByProgression = (
  rows: readonly KappaRowEntry[],
  taskOrderIndex: ReadonlyMap<string, number>
): KappaRowEntry[] => {
  const chainAnchors = new Map<string, { rank: number }>();
  const rankedRows = rows.map((row) => {
    const rank = taskOrderIndex.get(row.task.id) ?? Number.MAX_SAFE_INTEGER;
    const chain = parseChainKey(row.task.name);
    if (!chain) return { row, anchor: { rank }, isChain: 0, part: 0 };
    let anchor = chainAnchors.get(chain.chain);
    if (!anchor) {
      anchor = { rank };
      chainAnchors.set(chain.chain, anchor);
    } else {
      anchor.rank = Math.min(anchor.rank, rank);
    }
    return { row, anchor, isChain: 1, part: chain.part };
  });
  return rankedRows
    .sort((a, b) => a.anchor.rank - b.anchor.rank || a.isChain - b.isChain || a.part - b.part)
    .map(({ row }) => row);
};
const taskFilterFor = (tab: KappaTabKey) =>
  tab === 'kappa'
    ? (task: Task) => task.kappaRequired === true
    : (task: Task) => task.lightkeeperRequired === true;
export function useKappaOverview(tab: () => KappaTabKey) {
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const progressStore = useProgressStore();
  const { t } = useI18n({ useScope: 'global' });
  const sourceTasks = computed(() => {
    const tabFiltered = metadataStore.tasks.filter(taskFilterFor(toValue(tab)));
    const faction = tarkovStore.getPMCFaction() ?? 'Any';
    const gameEditionValue = tarkovStore.getGameEdition();
    const editions = metadataStore.editions ?? [];
    const prestigeLevel = tarkovStore.getPrestigeLevel() ?? 0;
    const prestigeTaskMap = metadataStore.prestigeTaskMap;
    return tabFiltered.filter((task) =>
      isTaskRelevant(task, {
        faction,
        gameEditionValue,
        editions,
        prestigeLevel,
        prestigeTaskMap,
      })
    );
  });
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
      const isInvalid = progressStore.invalidTasks?.[task.id]?.self === true;
      return { task, status, isInvalid, lockedBy };
    });
  });
  const totals = computed(() => {
    let completed = 0;
    let failed = 0;
    let available = 0;
    let locked = 0;
    let total = 0;
    for (const row of tasksWithStatus.value) {
      const completion = {
        complete: row.status === 'complete',
        failed: row.status === 'failed',
      };
      if (isTaskCounted(completion, row.isInvalid)) {
        total += 1;
      }
      if (row.status === 'complete') completed += 1;
      else if (row.status === 'failed') failed += 1;
      else if (row.status === 'available') available += 1;
      else locked += 1;
    }
    return {
      total,
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
      const completion = {
        complete: row.status === 'complete',
        failed: row.status === 'failed',
      };
      const isCounted = isTaskCounted(completion, row.isInvalid);
      if (existing) {
        existing.rows.push(row);
        if (isCounted) {
          existing.totalCount += 1;
        }
        if (row.status === 'complete') existing.completedCount += 1;
        continue;
      }
      const traderRef = row.task.trader;
      groups.set(traderId, {
        trader: {
          id: traderId,
          name: traderRef?.name ?? t('page.kappa.trader.other', 'Other'),
          normalizedName: traderRef?.normalizedName,
          imageLink: traderRef?.imageLink,
        },
        rows: [row],
        totalCount: isCounted ? 1 : 0,
        completedCount: row.status === 'complete' ? 1 : 0,
      });
    }
    const taskOrderIndex = new Map<string, number>();
    sortTasksByProgression(metadataStore.tasks, 'asc', progressStore.taskEvaluations).forEach(
      (task, index) => {
        taskOrderIndex.set(task.id, index);
      }
    );
    return Array.from(groups.values())
      .map((group) => ({ ...group, rows: sortKappaRowsByProgression(group.rows, taskOrderIndex) }))
      .sort((a, b) => {
        const indexA = traderOrder.get(a.trader.id) ?? Number.MAX_SAFE_INTEGER;
        const indexB = traderOrder.get(b.trader.id) ?? Number.MAX_SAFE_INTEGER;
        if (indexA !== indexB) return indexA - indexB;
        return a.trader.name.localeCompare(b.trader.name);
      });
  });
  const collectorRow = computed<KappaRowEntry | null>(() => {
    if (toValue(tab) !== 'kappa') return null;
    for (const row of tasksWithStatus.value) {
      if (row.task.trader?.normalizedName === FENCE_NORMALIZED_NAME) {
        return row;
      }
    }
    return null;
  });
  const groupedByTraderWithoutFence = computed<KappaTraderGroupEntry[]>(() => {
    if (toValue(tab) !== 'kappa') return groupedByTrader.value;
    return groupedByTrader.value.filter(
      (group) => group.trader.normalizedName !== FENCE_NORMALIZED_NAME
    );
  });
  return {
    sourceTasks,
    tasksWithStatus,
    totals,
    groupedByTrader,
    groupedByTraderWithoutFence,
    collectorRow,
  };
}
