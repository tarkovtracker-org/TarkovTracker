import functions from 'firebase-functions';
import admin from 'firebase-admin';
import { Firestore, DocumentReference, FieldValue } from 'firebase-admin/firestore';
const STASH_STATION_ID = '5d484fc0654e76006657e0ab'; // Stash ID
// --- Interfaces for Data Structures ---
// Basic Objective/Progress Item Structure
interface ObjectiveItem {
  id: string;
  complete: boolean;
  count?: number;
  invalid?: boolean;
  failed?: boolean;
}
// Raw Progress Data (from Firestore or initial processing)
interface RawObjectiveData {
  [key: string]: {
    complete?: boolean;
    count?: number;
    invalid?: boolean;
    failed?: boolean;
  };
}
interface TaskRequirement {
  task?: { id: string };
  status?: string[];
}
interface TaskObjective {
  id: string;
}
interface Task {
  id: string;
  objectives?: TaskObjective[];
  taskRequirements?: TaskRequirement[];
  factionName?: string;
  alternatives?: string[];
}
interface TaskData {
  tasks?: Task[];
}
interface HideoutItemRequirement {
  id: string;
  count: number;
}
interface HideoutLevel {
  id: string;
  level: number;
  itemRequirements?: HideoutItemRequirement[];
}
interface HideoutStation {
  id: string;
  levels?: HideoutLevel[];
}
interface HideoutData {
  hideoutStations?: HideoutStation[];
}
// User Progress Data (from Firestore)
interface UserProgressData {
  taskCompletions?: RawObjectiveData;
  taskObjectives?: RawObjectiveData;
  hideoutParts?: RawObjectiveData;
  hideoutModules?: RawObjectiveData;
  displayName?: string;
  level?: number;
  gameEdition?: number;
  pmcFaction?: string;
}
// Formatted Progress Structure (returned by formatProgress)
interface FormattedProgress {
  tasksProgress: ObjectiveItem[];
  taskObjectivesProgress: ObjectiveItem[];
  hideoutModulesProgress: ObjectiveItem[];
  hideoutPartsProgress: ObjectiveItem[];
  displayName: string;
  userId: string;
  playerLevel: number;
  gameEdition: number;
  pmcFaction: string;
}
// Task State Update Structure
interface ProgressUpdate {
  [key: string]: boolean | number | FieldValue; // For storing updates using dot notation
}
// --- Utility Functions ---
const formatObjective = (
  objectiveData: RawObjectiveData | undefined | null,
  showCount: boolean = false,
  showInvalid: boolean = false
): ObjectiveItem[] => {
  const processedObjectives: ObjectiveItem[] = [];
  if (!objectiveData) return processedObjectives;
  for (const [objectiveKey, objective] of Object.entries(objectiveData)) {
    const newObjective: ObjectiveItem = {
      id: objectiveKey,
      complete: objective?.complete ?? false,
    };
    if (showCount) {
      newObjective.count = objective?.count ?? 0;
    }
    if (showInvalid) {
      newObjective.invalid = objective?.invalid ?? false;
    }
    if (objective?.failed) {
      newObjective.failed = objective.failed;
    }
    processedObjectives.push(newObjective);
  }
  return processedObjectives;
};
const invalidateTaskRecursive = (
  taskId: string,
  taskData: TaskData | null | undefined,
  tasksProgress: ObjectiveItem[],
  objectiveProgress: ObjectiveItem[],
  childOnly: boolean = false
): { tasksProgress: ObjectiveItem[]; objectiveProgress: ObjectiveItem[] } => {
  // Find the task in the taskData
  const task = taskData?.tasks?.find((task) => task.id === taskId);
  if (task != null) {
    // Child only means we only mark the successors as invalid, not the task itself, this is used for alternative tasks
    if (!childOnly) {
      // Find the index of the task in the tasksProgress
      let taskIndex = tasksProgress.findIndex((t) => t.id === taskId);
      // Mark the task as invalid
      if (taskIndex !== -1) {
        tasksProgress[taskIndex].invalid = true;
        tasksProgress[taskIndex].complete = false; // Ensure invalid tasks are not complete
      } else {
        tasksProgress.push({ id: taskId, complete: false, invalid: true });
      }
      // For each objective of the task, mark it as invalid
      task.objectives?.forEach((objective) => {
        let objectiveIndex = objectiveProgress.findIndex((o) => o.id === objective.id);
        if (objectiveIndex !== -1) {
          objectiveProgress[objectiveIndex].invalid = true;
          objectiveProgress[objectiveIndex].complete = false; // Ensure invalid objectives are not complete
        } else {
          objectiveProgress.push({
            id: objective.id,
            complete: false,
            count: 0,
            invalid: true,
          });
        }
      });
    }
    // Find all of the tasks that have this task as a requirement
    const requiredTasks = taskData?.tasks?.filter((reqTask) =>
      reqTask.taskRequirements?.some(
        (requirement) =>
          requirement.task?.id === taskId &&
          requirement.status?.some((status) => status === 'complete' || status === 'active')
      )
    );
    requiredTasks?.forEach((requiredTask) => {
      // Recursively call this function on the task that requires this task
      // Note: This mutates the original arrays passed in, so no need to reassign
      invalidateTaskRecursive(requiredTask.id, taskData, tasksProgress, objectiveProgress);
    });
  }
  // Return references to the (potentially mutated) arrays
  return { tasksProgress, objectiveProgress };
};
const formatProgress = (
  progressData: UserProgressData | undefined | null,
  userId: string,
  hideoutData: HideoutData | null | undefined,
  taskData: TaskData | null | undefined
): FormattedProgress => {
  const taskCompletions = progressData?.taskCompletions ?? {};
  const objectiveCompletions = progressData?.taskObjectives ?? {};
  const hideoutPartCompletions = progressData?.hideoutParts ?? {};
  const hideoutModuleCompletions = progressData?.hideoutModules ?? {};
  const displayName = progressData?.displayName ?? userId.substring(0, 6);
  const playerLevel = progressData?.level ?? 1;
  const gameEdition = progressData?.gameEdition ?? 1;
  const pmcFaction = progressData?.pmcFaction ?? 'USEC';
  const progress: FormattedProgress = {
    tasksProgress: formatObjective(taskCompletions, false, true),
    taskObjectivesProgress: formatObjective(objectiveCompletions, true, true),
    hideoutModulesProgress: formatObjective(hideoutModuleCompletions),
    hideoutPartsProgress: formatObjective(hideoutPartCompletions, true),
    displayName: displayName,
    userId: userId,
    playerLevel: playerLevel,
    gameEdition: gameEdition,
    pmcFaction: pmcFaction,
  };
  // --- Hideout Post-processing ---
  try {
    if (hideoutData?.hideoutStations) {
      const stashStation = hideoutData.hideoutStations.find(
        (station) => station.id === STASH_STATION_ID
      );
      stashStation?.levels?.forEach((level) => {
        if (level.level <= gameEdition) {
          // Mark module complete
          let moduleIndex = progress.hideoutModulesProgress.findIndex(
            (mLevel) => mLevel.id === level.id
          );
          if (moduleIndex === -1) {
            progress.hideoutModulesProgress.push({
              id: level.id,
              complete: true,
            });
          } else {
            progress.hideoutModulesProgress[moduleIndex].complete = true;
          }
          // Mark parts complete
          level.itemRequirements?.forEach((item) => {
            let partIndex = progress.hideoutPartsProgress.findIndex((part) => part.id === item.id);
            if (partIndex === -1) {
              progress.hideoutPartsProgress.push({
                id: item.id,
                complete: true,
                count: item.count,
              });
            } else {
              progress.hideoutPartsProgress[partIndex].complete = true;
              // Note: Should we update count here too if it differs?
            }
          });
        }
      });
    }
  } catch (error: unknown) {
    functions.logger.error('Error processing hideout data', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
  }
  // --- Task Post-processing ---
  try {
    if (taskData?.tasks) {
      // Invalidate faction-specific tasks
      const invalidFactionTasks = taskData.tasks.filter(
        (task) => task.factionName !== 'Any' && task.factionName !== pmcFaction
      );
      invalidFactionTasks.forEach((task) => {
        invalidateTaskRecursive(
          task.id,
          taskData,
          progress.tasksProgress,
          progress.taskObjectivesProgress
        );
      });
      // Invalidate tasks with failed requirements if the requirement isn't actually failed
      const failedRequirementTasks = taskData.tasks.filter((task) =>
        task.taskRequirements?.some((req) => req.status?.includes('failed'))
      );
      failedRequirementTasks.forEach((failTask) => {
        const shouldInvalidate = failTask.taskRequirements?.some(
          (req) =>
            req?.status?.length === 1 &&
            req.status[0] === 'failed' &&
            req.task?.id &&
            !progress.tasksProgress.find((t) => t.id === req.task!.id)?.failed &&
            progress.tasksProgress.find((t) => t.id === req.task!.id)?.complete
        );
        if (shouldInvalidate) {
          invalidateTaskRecursive(
            failTask.id,
            taskData,
            progress.tasksProgress,
            progress.taskObjectivesProgress
          );
        }
      });
      // Invalidate tasks if an alternative task is completed
      const alternativeTasks = taskData.tasks.filter(
        (task) => task.alternatives && task.alternatives.length > 0
      );
      alternativeTasks.forEach((altTask) => {
        const alternativeCompleted = altTask.alternatives?.some(
          (altId) =>
            !progress.tasksProgress.find((t) => t.id === altId)?.failed && // Alternative is NOT failed
            progress.tasksProgress.find((t) => t.id === altId)?.complete // Alternative IS complete
        );
        if (alternativeCompleted) {
          // Invalidate the original task and its successors (childOnly = true)
          invalidateTaskRecursive(
            altTask.id,
            taskData,
            progress.tasksProgress,
            progress.taskObjectivesProgress,
            true
          );
        }
      });
    }
  } catch (error: unknown) {
    functions.logger.error('Error processing task data', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
  }
  return progress;
};
const updateTaskState = async (
  taskId: string,
  newState: number,
  userId: string,
  taskData: TaskData | null | undefined
): Promise<void> => {
  if (!taskData?.tasks) return;
  const db: Firestore = admin.firestore();
  const progressRef: DocumentReference = db.collection('progress').doc(userId);
  const updateTime = FieldValue.serverTimestamp();
  const progressUpdate: ProgressUpdate = {};
  const changedTask = taskData.tasks.find((t) => t.id === taskId);
  if (!changedTask) return;
  // --- Update tasks that REQUIRE the changed task ---
  for (const dependentTask of taskData.tasks) {
    // Using for...of instead of forEach to support async/await
    for (const req of dependentTask.taskRequirements || []) {
      if (req.task?.id === taskId) {
        let shouldUnlock = false;
        let shouldLock = false;
        // Check if ALL requirements are now met for unlocking
        if (newState === 2 && req.status?.includes('complete')) {
          // This requirement is now satisfied, but we need to check if ALL requirements are met
          shouldUnlock = await checkAllRequirementsMet(dependentTask, taskId, newState, userId, db);
        }
        // Check if ANY requirement is now unmet for locking
        if (newState !== 2 && req.status?.includes('complete')) {
          // If requirement needs completion, but changed task is no longer complete
          shouldLock = true;
        }
        // Apply updates based on conditions
        if (shouldUnlock) {
          // Mark the task as potentially unlockable
          // In a real implementation, we would check actual status first
          progressUpdate[`tasks.${dependentTask.id}.st`] = 1; // Set to unlocked/active
          progressUpdate[`tasks.${dependentTask.id}.cAt`] = updateTime; // Record when changed
        }
        if (shouldLock) {
          // Task should be locked because requirement is no longer met
          progressUpdate[`tasks.${dependentTask.id}.st`] = 0; // Set to locked
          progressUpdate[`tasks.${dependentTask.id}.cAt`] = updateTime; // Record when changed
        }
      }
    }
  }
  // --- Update ALTERNATIVE tasks OF the changed task ---
  changedTask.alternatives?.forEach((altTaskId) => {
    if (newState === 2) {
      // If changed task completed, mark alternative as failed (state 3)
      progressUpdate[`tasks.${altTaskId}.st`] = 3;
      progressUpdate[`tasks.${altTaskId}.failed`] = true; // If using a failed flag
      progressUpdate[`tasks.${altTaskId}.cAt`] = updateTime; // Record when this change happened
    }
    // Add logic if changed task failed
  });
  // Commit any collected updates
  if (Object.keys(progressUpdate).length > 0) {
    try {
      await progressRef.update(progressUpdate);
      functions.logger.log('Updated dependent task states', {
        userId,
        changedTaskId: taskId,
        newState,
        updates: progressUpdate,
      });
    } catch (error: unknown) {
      functions.logger.error('Error updating dependent task states', {
        userId,
        changedTaskId: taskId,
        newState,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

/**
 * Checks if all requirements for a task are met, considering current progress
 */
const checkAllRequirementsMet = async (
  dependentTask: Task,
  changedTaskId: string,
  newState: number,
  userId: string,
  db: Firestore
): Promise<boolean> => {
  try {
    const progressRef: DocumentReference = db.collection('progress').doc(userId);
    const progressDoc = await progressRef.get();
    const progressData = progressDoc.data() || {};
    const taskCompletions = progressData.tasks || {};
    // Check if ALL requirements for this dependent task are satisfied
    const allReqsMet = dependentTask.taskRequirements?.every((innerReq) => {
      if (!innerReq.task?.id) return true; // Skip if requirement has no task id
      const reqTaskId = innerReq.task.id;
      const reqStatus = innerReq.status || [];
      // If this is the task that just changed status
      if (reqTaskId === changedTaskId) {
        // Check if the new state satisfies the requirement
        if (reqStatus.includes('complete') && newState === 2) return true;
        if (reqStatus.includes('failed') && newState === 3) return true;
        if (reqStatus.includes('active') && (newState === 1 || newState === 2)) return true;
        return false;
      }
      // For other task requirements, check if they're satisfied based on current progress
      const otherTaskState = taskCompletions[reqTaskId]?.st;
      if (reqStatus.includes('complete') && otherTaskState === 2) {
        return true; // Requirement needs completion and task is complete
      }
      if (reqStatus.includes('active') && (otherTaskState === 1 || otherTaskState === 2)) {
        return true; // Requirement needs activation and task is active or complete
      }
      if (reqStatus.includes('failed') && otherTaskState === 3) {
        return true; // Requirement needs failure and task is failed
      }
      return false; // Requirement not met
    });
    if (allReqsMet) {
      functions.logger.log('All requirements met for task unlocking', {
        userId,
        taskId: dependentTask.id,
        changedTaskId,
      });
      return true;
    }
    return false;
  } catch (error) {
    functions.logger.error('Error checking task requirements:', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      taskId: dependentTask.id,
    });
    // Default to the simplified behavior if checking fails
    return true;
  }
};

export { formatProgress, invalidateTaskRecursive, updateTaskState };
