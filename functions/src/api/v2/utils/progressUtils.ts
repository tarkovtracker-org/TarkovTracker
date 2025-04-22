import functions from "firebase-functions";
import admin from "firebase-admin";
import {
  Firestore,
  DocumentReference,
  FieldValue,
} from "firebase-admin/firestore";

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

// Task Data Structures (based on usage)
interface TaskRequirement {
  task?: { id: string };
  status?: string[];
}

interface TaskObjective {
  id: string;
  // other objective properties if needed
}

interface Task {
  id: string;
  objectives?: TaskObjective[];
  taskRequirements?: TaskRequirement[];
  factionName?: string;
  alternatives?: string[];
  // other task properties
}

interface TaskData {
  tasks?: Task[];
  // other task data properties
}

// Hideout Data Structures (based on usage)
interface HideoutItemRequirement {
  id: string;
  count: number;
  // other item properties
}

interface HideoutLevel {
  id: string;
  level: number;
  itemRequirements?: HideoutItemRequirement[];
  // other level properties
}

interface HideoutStation {
  id: string;
  levels?: HideoutLevel[];
  // other station properties
}

interface HideoutData {
  hideoutStations?: HideoutStation[];
  // other hideout data properties
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
  [key: string]: any; // For storing updates using dot notation
}

// --- Utility Functions ---

/**
 * Formats objective data into a standardized format.
 * @param {RawObjectiveData | undefined | null} objectiveData - An object mapping objective IDs to their respective data
 * @param {boolean} [showCount=false] - Whether to include the count of the objective
 * @param {boolean} [showInvalid=false] - Whether to include whether the objective is invalid
 * @returns {ObjectiveItem[]} An array of formatted objectives
 */
const formatObjective = (
  objectiveData: RawObjectiveData | undefined | null,
  showCount = false,
  showInvalid = false,
): ObjectiveItem[] => {
  const processedObjectives: ObjectiveItem[] = [];
  if (!objectiveData) return processedObjectives; // Handle null/undefined input

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

/**
 * Finds the task in the taskData, marks it as invalid in the tasksProgress, and marks all of its objectives as invalid in the objectiveProgress
 * Finally, calls this function on all of the tasks that have this task as a requirement
 * @param {string} taskId the id of the task to invalidate
 * @param {TaskData | null | undefined} taskData the task data
 * @param {ObjectiveItem[]} tasksProgress the tasks progress data (will be mutated)
 * @param {ObjectiveItem[]} objectiveProgress the objective progress data (will be mutated)
 * @param {boolean} [childOnly=false] whether to only mark the successors of the task as invalid, rather than the task itself
 * @returns {{ tasksProgress: ObjectiveItem[]; objectiveProgress: ObjectiveItem[] }} an object with the updated tasksProgress and objectiveProgress (references the mutated arrays)
 */
const invalidateTaskRecursive = (
  taskId: string,
  taskData: TaskData | null | undefined,
  tasksProgress: ObjectiveItem[],
  objectiveProgress: ObjectiveItem[],
  childOnly = false,
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
        let objectiveIndex = objectiveProgress.findIndex(
          (o) => o.id === objective.id,
        );
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
          requirement.status?.some(
            (status) => status === "complete" || status === "active",
          ),
      ),
    );
    requiredTasks?.forEach((requiredTask) => {
      // Recursively call this function on the task that requires this task
      // Note: This mutates the original arrays passed in, so no need to reassign
      invalidateTaskRecursive(
        requiredTask.id,
        taskData,
        tasksProgress,
        objectiveProgress,
      );
    });
  }
  // Return references to the (potentially mutated) arrays
  return { tasksProgress, objectiveProgress };
};

/**
 * Formats the progress data for a given user
 * @param {UserProgressData | undefined | null} progressData - The progress data for the user
 * @param {string} userId - The ID of the user
 * @param {HideoutData | null | undefined} hideoutData - The hideout data to check for stash modules
 * @param {TaskData | null | undefined} taskData - The task data to check for invalid tasks
 * @returns {FormattedProgress} The formatted progress data
 */
const formatProgress = (
  progressData: UserProgressData | undefined | null,
  userId: string,
  hideoutData: HideoutData | null | undefined,
  taskData: TaskData | null | undefined,
): FormattedProgress => {
  const taskCompletions = progressData?.taskCompletions ?? {};
  const objectiveCompletions = progressData?.taskObjectives ?? {};
  const hideoutPartCompletions = progressData?.hideoutParts ?? {};
  const hideoutModuleCompletions = progressData?.hideoutModules ?? {};
  const displayName = progressData?.displayName ?? userId.substring(0, 6);
  const playerLevel = progressData?.level ?? 1;
  const gameEdition = progressData?.gameEdition ?? 1;
  const pmcFaction = progressData?.pmcFaction ?? "USEC";

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
        (station) => station.id === "5d484fc0654e76006657e0ab", // Stash ID
      );
      stashStation?.levels?.forEach((level) => {
        if (level.level <= gameEdition) {
          // Mark module complete
          let moduleIndex = progress.hideoutModulesProgress.findIndex(
            (mLevel) => mLevel.id === level.id,
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
            let partIndex = progress.hideoutPartsProgress.findIndex(
              (part) => part.id === item.id,
            );
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
  } catch (error: any) {
    functions.logger.error("Error processing hideout data", {
      error: error.message,
      userId,
    });
  }

  // --- Task Post-processing ---
  try {
    if (taskData?.tasks) {
      // Invalidate faction-specific tasks
      const invalidFactionTasks = taskData.tasks.filter(
        (task) => task.factionName !== "Any" && task.factionName !== pmcFaction,
      );
      invalidFactionTasks.forEach((task) => {
        invalidateTaskRecursive(
          task.id,
          taskData,
          progress.tasksProgress,
          progress.taskObjectivesProgress,
        );
      });

      // Invalidate tasks with failed requirements if the requirement isn't actually failed
      const failedRequirementTasks = taskData.tasks.filter((task) =>
        task.taskRequirements?.some((req) => req.status?.includes("failed")),
      );
      failedRequirementTasks.forEach((failTask) => {
        const shouldInvalidate = failTask.taskRequirements?.some(
          (req) =>
            req?.status?.length === 1 &&
            req.status[0] === "failed" &&
            req.task?.id && // Check if task ID exists
            !progress.tasksProgress.find((t) => t.id === req.task!.id)
              ?.failed && // Requirement task is NOT marked failed
            progress.tasksProgress.find((t) => t.id === req.task!.id)?.complete, // Requirement task IS marked complete
        );
        if (shouldInvalidate) {
          invalidateTaskRecursive(
            failTask.id,
            taskData,
            progress.tasksProgress,
            progress.taskObjectivesProgress,
          );
        }
      });

      // Invalidate tasks if an alternative task is completed
      const alternativeTasks = taskData.tasks.filter(
        (task) => task.alternatives && task.alternatives.length > 0,
      );
      alternativeTasks.forEach((altTask) => {
        const alternativeCompleted = altTask.alternatives?.some(
          (altId) =>
            !progress.tasksProgress.find((t) => t.id === altId)?.failed && // Alternative is NOT failed
            progress.tasksProgress.find((t) => t.id === altId)?.complete, // Alternative IS complete
        );
        if (alternativeCompleted) {
          // Invalidate the original task and its successors (childOnly = true)
          invalidateTaskRecursive(
            altTask.id,
            taskData,
            progress.tasksProgress,
            progress.taskObjectivesProgress,
            true,
          );
        }
      });
    }
  } catch (error: any) {
    functions.logger.error("Error processing task data", {
      error: error.message,
      userId,
    });
  }

  return progress;
};

/**
 * Updates the state of related tasks based on a change in one task's status.
 * @param {string} taskId - The ID of the task that changed.
 * @param {number} newState - The new state (0: Locked, 1: Unlocked, 2: Complete, 3: Failed).
 * @param {string} userId - The ID of the user whose progress is being updated.
 * @param {TaskData | null | undefined} taskData - The global task data.
 */
const updateTaskState = async (
  taskId: string,
  newState: number,
  userId: string,
  taskData: TaskData | null | undefined,
): Promise<void> => {
  if (!taskData?.tasks) return;

  const db: Firestore = admin.firestore();
  const progressRef: DocumentReference = db.collection("progress").doc(userId);
  const updateTime = FieldValue.serverTimestamp();
  const progressUpdate: ProgressUpdate = {};

  const changedTask = taskData.tasks.find((t) => t.id === taskId);
  if (!changedTask) return;

  // --- Update tasks that REQUIRE the changed task ---
  taskData.tasks.forEach((dependentTask) => {
    dependentTask.taskRequirements?.forEach((req) => {
      if (req.task?.id === taskId) {
        let shouldUnlock = false;
        let shouldLock = false;

        // Check if ALL requirements are now met for unlocking
        if (newState === 2) {
          // If changed task is completed
          // Check if other requirements are also met
          // This logic needs refinement based on how requirements are structured (AND/OR)
          // Assuming AND for now:
          const allReqsMet = dependentTask.taskRequirements?.every(
            (innerReq) => {
              const reqTaskId = innerReq.task?.id;
              if (!reqTaskId) return true; // Skip if requirement has no task id?

              const reqStatus = innerReq.status ?? [];
              // Simple check: if req needs 'complete', check if it IS complete
              if (reqStatus.includes("complete")) {
                // Need to check actual progress data here - HOW?
                // Requires fetching progress data, which makes this complex
                // For now, assume we cannot reliably check other task status here
                // Mark as potentially unlockable, needs full check elsewhere
                // TODO: Implement full requirement checking if needed here
              }
              return false; // Placeholder: Cannot determine if all reqs met
            },
          );
          // if (allReqsMet) shouldUnlock = true; // Simplified - cannot check other tasks
        }

        // Check if ANY requirement is now unmet for locking
        // e.g., if changed task failed or went back to locked/unlocked
        if (newState !== 2 && req.status?.includes("complete")) {
          // If requirement needs completion, but changed task is no longer complete
          // shouldLock = true; // Needs logic to determine current state
        }

        // Apply updates (simplified due to lack of full progress context)
        if (shouldUnlock) {
          // Only unlock if currently locked (state 0)
          // Requires current state - cannot do reliably here
        }
        if (shouldLock) {
          // Only lock if currently unlocked (state 1)
          // Requires current state - cannot do reliably here
        }
      }
    });
  });

  // --- Update tasks that are ALTERNATIVES to the changed task ---
  // If task completed, potentially fail alternatives?
  // If task failed, potentially unlock alternatives?
  // This requires specific game logic.

  // --- Update ALTERNATIVE tasks OF the changed task ---
  changedTask.alternatives?.forEach((altTaskId) => {
    if (newState === 2) {
      // If changed task completed
      // Mark alternative as failed (state 3)?
      // progressUpdate[`tasks.${altTaskId}.st`] = 3;
      // progressUpdate[`tasks.${altTaskId}.failed`] = true; // If using a failed flag
      // progressUpdate[`tasks.${altTaskId}.cAt`] = updateTime;
    }
    // Add logic if changed task failed
  });

  // Commit any collected updates
  if (Object.keys(progressUpdate).length > 0) {
    try {
      await progressRef.update(progressUpdate);
      functions.logger.log("Updated dependent task states", {
        userId,
        changedTaskId: taskId,
        newState,
        updates: progressUpdate,
      });
    } catch (error: any) {
      functions.logger.error("Error updating dependent task states", {
        userId,
        changedTaskId: taskId,
        newState,
        error: error.message,
      });
    }
  }
};

export { formatProgress, invalidateTaskRecursive, updateTaskState };
