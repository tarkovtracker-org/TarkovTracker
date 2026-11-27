import { normalizeRequirementStatuses } from '@tarkovtracker/progress-contracts/requirementStatus';
import {
  isTaskActive,
  isTaskComplete,
  isTaskFailed,
  type RawTaskCompletion,
} from '@/utils/taskStatus';
import type { UserProgressData, UserState } from '@/stores/progressState';
import type { HideoutStation, Task, TaskRequirement } from '@/types/tarkov';
import type { PMCFaction } from '@/utils/constants';
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
export function isTaskEligibleForFaction(
  task: Pick<Task, 'factionName'>,
  faction: PMCFaction
): boolean {
  const taskFaction = task.factionName;
  return !taskFaction || taskFaction === 'Any' || taskFaction === faction;
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
function resolveStationRequirement(
  req: { station?: { id?: string }; level?: number },
  stationsById: ReadonlyMap<string, HideoutStation>,
  expanded: Map<string, number>,
  getCurrentLevel: (stationId: string) => number
): [string, number] | null {
  const reqId = req.station?.id;
  const reqStation = reqId ? stationsById.get(reqId) : undefined;
  if (!reqId || !reqStation || typeof req.level !== 'number') return null;
  const maxAvailable = Math.max(0, ...reqStation.levels.map((level) => level.level));
  const clampedReq = Math.min(req.level, maxAvailable);
  const effective = Math.max(getCurrentLevel(reqId), expanded.get(reqId) ?? 0);
  if (clampedReq <= effective) return null;
  expanded.set(reqId, clampedReq);
  return [reqId, clampedReq];
}
function enqueueMissingRequirements(
  station: HideoutStation,
  targetLevel: number,
  stationsById: ReadonlyMap<string, HideoutStation>,
  expanded: Map<string, number>,
  getCurrentLevel: (stationId: string) => number
): Array<[string, number]> {
  const current = getCurrentLevel(station.id);
  const requirements = station.levels
    .filter((tier) => tier.level <= targetLevel && tier.level > current)
    .flatMap((tier) => tier.stationLevelRequirements ?? []);
  return requirements
    .map((req) => resolveStationRequirement(req, stationsById, expanded, getCurrentLevel))
    .filter((entry): entry is [string, number] => entry !== null);
}
/** Transitively includes required prerequisite stations for all planned hideout tiers. */
export function expandHideoutStationPrerequisites(
  stations: readonly HideoutStation[],
  selectedLevels: ReadonlyMap<string, number>,
  getCurrentLevel: (stationId: string) => number
): Map<string, number> {
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const expanded = new Map(selectedLevels);
  const queue: Array<[string, number]> = [...expanded.entries()];
  const processedMax = new Map<string, number>();
  while (queue.length > 0) {
    const [stationId, targetLevel] = queue.shift()!;
    if (targetLevel <= (processedMax.get(stationId) ?? 0)) continue;
    processedMax.set(stationId, targetLevel);
    const station = stationsById.get(stationId);
    if (!station) continue;
    queue.push(
      ...enqueueMissingRequirements(station, targetLevel, stationsById, expanded, getCurrentLevel)
    );
  }
  return expanded;
}
function modeHasSubstantialProgress(modeData: UserProgressData | undefined): boolean {
  if (!modeData) return false;
  const hasTasks = Object.values(modeData.taskCompletions ?? {}).some(
    (entry) => isTaskComplete(entry) || isTaskFailed(entry)
  );
  if (hasTasks) return true;
  const hasObjectives = Object.values(modeData.taskObjectives ?? {}).some(
    (entry) => Boolean(entry?.complete) || (entry?.count ?? 0) > 0
  );
  if (hasObjectives) return true;
  const hasHideout = Object.values(modeData.hideoutModules ?? {}).some((entry) =>
    Boolean(entry?.complete)
  );
  if (hasHideout) return true;
  return Object.values(modeData.storyChapters ?? {}).some(
    (chapter) =>
      Boolean(chapter?.complete) ||
      Object.values(chapter?.objectives ?? {}).some((objective) => Boolean(objective?.complete))
  );
}
/** True only when the player has real tracked quest, hideout, or story progress in any mode. */
export function hasAnySubstantialProgress(
  state: Pick<UserState, 'pvp' | 'pve' | 'seasonal'>
): boolean {
  return [state.pvp, state.pve, state.seasonal].some(modeHasSubstantialProgress);
}
