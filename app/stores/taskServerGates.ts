import { isAvailabilityConfirmed } from '@/utils/taskAvailabilityConfirmation';
import { counterValue } from '@/utils/taskCounters';
import {
  globalVariableRequirementMet,
  normalizeOtherRequirements,
  otherRequirementsSignature,
} from '@/utils/taskOtherRequirements';
import { compareRequirement } from '@/utils/taskRequirements';
import { isTaskComplete } from '@/utils/taskStatus';
import type { TaskAvailabilityTeamData, TaskBlocker } from '@/stores/taskAvailability';
import type { Task, TaskCounterDerivation, TaskOtherRequirement } from '@/types/tarkov';
type TaskServerGateData = Pick<
  TaskAvailabilityTeamData,
  'completions' | 'confirmations' | 'globalVariables' | 'storyChapters'
>;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const confirmedRequirements = (task: Task, data: TaskServerGateData): boolean =>
  isAvailabilityConfirmed(
    data.confirmations?.[task.id],
    data.completions[task.id],
    otherRequirementsSignature(task)
  );
type VariableRequirement = Extract<TaskOtherRequirement, { type: 'globalVariable' }>;
const accountBlockers = (
  requirement: VariableRequirement,
  data: TaskServerGateData,
  confirmed: boolean
): TaskBlocker[] => {
  const met = globalVariableRequirementMet(requirement, data.globalVariables);
  if (met === true || (met === undefined && confirmed)) return [];
  return [
    {
      type: met === undefined ? 'global_variable_unknown' : 'global_variable',
      requirementId: requirement.id,
      variableId: requirement.variableId,
      taskPool: requirement.taskPool,
      current: met === undefined ? undefined : data.globalVariables?.[requirement.variableId],
      required: requirement.value,
      compareMethod: requirement.compareMethod,
    },
  ];
};
/** Tracked story progress decides this gate; an in-game confirmation never bypasses it. */
const storyObjectiveBlockers = (
  requirement: Extract<TaskOtherRequirement, { type: 'storyObjective' }>,
  data: TaskServerGateData
): TaskBlocker[] => {
  const chapter = data.storyChapters?.[requirement.storyChapter.id];
  if (chapter?.objectives?.[requirement.objective.id]?.complete === true) return [];
  return [
    {
      type: 'story_objective',
      requirementId: requirement.id,
      chapterIds: [requirement.storyChapter.id],
      objective: {
        id: requirement.objective.id,
        name: requirement.objective.name ?? requirement.objective.id,
      },
    },
  ];
};
/**
 * Best-effort registry derivation: count completed contributors, or groups whose members are all
 * complete. It is an estimate, so a player's in-game confirmation overrides a derived shortfall;
 * an explicit account value never does.
 */
const counterBlockers = (
  requirement: VariableRequirement,
  counter: TaskCounterDerivation,
  data: TaskServerGateData,
  confirmed: boolean
): TaskBlocker[] => {
  const current = counterValue(counter, (id) => isTaskComplete(data.completions[id]));
  if (confirmed || compareRequirement(current, requirement.compareMethod, requirement.value))
    return [];
  return [
    {
      type: 'task_counter',
      requirementId: requirement.id,
      variableId: requirement.variableId,
      taskPool: requirement.taskPool,
      current,
      required: requirement.value,
      compareMethod: requirement.compareMethod,
    },
  ];
};
const hasAccountValue = (requirement: VariableRequirement, data: TaskServerGateData) =>
  isRecord(data.globalVariables) && Object.hasOwn(data.globalVariables, requirement.variableId);
const variableBlockers = (
  requirement: VariableRequirement,
  data: TaskServerGateData,
  confirmed: boolean
): TaskBlocker[] =>
  requirement.counter && !hasAccountValue(requirement, data)
    ? counterBlockers(requirement, requirement.counter, data, confirmed)
    : accountBlockers(requirement, data, confirmed);
const requirementBlockers = (
  requirement: TaskOtherRequirement,
  data: TaskServerGateData,
  confirmed: boolean
): TaskBlocker[] => {
  if (requirement.type === 'globalVariable') return variableBlockers(requirement, data, confirmed);
  if (requirement.type === 'unknown') return [{ type: 'unknown', reason: 'other_requirement' }];
  if (requirement.type === 'storyObjective') return storyObjectiveBlockers(requirement, data);
  return confirmed ? [] : [{ type: 'dialogue', requirementId: requirement.id }];
};
/** Start gates only: never infer producers, current values, or prerequisite edges from an unlock. */
export const taskServerGateBlockers = (task: Task, data: TaskServerGateData): TaskBlocker[] => {
  const confirmed = confirmedRequirements(task, data);
  return normalizeOtherRequirements(task.otherRequirements).flatMap((requirement) =>
    requirementBlockers(requirement, data, confirmed)
  );
};
