import type { FinishRewards, TarkovTaskRewardsQueryResult } from '~/types/tarkov';
/**
 * Sanitizes rewards by filtering out skill level rewards with null skills
 */
function sanitizeRewards(rewards?: FinishRewards): FinishRewards | undefined {
  if (!rewards) return rewards;
  return {
    ...rewards,
    skillLevelReward: rewards.skillLevelReward?.filter((reward) => reward && reward.skill !== null),
  };
}
/**
 * Generic task sanitization helper with strong typing.
 * @template TTask - A TaskWithRewards-like object representing a task entity.
 *   Must contain optional reward properties (startRewards, finishRewards, failureOutcome)
 *   that may include invalid entries from the API. The sanitization function will access
 *   these reward fields to filter out null/invalid skill level rewards.
 * @template TData - The data shape containing tasks array
 */
type TaskWithRewards = {
  startRewards?: FinishRewards;
  finishRewards?: FinishRewards;
  failureOutcome?: FinishRewards;
};
function sanitizeTasksResponse<
  TTask extends TaskWithRewards,
  TData extends { tasks?: Array<TTask | null> },
>(response: { data: TData }, sanitizeTask: (task: TTask) => TTask): { data: TData } {
  const tasks = response.data.tasks ?? [];
  const sanitizedTasks = tasks.map((task) => (task ? sanitizeTask(task) : task));
  return {
    data: {
      ...response.data,
      tasks: sanitizedTasks,
    },
  };
}
/**
 * Sanitizes task rewards data to remove invalid entries from the API response
 */
export function sanitizeTaskRewards(response: { data: TarkovTaskRewardsQueryResult }): {
  data: TarkovTaskRewardsQueryResult;
} {
  return sanitizeTasksResponse(response, (task) => ({
    ...task,
    startRewards: sanitizeRewards(task.startRewards),
    finishRewards: sanitizeRewards(task.finishRewards),
    failureOutcome: sanitizeRewards(task.failureOutcome),
  }));
}
