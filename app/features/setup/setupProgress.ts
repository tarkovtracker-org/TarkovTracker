import { normalizeRequirementStatuses } from '@tarkovtracker/progress-contracts/requirementStatus';
import {
  isTaskActive,
  isTaskComplete,
  isTaskFailed,
  type RawTaskCompletion,
} from '@/utils/taskStatus';
import type { HideoutStation, Task, TaskRequirement } from '@/types/tarkov';
type QuestSelection = 'active' | 'completed';
type QuestChoice = [id: string, status: QuestSelection];
type ReadCompletion = (id: string) => RawTaskCompletion;
const completionStatuses = new Set(['complete', 'completed']);
function requiresCompletion(requirement: TaskRequirement): boolean {
  const statuses = normalizeRequirementStatuses(requirement?.status);
  return statuses.length > 0 && statuses.every((status) => completionStatuses.has(status));
}
function explicitCompletionGates(task: Task | undefined): string[] {
  if (task?.storyUnlocks?.length) return [];
  return (task?.taskRequirements ?? [])
    .filter(requiresCompletion)
    .map((requirement) => requirement.task?.id)
    .filter(Boolean);
}
function canFollowGate(saved: RawTaskCompletion): boolean {
  return !isTaskActive(saved) && !isTaskFailed(saved);
}
/** Follow completion-only edges without assuming a route through story or mixed-status gates. */
function getRequiredCompletions(
  tasks: ReadonlyMap<string, Task>,
  choices: ReadonlyMap<string, QuestSelection>,
  readCompletion: ReadCompletion
): string[] {
  const visited = new Set(choices.keys());
  const pending = [...visited];
  const inferred: string[] = [];
  const unvisited = (id: string) => !visited.has(id) && tasks.has(id);
  for (const id of pending) {
    [...new Set(explicitCompletionGates(tasks.get(id)))]
      .filter(unvisited)
      .forEach((prerequisite) => {
        visited.add(prerequisite);
        if (!canFollowGate(readCompletion(prerequisite))) return;
        inferred.push(prerequisite);
        pending.push(prerequisite);
      });
  }
  return inferred.filter((id) => !isTaskComplete(readCompletion(id)));
}
function canApplyChoice(
  tasks: ReadonlyMap<string, Task>,
  read: ReadCompletion,
  id: string
): boolean {
  const saved = read(id);
  return tasks.has(id) && !isTaskComplete(saved) && !isTaskFailed(saved);
}
export function planSetupQuests(
  tasks: ReadonlyMap<string, Task>,
  choices: ReadonlyMap<string, QuestSelection>,
  readCompletion: ReadCompletion
) {
  const selected = [...choices].filter(([id]) => canApplyChoice(tasks, readCompletion, id));
  const confirmed = new Map(selected);
  const needsActiveStatus = ([id, status]: QuestChoice) =>
    status === 'active' && !isTaskActive(readCompletion(id));
  return {
    completed: selected.filter(([, status]) => status === 'completed').map(([id]) => id),
    active: selected.filter(needsActiveStatus).map(([id]) => id),
    suggested: getRequiredCompletions(tasks, confirmed, readCompletion),
  };
}
export function planSetupHideout(
  stations: readonly HideoutStation[],
  levels: ReadonlyMap<string, number>,
  isBuilt: (id: string) => boolean
) {
  return stations.flatMap((station) => {
    const target = levels.get(station.id);
    if (target === undefined || !station.levels.some((level) => level.level === target)) return [];
    return station.levels.filter((level) => level.level <= target && !isBuilt(level.id));
  });
}
