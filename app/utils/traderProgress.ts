import { TRADERS_WITHOUT_LOYALTY_LEVELS, type GameMode } from '@/utils/constants';
import { isTaskComplete } from '@/utils/taskStatus';
import type { TaskCompletion, TraderProgress, UserProgressData } from '@/types/progress';
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
export const usesAutomaticTraderLoyalty = (trader: TraderProgress | undefined) =>
  !trader || trader.automaticLoyalty === true;
export const tracksQuestReputation = (trader: TraderProgress | undefined) =>
  trader?.reputationCheckpoint?.questRewardTracking !== 'paused';
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
export const excludedHistoricalTraderQuestIds = (progress: UserProgressData) =>
  Object.keys(progress.taskCompletions)
    .filter((id) => {
      const completion = progress.taskCompletions[id];
      return completion?.eftCompletedAt !== undefined && !isTaskComplete(completion);
    })
    .sort();
const indexTraderCheckpoint = (checkpoint: TraderProgress['reputationCheckpoint']) => ({
  included: new Set(checkpoint?.completedTaskIds),
  excluded: new Set(checkpoint?.excludedHistoricalTaskIds),
  historicalCutoff: checkpoint?.manual ? checkpoint.timestamp : 0,
  newQuestsOnly: checkpoint?.questRewardTracking === 'new-only',
});
const countedAtCheckpoint = (
  checkpoint: ReturnType<typeof indexTraderCheckpoint> | undefined,
  taskId: string,
  completion: TaskCompletion | undefined
) => {
  if (!checkpoint) return false;
  if (checkpoint.included.has(taskId)) return true;
  return (
    (completion?.eftCompletedAt ?? Infinity) < checkpoint.historicalCutoff &&
    !checkpoint.excluded.has(taskId)
  );
};
const questRewardChange = (
  checkpoint: ReturnType<typeof indexTraderCheckpoint> | undefined,
  taskId: string,
  completion: TaskCompletion | undefined
) => {
  const included = countedAtCheckpoint(checkpoint, taskId, completion);
  if (included && checkpoint?.newQuestsOnly) return 0;
  return Number(isTaskComplete(completion)) - Number(included);
};
const rewardDeltas = (progress: UserProgressData, tasks: Task[]) => {
  const checkpoints = new Map(
    Object.entries(progress.traders).map(([id, trader]) => [
      id,
      indexTraderCheckpoint(trader.reputationCheckpoint),
    ])
  );
  const totals = new Map<string, number>();
  for (const task of tasks) {
    const completion = progress.taskCompletions[task.id];
    for (const { standing, trader } of task.finishRewards?.traderStanding ?? []) {
      const delta = questRewardChange(checkpoints.get(trader.id), task.id, completion) * standing;
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
  !trader || Boolean(trader.reputationCheckpoint && tracksQuestReputation(trader));
const effectiveLoyalty = (
  saved: TraderProgress | undefined,
  trader: Trader,
  level: number,
  reputation: number
) =>
  usesAutomaticTraderLoyalty(saved) && standardLoyalty(trader)
    ? earnedLoyalty(trader, level, reputation)
    : (saved?.level ?? 1);
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
    result[trader.id] = {
      reputation,
      level: effectiveLoyalty(saved, trader, progress.level, reputation),
    };
  }
  return result;
}
