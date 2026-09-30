import { isAvailabilityConfirmed } from '@/utils/taskAvailabilityConfirmation';
import {
  globalVariableRequirementMet,
  normalizeOtherRequirements,
  otherRequirementsSignature,
} from '@/utils/taskOtherRequirements';
import { compareRequirement } from '@/utils/taskRequirements';
import { isTaskComplete } from '@/utils/taskStatus';
import type { TaskAvailabilityTeamData, TaskBlocker } from '@/stores/taskAvailability';
import type { Task, TaskCounterDerivation, TaskOtherRequirement } from '@/types/tarkov';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const confirmedRequirements = (task: Task, data: TaskAvailabilityTeamData): boolean =>
  isAvailabilityConfirmed(
    data.confirmations?.[task.id],
    data.completions[task.id],
    otherRequirementsSignature(task)
  );
type VariableRequirement = Extract<TaskOtherRequirement, { type: 'globalVariable' }>;
const accountBlockers = (
  requirement: VariableRequirement,
  data: TaskAvailabilityTeamData,
  confirmed: boolean
): TaskBlocker[] => {
  const met = globalVariableRequirementMet(requirement, data.globalVariables);
  if (met === true || (met === undefined && confirmed)) return [];
  return [
    {
      type: met === undefined ? 'global_variable_unknown' : 'global_variable',
      requirementId: requirement.id,
      variableId: requirement.variableId,
      current: met === undefined ? undefined : data.globalVariables?.[requirement.variableId],
      required: requirement.value,
      compareMethod: requirement.compareMethod,
    },
  ];
};
/** Tracked story progress decides this gate; an in-game confirmation never bypasses it. */
const storyObjectiveBlockers = (
  requirement: Extract<TaskOtherRequirement, { type: 'storyObjective' }>,
  data: TaskAvailabilityTeamData
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
 * Best-effort registry derivation: count completed contributors. It is an estimate, so a player's
 * in-game confirmation overrides a derived shortfall; an explicit account value never does.
 */
const counterBlockers = (
  requirement: VariableRequirement,
  counter: TaskCounterDerivation,
  data: TaskAvailabilityTeamData,
  confirmed: boolean
): TaskBlocker[] => {
  const current = counter.taskIds.filter((id) => isTaskComplete(data.completions[id])).length;
  if (confirmed || compareRequirement(current, requirement.compareMethod, requirement.value))
    return [];
  return [
    {
      type: 'task_counter',
      requirementId: requirement.id,
      variableId: requirement.variableId,
      current,
      required: requirement.value,
      compareMethod: requirement.compareMethod,
    },
  ];
};
const hasAccountValue = (requirement: VariableRequirement, data: TaskAvailabilityTeamData) =>
  isRecord(data.globalVariables) && Object.hasOwn(data.globalVariables, requirement.variableId);
const variableBlockers = (
  requirement: VariableRequirement,
  data: TaskAvailabilityTeamData,
  confirmed: boolean
): TaskBlocker[] =>
  requirement.counter && !hasAccountValue(requirement, data)
    ? counterBlockers(requirement, requirement.counter, data, confirmed)
    : accountBlockers(requirement, data, confirmed);
const requirementBlockers = (
  requirement: TaskOtherRequirement,
  data: TaskAvailabilityTeamData,
  confirmed: boolean
): TaskBlocker[] => {
  if (requirement.type === 'globalVariable') return variableBlockers(requirement, data, confirmed);
  if (requirement.type === 'unknown') return [{ type: 'unknown', reason: 'other_requirement' }];
  if (requirement.type === 'storyObjective') return storyObjectiveBlockers(requirement, data);
  return confirmed ? [] : [{ type: 'dialogue', requirementId: requirement.id }];
};
/** Start gates only: never infer producers, current values, or prerequisite edges from an unlock. */
export const taskServerGateBlockers = (
  task: Task,
  data: TaskAvailabilityTeamData
): TaskBlocker[] => {
  const confirmed = confirmedRequirements(task, data);
  return normalizeOtherRequirements(task.otherRequirements).flatMap((requirement) =>
    requirementBlockers(requirement, data, confirmed)
  );
};
