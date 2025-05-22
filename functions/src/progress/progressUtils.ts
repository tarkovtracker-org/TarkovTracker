import functions from 'firebase-functions';
import admin from 'firebase-admin';
import { Firestore, DocumentReference, FieldValue } from 'firebase-admin/firestore';
const STASH_STATION_ID = '5d484fc0654e76006657e0ab'; // Stash ID
const CULTIST_CIRCLE_STATION_ID = '667298e75ea6b4493c08f266'; // Cultist Circle ID
// Interfaces for Data Structures
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
    st?: string; // Status for tasks: 'uncompleted', 'completed', 'failed'
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
  [key: string]: boolean | number | string | FieldValue; // For storing updates using dot notation
}
// Utility Functions
const formatObjective = (
  objectiveData: RawObjectiveData | undefined | null,
  showCount: boolean = false,
  showInvalid: boolean = false
): ObjectiveItem[] => {
  const processedObjectives: ObjectiveItem[] = [];
  if (!objectiveData) return processedObjectives;

  for (const [objectiveKey, objectiveValue] of Object.entries(objectiveData)) {
    let isComplete = false;
    let isFailed = objectiveValue?.failed ?? false; // Default based on an explicit 'failed' field

    // Check if this item uses 'st' field (likely a task)
    if (typeof objectiveValue?.st === 'string') {
      isComplete = objectiveValue.st === 'completed';
      isFailed = objectiveValue.st === 'failed' || isFailed;
    } else if (typeof objectiveValue?.complete === 'boolean') {
      // Otherwise, use the 'complete' boolean field (likely for objectives, hideout items)
      isComplete = objectiveValue.complete;
    }

    const newObjective: ObjectiveItem = {
      id: objectiveKey,
      complete: isComplete,
    };

    if (showCount && typeof objectiveValue?.count === 'number') {
      newObjective.count = objectiveValue.count;
    }

    // Apply invalid status if requested and present
    if (showInvalid && typeof objectiveValue?.invalid === 'boolean') {
      newObjective.invalid = objectiveValue.invalid;
    }

    // Set the failed status
    if (isFailed) {
      newObjective.failed = true;
    }

    // Ensure 'invalid' items are not marked 'complete'
    if (newObjective.invalid) {
      newObjective.complete = false;
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
// --- Helper function to initialize base progress properties
const _initializeBaseProgress = (
  progressData: UserProgressData | undefined | null,
  userId: string
): Omit<
  FormattedProgress,
  'tasksProgress' | 'taskObjectivesProgress' | 'hideoutModulesProgress' | 'hideoutPartsProgress'
> => {
  return {
    displayName: progressData?.displayName ?? userId.substring(0, 6),
    userId: userId,
    playerLevel: progressData?.level ?? 1,
    gameEdition: progressData?.gameEdition ?? 1,
    pmcFaction: progressData?.pmcFaction ?? 'USEC',
  };
};
// --- Helper function to process hideout station completions ---
const _processHideoutStations = (
  currentProgress: FormattedProgress,
  hideoutData: HideoutData | null | undefined,
  gameEdition: number,
  userId: string // Added for logging context
) => {
  if (!hideoutData?.hideoutStations) return;
  const updateStationLevelForProgress = (level: HideoutLevel, progress: FormattedProgress) => {
    // Mark module complete
    let moduleIndex = progress.hideoutModulesProgress.findIndex((mLevel) => mLevel.id === level.id);
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
  };
  try {
    // Stash processing
    const stashStation = hideoutData.hideoutStations.find(
      (station) => station.id === STASH_STATION_ID
    );
    stashStation?.levels?.forEach((level) => {
      if (level.level <= gameEdition) {
        updateStationLevelForProgress(level, currentProgress);
      }
    });
    // Special case: If Unheard Edition (5), mark Cultist Circle as maxed
    if (gameEdition === 5) {
      const cultistCircleStation = hideoutData.hideoutStations.find(
        (station) => station.id === CULTIST_CIRCLE_STATION_ID
      );
      cultistCircleStation?.levels?.forEach((level) => {
        // Mark all levels of cultist circle as complete
        updateStationLevelForProgress(level, currentProgress);
      });
    }
  } catch (error: unknown) {
    functions.logger.error('Error processing hideout station data within helper', {
      error: error instanceof Error ? error.message : String(error),
      userId, // Pass userId for better logging
    });
  }
};
// --- Helper function to apply task invalidation rules ---
const _invalidateTasks = (
  progress: FormattedProgress,
  taskData: TaskData | null | undefined,
  pmcFaction: string,
  userId: string // Added for logging context
) => {
  if (!taskData?.tasks) return;
  try {
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
  } catch (error: unknown) {
    functions.logger.error('Error processing task invalidation rules within helper', {
      error: error instanceof Error ? error.message : String(error),
      userId, // Pass userId for better logging
    });
  }
};
const formatProgress = (
  progressData: UserProgressData | undefined | null,
  userId: string,
  hideoutData: HideoutData | null | undefined,
  taskData: TaskData | null | undefined
): FormattedProgress => {
  const baseProgress = _initializeBaseProgress(progressData, userId);
  const progress: FormattedProgress = {
    ...baseProgress,
    tasksProgress: formatObjective(progressData?.taskCompletions, false, true),
    taskObjectivesProgress: formatObjective(progressData?.taskObjectives, true, true),
    hideoutModulesProgress: formatObjective(progressData?.hideoutModules),
    hideoutPartsProgress: formatObjective(progressData?.hideoutParts, true),
  };
  // --- Hideout Post-processing ---
  _processHideoutStations(progress, hideoutData, progress.gameEdition, userId);
  // --- Task Post-processing ---
  _invalidateTasks(progress, taskData, progress.pmcFaction, userId);
  return progress;
};

// Helper function to update tasks that REQUIRE the changed task
const _updateDependentTasks = async (
  changedTaskId: string,
  newState: string,
  userId: string,
  taskData: TaskData, // Assuming taskData and tasks are non-null by this point
  db: Firestore,
  progressUpdate: ProgressUpdate,
  updateTime: FieldValue
): Promise<void> => {
  for (const dependentTask of taskData.tasks!) {
    for (const req of dependentTask.taskRequirements || []) {
      if (req.task?.id === changedTaskId) {
        let shouldUnlock = false;
        let shouldLock = false;
        if (newState === 'completed' && req.status?.includes('complete')) {
          shouldUnlock = await checkAllRequirementsMet(
            dependentTask,
            changedTaskId,
            newState,
            userId,
            db
          );
        }
        if (newState !== 'completed' && req.status?.includes('complete')) {
          shouldLock = true;
        }
        if (shouldUnlock) {
          progressUpdate[`tasks.${dependentTask.id}.st`] = 'uncompleted'; // Set to unlocked/active
          progressUpdate[`tasks.${dependentTask.id}.cAt`] = updateTime;
        }
        if (shouldLock) {
          progressUpdate[`tasks.${dependentTask.id}.st`] = 'uncompleted'; // Set to locked (no separate locked state)
          progressUpdate[`tasks.${dependentTask.id}.cAt`] = updateTime;
        }
      }
    }
  }
};

// Helper function to update ALTERNATIVE tasks OF the changed task
const _updateAlternativeTasks = (
  changedTask: Task, // Assuming changedTask is non-null
  newState: string,
  progressUpdate: ProgressUpdate,
  updateTime: FieldValue
): void => {
  changedTask.alternatives?.forEach((altTaskId) => {
    if (newState === 'completed') {
      // Current task COMPLETED
      // Mark alternative as failed
      progressUpdate[`tasks.${altTaskId}.st`] = 'failed';
      progressUpdate[`tasks.${altTaskId}.failed`] = true;
      progressUpdate[`tasks.${altTaskId}.cAt`] = updateTime;
    } else if (newState !== 'failed') {
      // Current task is NOT FAILED (i.e., it's active or was un-completed from completed)
      // Mark alternative as active
      // and remove any 'failed' status that might have been set due to this task's prior completion.
      progressUpdate[`tasks.${altTaskId}.st`] = 'uncompleted'; // Set to active (unlocked)
      progressUpdate[`tasks.${altTaskId}.failed`] = FieldValue.delete(); // Remove the 'failed' flag
      progressUpdate[`tasks.${altTaskId}.cAt`] = updateTime;
    }
    // If newState === 'failed', the current logic intentionally does nothing to its alternatives.
  });
};

const updateTaskState = async (
  taskId: string,
  newState: string,
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
  await _updateDependentTasks(
    taskId,
    newState,
    userId,
    taskData as TaskData,
    db,
    progressUpdate,
    updateTime
  );

  // --- Update ALTERNATIVE tasks OF the changed task ---
  _updateAlternativeTasks(changedTask, newState, progressUpdate, updateTime);

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
  newState: string,
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
        if (reqStatus.includes('complete') && newState === 'completed') return true;
        if (reqStatus.includes('failed') && newState === 'failed') return true;
        if (
          reqStatus.includes('active') &&
          (newState === 'uncompleted' || newState === 'completed')
        )
          return true;
        return false;
      }
      // For other task requirements, check if they're satisfied based on current progress
      const otherTaskState = taskCompletions[reqTaskId]?.st;
      if (reqStatus.includes('complete') && otherTaskState === 'completed') {
        return true; // Requirement needs completion and task is complete
      }
      if (
        reqStatus.includes('active') &&
        (otherTaskState === 'uncompleted' || otherTaskState === 'completed')
      ) {
        return true; // Requirement needs activation and task is active or complete
      }
      if (reqStatus.includes('failed') && otherTaskState === 'failed') {
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
