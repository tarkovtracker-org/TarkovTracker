import { GAME_MODES, resolveTraderUnlockTaskIds } from '@/utils/constants';
import type { Trader } from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
export interface TraderLockStatusDeps {
  tasks: { id: string }[] | null | undefined;
  isTaskComplete: (taskId: string) => boolean;
  gameMode?: GameMode;
}
export const isTraderLocked = (
  trader: Pick<Trader, 'normalizedName'>,
  deps: TraderLockStatusDeps
): boolean => {
  const unlockTaskIds = resolveTraderUnlockTaskIds(
    trader.normalizedName,
    deps.gameMode ?? GAME_MODES.PVP
  );
  if (!unlockTaskIds.length || !deps.tasks?.length) return false;
  const idSet = new Set(unlockTaskIds);
  const unlockTasks = deps.tasks.filter((task) => idSet.has(task.id));
  if (!unlockTasks.length) return false;
  return !unlockTasks.some((task) => deps.isTaskComplete(task.id));
};
