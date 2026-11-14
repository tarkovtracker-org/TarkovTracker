import { isTaskComplete, isTaskFailed } from '@/utils/taskStatus';
import type { TaskCompletion, UserProgressData } from '@/types/progress';
import type { Task } from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
type TaskStatus = { complete: boolean; failed: boolean };
type TaskSource = 'manual' | 'automatic' | 'normal';
export interface DebugTaskEntry extends TaskStatus {
  id: string;
  name: string;
  manual: boolean | undefined;
  prerequisiteIds: string[];
  prerequisiteStates: Record<string, TaskStatus>;
}
/**
 * The task catalog the names and prerequisites came from. While `loading` is true after a mode
 * switch, they may still describe the previous mode's catalog.
 */
export interface DebugTaskCatalog {
  gameMode: string;
  loading: boolean;
  taskCount: number;
}
/** Task completions for the current mode, with prerequisite states, for reproducing bug reports. */
export interface DebugTaskSummary {
  gameMode: GameMode;
  catalog: DebugTaskCatalog;
  taskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  manualTaskCount: number;
  /** Settled tasks the app marked itself (`manual: false`), such as progress repair. */
  automaticTaskCount: number;
  tasks: DebugTaskEntry[];
}
const toStatus = (completion: TaskCompletion | undefined): TaskStatus => ({
  complete: isTaskComplete(completion),
  failed: isTaskFailed(completion),
});
const classifySource = (completion: TaskCompletion): TaskSource => {
  if (completion.manual === true) return 'manual';
  if (completion.manual === false) return 'automatic';
  return 'normal';
};
const prerequisiteIdsOf = (task: Task | undefined): string[] =>
  (task?.taskRequirements ?? [])
    .map((requirement) => requirement?.task?.id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
const buildEntry = (
  taskId: string,
  completion: TaskCompletion,
  completions: Record<string, TaskCompletion>,
  task: Task | undefined
): DebugTaskEntry => {
  const prerequisiteIds = prerequisiteIdsOf(task);
  return {
    id: taskId,
    name: task?.name ?? taskId,
    ...toStatus(completion),
    manual: completion.manual,
    prerequisiteIds,
    prerequisiteStates: Object.fromEntries(
      prerequisiteIds.map((id) => [id, toStatus(completions[id])])
    ),
  };
};
const countSettledBySource = (
  completions: Record<string, TaskCompletion>,
  source: TaskSource
): number =>
  Object.values(completions).filter((completion) => {
    const status = toStatus(completion);
    return (status.complete || status.failed) && classifySource(completion) === source;
  }).length;
export function buildDebugTaskSummary(
  gameMode: GameMode,
  modeData: UserProgressData | undefined,
  tasks: readonly Task[],
  catalog: Omit<DebugTaskCatalog, 'taskCount'>
): DebugTaskSummary {
  const completions: Record<string, TaskCompletion> = modeData?.taskCompletions ?? {};
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const entries = Object.entries(completions).map(([taskId, completion]) =>
    buildEntry(taskId, completion ?? {}, completions, tasksById.get(taskId))
  );
  return {
    gameMode,
    catalog: { ...catalog, taskCount: tasks.length },
    taskCount: entries.length,
    completedTaskCount: entries.filter((entry) => entry.complete).length,
    failedTaskCount: entries.filter((entry) => entry.failed).length,
    manualTaskCount: countSettledBySource(completions, 'manual'),
    automaticTaskCount: countSettledBySource(completions, 'automatic'),
    tasks: entries,
  };
}
