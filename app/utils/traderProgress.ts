import { TRADERS_WITHOUT_LOYALTY_LEVELS, type GameMode } from '@/utils/constants';
import { isTaskComplete } from '@/utils/taskStatus';
import type { TraderProgress, UserProgressData } from '@/types/progress';
import type { Task, Trader } from '@/types/tarkov';
type StandingCatalog = { tasks: Task[]; traders: Trader[] };
type StandingMetadata = StandingCatalog & {
  tasksCoreGameMode: GameMode | null;
  tasksRewardsGameMode: GameMode | null;
};
export function traderCatalogForMode(metadata: StandingMetadata, mode: GameMode) {
  return metadata.tasksCoreGameMode === mode && metadata.tasksRewardsGameMode === mode
    ? metadata
    : undefined;
}
export function completedTraderQuestIds(progress: UserProgressData) {
  return Object.keys(progress.taskCompletions)
    .filter((id) => isTaskComplete(progress.taskCompletions[id]))
    .sort();
}
/** Preserve old absolute standing at the point where quest tracking starts. */
export function checkpointLegacyTraderStanding(progress: UserProgressData): number {
  const legacy = Object.values(progress.traders).filter((trader) => !trader.reputationCheckpoint);
  if (!legacy.length) return 0;
  const completedTaskIds = completedTraderQuestIds(progress);
  for (const trader of legacy)
    trader.reputationCheckpoint = { completedTaskIds, timestamp: 0, manual: true };
  return legacy.length;
}
/** A dated recovery event can prove a quest was already included in a manual correction. */
export function includeHistoricalQuestInTraderStanding(
  progress: UserProgressData,
  taskId: string,
  completedAt?: number
) {
  if (completedAt === undefined) return;
  for (const trader of Object.values(progress.traders ?? {})) {
    const checkpoint = trader.reputationCheckpoint;
    if (
      checkpoint?.manual &&
      completedAt < checkpoint.timestamp &&
      !checkpoint.completedTaskIds.includes(taskId)
    ) {
      checkpoint.completedTaskIds = [...checkpoint.completedTaskIds, taskId].sort();
    }
  }
}
const rewardDeltas = (progress: UserProgressData, tasks: Task[]) => {
  const checkpoints = new Map(
    Object.entries(progress.traders).map(([id, trader]) => [
      id,
      new Set(trader.reputationCheckpoint?.completedTaskIds),
    ])
  );
  const totals = new Map<string, number>();
  for (const task of tasks) {
    const complete = isTaskComplete(progress.taskCompletions[task.id]);
    for (const { standing, trader } of task.finishRewards?.traderStanding ?? []) {
      const atCheckpoint = checkpoints.get(trader.id)?.has(task.id) ?? false;
      const delta = (Number(complete) - Number(atCheckpoint)) * standing;
      if (Number.isFinite(delta)) totals.set(trader.id, (totals.get(trader.id) ?? 0) + delta);
    }
  }
  return totals;
};
const standardLoyalty = (trader: Trader) =>
  !TRADERS_WITHOUT_LOYALTY_LEVELS.some((name) => name === trader.normalizedName);
const meetsLoyaltyRequirements = (
  tier: NonNullable<Trader['levels']>[number],
  level: number,
  reputation: number
) =>
  tier.requiredCommerce === 0 &&
  level >= tier.requiredPlayerLevel &&
  reputation >= tier.requiredReputation;
const earnedLoyalty = (trader: Trader, level: number, reputation: number) =>
  (trader.levels ?? []).reduce(
    (best, tier) =>
      meetsLoyaltyRequirements(tier, level, reputation) ? Math.max(best, tier.level) : best,
    1
  );
const hasQuestBaseline = (trader: TraderProgress | undefined) =>
  !trader || Boolean(trader.reputationCheckpoint);
export function effectiveTraderStanding(
  progress: UserProgressData,
  catalog?: StandingCatalog
): UserProgressData['traders'] {
  if (!catalog) return progress.traders;
  const deltas = rewardDeltas(progress, catalog.tasks);
  const result = { ...progress.traders };
  for (const trader of catalog.traders) {
    const saved = progress.traders[trader.id];
    const delta = hasQuestBaseline(saved) ? (deltas.get(trader.id) ?? 0) : 0;
    const reputation = Number(((saved?.reputation ?? 0) + delta).toFixed(6));
    const earned = standardLoyalty(trader) ? earnedLoyalty(trader, progress.level, reputation) : 1;
    result[trader.id] = { reputation, level: Math.max(saved?.level ?? 1, earned) };
  }
  return result;
}
