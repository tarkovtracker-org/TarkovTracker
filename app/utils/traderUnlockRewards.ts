import type { Task } from '@/types/tarkov';
type RewardTask = Pick<Task, 'id' | 'finishRewards'>;
const rewardEntryId = (entry: unknown): string | undefined => {
  if (typeof entry === 'string') return entry;
  const id = (entry as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
};
/** json.tarkov.dev ships `traderUnlock` as an id list; older shapes used a single object. */
export const rewardTraderUnlockIds = (task: RewardTask): string[] => {
  const raw: unknown = task.finishRewards?.traderUnlock;
  const entries: unknown[] = Array.isArray(raw) ? raw : [raw];
  return entries.map(rewardEntryId).filter((id): id is string => Boolean(id));
};
/** Trader id -> ids of the tasks whose completion reward unlocks that trader. */
export const rewardTraderUnlockTasks = (
  tasks: readonly RewardTask[]
): ReadonlyMap<string, string[]> => {
  const byTrader = new Map<string, string[]>();
  for (const task of tasks)
    for (const traderId of rewardTraderUnlockIds(task))
      byTrader.set(traderId, [...(byTrader.get(traderId) ?? []), task.id]);
  return byTrader;
};
