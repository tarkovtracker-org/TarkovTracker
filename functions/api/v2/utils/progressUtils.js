import functions from "firebase-functions";
import admin from "firebase-admin";

/**
 * Formats objective data into a standardized format.
 * @param {Object} objectiveData - An object mapping objective IDs to their respective data
 * @param {boolean} showCount - Whether to include the count of the objective
 * @param {boolean} showInvalid - Whether to include whether the objective is invalid
 * @returns {Array} An array of formatted objectives
 */
const formatObjective = (
  objectiveData,
  showCount = false,
  showInvalid = false,
) => {
  let processedObjectives = [];
  if (!objectiveData) return processedObjectives; // Handle null/undefined input

  for (const [objectiveKey, objective] of Object.entries(objectiveData)) {
    let newObjective = {
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
 * @param {object} taskData the task data
 * @param {object} tasksProgress the tasks progress data (will be mutated)
 * @param {object} objectiveProgress the objective progress data (will be mutated)
 * @param {boolean} childOnly whether to only mark the successors of the task as invalid, rather than the task itself
 * @returns {object} an object with the updated tasksProgress and objectiveProgress (references the mutated arrays)
 */
const invalidateTaskRecursive = (
  taskId,
  taskData,
  tasksProgress,
  objectiveProgress,
  childOnly = false,
) => {
  // Find the task in the taskData
  let task = taskData?.tasks?.find((task) => task.id === taskId);
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
    let requiredTasks = taskData?.tasks?.filter((reqTask) =>
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
 * @param {Object} progressData - The progress data for the user
 * @param {string} userId - The ID of the user
 * @param {Object} hideoutData - The hideout data to check for stash modules
 * @param {Object} taskData - The task data to check for invalid tasks
 * @returns {Object} The formatted progress data
 */
const formatProgress = (progressData, userId, hideoutData, taskData) => {
  let taskCompletions = progressData?.taskCompletions ?? {};
  let objectiveCompletions = progressData?.taskObjectives ?? {};
  let hideoutPartCompletions = progressData?.hideoutParts ?? {};
  let hideoutModuleCompletions = progressData?.hideoutModules ?? {};
  let displayName = progressData?.displayName ?? userId.substring(0, 6);
  let playerLevel = progressData?.level ?? 1;
  let gameEdition = progressData?.gameEdition ?? 1;
  let pmcFaction = progressData?.pmcFaction ?? "USEC";

  let progress = {
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
            }
          });
        }
      });
    }
  } catch (error) {
    functions.logger.error("Error processing hideout data", {
      error: error.message,
      userId,
    });
  }

  // --- Task Post-processing ---
  try {
    if (taskData?.tasks) {
      // Invalidate faction-specific tasks
      let invalidFactionTasks = taskData.tasks.filter(
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
      let failedRequirementTasks = taskData.tasks.filter((task) =>
        task.taskRequirements?.some((req) => req.status?.includes("failed")),
      );
      failedRequirementTasks.forEach((failTask) => {
        let shouldInvalidate = failTask.taskRequirements.some(
          (req) =>
            req.status?.length === 1 &&
            req.status[0] === "failed" &&
            !taskCompletions[req.task?.id]?.failed && // Requirement task is NOT marked failed
            taskCompletions[req.task?.id]?.complete, // Requirement task IS marked complete
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
      let alternativeTasks = taskData.tasks.filter(
        (task) => task.alternatives?.length > 0,
      );
      alternativeTasks.forEach((altTask) => {
        let alternativeCompleted = altTask.alternatives.some(
          (altId) =>
            !taskCompletions[altId]?.failed && // Alternative is NOT failed
            taskCompletions[altId]?.complete, // Alternative IS complete
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
  } catch (error) {
    functions.logger.error("Error processing task data", {
      error: error.message,
      userId,
    });
  }

  return progress;
};

/**
 * Updates a task to a specific state (completed, uncompleted, failed) and updates
 * the progress accordingly. If the task has alternative tasks, it will fail them
 * when the task is completed. If the player level is less than the task's level,
 * it will update the player level. If the state is set to uncompleted, it will
 * reset the task and any alternative tasks to uncompleted.
 *
 * @param {object} task - The task to update
 * @param {string} state - The state to update the task to (completed, uncompleted, failed)
 * @param {object} progressData - The user's progress data (used for level check)
 * @param {object} taskData - The full task data (used to find alternative tasks)
 * @param {object} progressUpdate - The object to store the updates to the progress data (will be mutated)
 * @param {number} updateTime - The timestamp to use when updating the progress
 * @returns {object} The mutated progressUpdate object
 */
const updateTaskState = (
  task,
  state,
  progressData,
  taskData,
  progressUpdate,
  updateTime,
) => {
  functions.logger.info(`Updating task ${task.id} to state ${state}`);
  switch (state) {
    case "completed":
      // Step 1: Check if the task has any alternate tasks
      if (task?.alternatives?.length > 0) {
        functions.logger.info(`Failing alternative tasks for task ${task.id}`);
        // Mark the alternative tasks as failed
        task.alternatives.forEach((alternativeTaskId) => {
          let alternativeTask = taskData?.tasks?.find(
            (t) => t.id == alternativeTaskId,
          );
          if (alternativeTask) {
            // Mark the alternative task as failed (complete=true, failed=true)
            progressUpdate[`taskCompletions.${alternativeTaskId}.complete`] =
              true;
            progressUpdate[`taskCompletions.${alternativeTaskId}.failed`] =
              true;
            progressUpdate[`taskCompletions.${alternativeTaskId}.timestamp`] =
              updateTime;
            // Mark objectives as complete
            alternativeTask.objectives?.forEach((objective) => {
              progressUpdate[`taskObjectives.${objective.id}.complete`] = true;
              progressUpdate[`taskObjectives.${objective.id}.timestamp`] =
                updateTime;
            });
          } else {
            functions.logger.warn(
              `Alternative task ${alternativeTaskId} not found for task ${task.id}`,
            );
            // Don't throw, just log and continue
          }
        });
      }
      // Step 2: Mark the task as complete (complete=true, failed=false/deleted)
      progressUpdate[`taskCompletions.${task.id}.complete`] = true;
      progressUpdate[`taskCompletions.${task.id}.failed`] =
        admin.firestore.FieldValue.delete(); // Ensure failed is removed
      progressUpdate[`taskCompletions.${task.id}.timestamp`] = updateTime;
      // Step 3: Mark the task's objectives as complete
      task.objectives?.forEach((objective) => {
        progressUpdate[`taskObjectives.${objective.id}.complete`] = true;
        progressUpdate[`taskObjectives.${objective.id}.timestamp`] = updateTime;
      });
      // Step 4: if player level is less than the task's level, update the player level
      if ((progressData?.level ?? 1) < task.minPlayerLevel) {
        functions.logger.info(
          `Updating player level to ${task.minPlayerLevel}`,
        );
        progressUpdate["level"] = task.minPlayerLevel;
      }
      break;
    case "uncompleted":
      // Mark the task as uncompleted (complete=false, failed=false)
      progressUpdate[`taskCompletions.${task.id}.complete`] = false;
      progressUpdate[`taskCompletions.${task.id}.failed`] = false;
      progressUpdate[`taskCompletions.${task.id}.timestamp`] =
        admin.firestore.FieldValue.delete();
      // Mark objectives as uncompleted
      task.objectives?.forEach((objective) => {
        progressUpdate[`taskObjectives.${objective.id}.complete`] = false;
        progressUpdate[`taskObjectives.${objective.id}.timestamp`] =
          admin.firestore.FieldValue.delete();
      });
      // Check if the task has any alternate tasks
      if (task?.alternatives?.length > 0) {
        // Mark the alternative tasks as uncompleted
        task.alternatives.forEach((alternativeTaskId) => {
          let alternativeTask = taskData?.tasks?.find(
            (t) => t.id == alternativeTaskId,
          );
          if (alternativeTask) {
            // Mark the alternative task as uncompleted
            progressUpdate[`taskCompletions.${alternativeTaskId}.complete`] =
              false;
            progressUpdate[`taskCompletions.${alternativeTaskId}.failed`] =
              false;
            progressUpdate[`taskCompletions.${alternativeTaskId}.timestamp`] =
              admin.firestore.FieldValue.delete();
            // Mark objectives as uncompleted
            alternativeTask.objectives?.forEach((objective) => {
              progressUpdate[`taskObjectives.${objective.id}.complete`] = false;
              progressUpdate[`taskObjectives.${objective.id}.timestamp`] =
                admin.firestore.FieldValue.delete();
            });
          } else {
            functions.logger.warn(
              `Alternative task ${alternativeTaskId} not found for task ${task.id} during uncompletion`,
            );
          }
        });
      }
      break;
    case "failed":
      // Mark the task as failed (complete=true, failed=true)
      progressUpdate[`taskCompletions.${task.id}.complete`] = true;
      progressUpdate[`taskCompletions.${task.id}.failed`] = true;
      progressUpdate[`taskCompletions.${task.id}.timestamp`] = updateTime;
      // Mark the task's objectives as complete (even if failed, objectives are considered done)
      task.objectives?.forEach((objective) => {
        progressUpdate[`taskObjectives.${objective.id}.complete`] = true;
        progressUpdate[`taskObjectives.${objective.id}.timestamp`] = updateTime;
      });
      break;
    default:
      functions.logger.error(`Unknown state ${state} for task ${task.id}`);
      // Don't throw, allow transaction to potentially continue if other updates are valid
      break;
  }
  return progressUpdate; // Return the mutated object
};

export {
  formatObjective,
  invalidateTaskRecursive,
  formatProgress,
  updateTaskState,
};
