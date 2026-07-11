import type { Task, TarkovItem } from '@/types/tarkov';
export function getTaskRewardItems(task: Task): TarkovItem[] {
  return [
    ...(task.finishRewards?.items?.map((reward) => reward.item) ?? []),
    ...(task.finishRewards?.offerUnlock?.map((reward) => reward.item) ?? []),
  ];
}
