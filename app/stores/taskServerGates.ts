import { isAvailabilityConfirmed } from '@/utils/taskAvailabilityConfirmation';
import {
  globalVariableRequirementMet,
  normalizeOtherRequirements,
  otherRequirementsSignature,
} from '@/utils/taskOtherRequirements';
import type { TaskAvailabilityTeamData, TaskBlocker } from '@/stores/taskAvailability';
import type { Task, TaskOtherRequirement } from '@/types/tarkov';
const confirmedRequirements = (task: Task, data: TaskAvailabilityTeamData): boolean =>
  isAvailabilityConfirmed(
    data.confirmations?.[task.id],
    data.completions[task.id],
    otherRequirementsSignature(task)
  );
const variableBlockers = (
  requirement: Extract<TaskOtherRequirement, { type: 'globalVariable' }>,
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
