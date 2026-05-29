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
     * Sort each trader column by required player level, but keep multi-part
     * quest chains adjacent and ordered by part number. The reference
     * spreadsheet groups chains like 'Healthcare Privacy - Part 1/2/3'
     * together anchored at the first part's level, even when later parts have
     * higher level requirements that would otherwise scatter them across the
     * column. Tasks outside a chain sort by their own level then name.
     */
    type SortMeta = { anchorLevel: number; chainKey: string; part: number; name: string };
    const sortGroupRows = (rows: KappaRowEntry[]): KappaRowEntry[] => {
      const chainAnchors = new Map<string, number>();
      for (const row of rows) {
        const chainKey = parseChainKey(row.task.name);
        if (!chainKey) continue;
        const level = row.task.minPlayerLevel ?? 0;
        const existing = chainAnchors.get(chainKey.chain);
        if (existing === undefined || level < existing) {
          chainAnchors.set(chainKey.chain, level);
        }
      }
      const metaFor = (row: KappaRowEntry): SortMeta => {
        const ownLevel = row.task.minPlayerLevel ?? 0;
        const name = row.task.name ?? '';
        const chainKey = parseChainKey(row.task.name);
        if (chainKey) {
          const anchor = chainAnchors.get(chainKey.chain) ?? ownLevel;
          return {
            anchorLevel: anchor,
            chainKey: chainKey.chain,
            part: chainKey.part,
            name,
          };
        }
        return { anchorLevel: ownLevel, chainKey: name.toLocaleLowerCase(), part: 0, name };
      };
      return [...rows].sort((a, b) => {
        const metaA = metaFor(a);
        const metaB = metaFor(b);
        if (metaA.anchorLevel !== metaB.anchorLevel) return metaA.anchorLevel - metaB.anchorLevel;
        if (metaA.chainKey !== metaB.chainKey) return metaA.chainKey.localeCompare(metaB.chainKey);
        if (metaA.part !== metaB.part) return metaA.part - metaB.part;
        return metaA.name.localeCompare(metaB.name);
      });
    };
    return Array.from(groups.values())
      .map((group) => ({ ...group, rows: sortGroupRows(group.rows) }))
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
