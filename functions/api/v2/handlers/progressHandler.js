import functions from "firebase-functions";
import admin from "firebase-admin";
import { getTaskData, getHideoutData } from "../utils/dataLoaders.js";
import { formatProgress, updateTaskState } from "../utils/progressUtils.js";

/**
 * @openapi
 * /progress:
 *   get:
 *     summary: "Returns progress data of the player"
 *     tags:
 *       - "Progress"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Player progress retrieved successfully."
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: "#/components/schemas/Progress"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     self:
 *                       type: string
 *                       description: "The user ID of the requester."
 *       401:
 *         description: "Unauthorized. Invalid token or missing 'GP' permission."
 *       500:
 *         description: "Internal server error."
 */
const getPlayerProgress = async (req, res) => {
  if (req.apiToken?.owner && req.apiToken.permissions?.includes("GP")) {
    const db = admin.firestore();
    const ownerId = req.apiToken.owner;
    const progressRef = db.collection("progress").doc(ownerId);

    try {
      let progressDoc = null;
      let taskData = null;
      let hideoutData = null;

      // Fetch data concurrently
      const progressPromise = progressRef.get();
      const hideoutPromise = getHideoutData();
      const taskPromise = getTaskData();

      [progressDoc, hideoutData, taskData] = await Promise.all([
        progressPromise,
        hideoutPromise,
        taskPromise,
      ]);

      if (!progressDoc.exists) {
        functions.logger.warn(
          `Progress document not found for user ${ownerId}`,
        );
        // Send empty progress structure? Or 404? Let's send formatted empty for now.
      }

      let progressData = formatProgress(
        progressDoc.data(), // Will be undefined if !exists, formatProgress handles this
        ownerId,
        hideoutData,
        taskData,
      );

      res.status(200).json({ data: progressData, meta: { self: ownerId } });
    } catch (error) {
      functions.logger.error("Error fetching player progress:", {
        error: error.message,
        userId: ownerId,
      });
      res.status(500).send({ error: "Failed to retrieve player progress." });
    }
  } else {
    res
      .status(401)
      .send({ error: "Unauthorized or insufficient permissions." });
  }
};

/**
 * @openapi
 * /team/progress:
 *   get:
 *     summary: "Returns progress data of all members of the team"
 *     tags:
 *       - "Progress"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Team progress retrieved successfully."
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/Progress"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     self:
 *                       type: string
 *                       description: "The user ID of the requester."
 *                     hiddenTeammates:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: "List of teammate IDs hidden by the requester."
 *       401:
 *         description: "Unauthorized. Invalid token or missing 'TP' permission."
 *       500:
 *         description: "Internal server error."
 */
const getTeamProgress = async (req, res) => {
  if (req.apiToken?.owner && req.apiToken.permissions?.includes("TP")) {
    const db = admin.firestore();
    const ownerId = req.apiToken.owner;

    try {
      // Get the requesters meta documents, hideout data, and task data concurrently
      const systemRef = db.collection("system").doc(ownerId);
      const userRef = db.collection("user").doc(ownerId);

      let systemDoc = null;
      let userDoc = null;
      let hideoutData = null;
      let taskData = null;

      const systemPromise = systemRef.get();
      const userPromise = userRef.get();
      const hideoutPromise = getHideoutData();
      const taskPromise = getTaskData();

      [systemDoc, userDoc, hideoutData, taskData] = await Promise.all([
        systemPromise,
        userPromise,
        hideoutPromise,
        taskPromise,
      ]);

      const teamId = systemDoc.exists ? systemDoc.data()?.team : null;
      const hiddenTeammatesMap = userDoc.exists ? userDoc.data()?.teamHide : {};
      let memberIds = [ownerId]; // Start with the requester
      let teamDoc = null;

      if (teamId) {
        const teamRef = db.collection("team").doc(teamId);
        teamDoc = await teamRef.get();
        if (teamDoc.exists) {
          // Use Set to ensure uniqueness and include owner
          memberIds = [
            ...new Set([...(teamDoc.data()?.members ?? []), ownerId]),
          ];
        } else {
          functions.logger.warn(
            `Team document ${teamId} not found for user ${ownerId}`,
          );
          // Proceed with only the owner's progress
        }
      }

      // Prepare progress fetch promises
      const progressPromises = memberIds.map((memberId) =>
        db.collection("progress").doc(memberId).get(),
      );

      // Fetch all progress docs
      const progressDocs = await Promise.all(progressPromises);

      // Format progress for each member
      const teamResponse = progressDocs
        .map((memberDoc) => {
          if (!memberDoc.exists) {
            functions.logger.warn(
              `Progress document not found for member ${memberDoc.ref.id}`,
            );
            return null; // Skip members without progress docs
          }
          const memberId = memberDoc.ref.id; // Get ID from ref
          return formatProgress(
            memberDoc.data(),
            memberId,
            hideoutData,
            taskData,
          );
        })
        .filter((p) => p !== null); // Filter out nulls

      // Determine hidden teammates based on the fetched member list
      const hiddenTeammates = memberIds.filter(
        (id) => id !== ownerId && hiddenTeammatesMap?.[id],
      );

      res.status(200).json({
        data: teamResponse,
        meta: { self: ownerId, hiddenTeammates: hiddenTeammates },
      });
    } catch (error) {
      functions.logger.error("Error fetching team progress:", {
        error: error.message,
        userId: ownerId,
      });
      res.status(500).send({ error: "Failed to retrieve team progress." });
    }
  } else {
    res
      .status(401)
      .send({ error: "Unauthorized or insufficient permissions." });
  }
};

/**
 * @openapi
 * /progress/level/{levelValue}:
 *   post:
 *     summary: "Sets player's level to value specified in the path"
 *     tags:
 *       - "Progress"
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: "levelValue"
 *         in: "path"
 *         description: "Player's new level"
 *         required: true
 *         schema:
 *           type: "integer"
 *           minimum: 1
 *     responses:
 *       200:
 *         description: "Player's level was updated successfully"
 *       400:
 *         description: "Invalid level value provided."
 *       401:
 *         description: "Unauthorized. Invalid token or missing 'WP' permission."
 *       500:
 *         description: "Internal server error."
 */
const setPlayerLevel = async (req, res) => {
  if (req.apiToken?.owner && req.apiToken.permissions?.includes("WP")) {
    const db = admin.firestore();
    const ownerId = req.apiToken.owner;
    const requesterProgressRef = db.collection("progress").doc(ownerId);
    const levelValue = parseInt(req.params.levelValue, 10);

    if (!isNaN(levelValue) && levelValue >= 1) {
      try {
        await requesterProgressRef.set(
          {
            level: levelValue,
          },
          { merge: true },
        );
        res.status(200).send({ message: "Level updated successfully." });
      } catch (error) {
        functions.logger.error("Error setting player level:", {
          error: error.message,
          userId: ownerId,
          level: levelValue,
        });
        res.status(500).send({ error: "Failed to update player level." });
      }
    } else {
      res.status(400).send({ error: "Invalid level value provided." });
    }
  } else {
    res
      .status(401)
      .send({ error: "Unauthorized or insufficient permissions." });
  }
};

/**
 * @openapi
 * /progress/task/{taskId}:
 *   post:
 *     summary: Update single task progress
 *     tags:
 *       - "Progress"
 *     security:
 *       - bearerAuth: []
 *     description: Update the progress of a single task with the provided state.
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         description: The ID of the task to update.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       description: The new state of the task.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               state:
 *                 type: string
 *                 description: The new state of the task.
 *                 enum: [uncompleted, completed, failed]
 *             required:
 *               - state
 *     responses:
 *       '200':
 *         description: The task was updated successfully.
 *       '400':
 *         description: Invalid request parameters (missing state, invalid state, unknown task).
 *       '401':
 *         description: Unauthorized. Invalid token or missing 'WP' permission.
 *       '500':
 *         description: Internal server error during transaction.
 */
const updateSingleTask = async (req, res) => {
  if (req.apiToken?.owner && req.apiToken.permissions?.includes("WP")) {
    const db = admin.firestore();
    const ownerId = req.apiToken.owner;
    const requesterProgressRef = db.collection("progress").doc(ownerId);
    const taskId = req.params.taskId;
    const state = req.body.state;

    // Basic validation
    if (!taskId || !state) {
      return res
        .status(400)
        .send({ error: "Missing taskId or state in request." });
    }
    if (!["uncompleted", "completed", "failed"].includes(state)) {
      return res.status(400).send({ error: "Invalid state provided." });
    }

    try {
      const taskData = await getTaskData();
      if (!taskData?.tasks) {
        throw new Error("Task data not loaded.");
      }

      const relevantTask = taskData.tasks.find((task) => task.id == taskId);
      if (!relevantTask) {
        return res.status(400).send({ error: "Unknown task ID." });
      }

      // Run update in a transaction
      await db.runTransaction(async (transaction) => {
        const progressDoc = await transaction.get(requesterProgressRef);
        if (!progressDoc.exists) {
          // Optionally create the doc if it doesn't exist, or throw error
          // For now, assume it should exist if they're updating tasks
          throw new Error("User's progress document doesn't exist.");
        }

        let progressUpdate = {};
        let updateTime = Date.now();
        let currentProgressData = progressDoc.data();

        // updateTaskState mutates progressUpdate
        updateTaskState(
          relevantTask,
          state,
          currentProgressData,
          taskData,
          progressUpdate,
          updateTime,
        );

        if (Object.keys(progressUpdate).length > 0) {
          transaction.update(requesterProgressRef, progressUpdate);
        } else {
          // This might happen if updateTaskState encounters an error or unknown state
          functions.logger.warn(
            "No progress updates generated for task update.",
            { taskId, state, ownerId },
          );
        }
      });

      res.status(200).send({ message: "Task progress updated successfully." });
    } catch (error) {
      functions.logger.error("Task update transaction failed:", {
        error: error.message,
        user: ownerId,
        taskId: taskId,
        state: state,
      });
      res.status(500).send({ error: "Progress update failed." });
    }
  } else {
    res
      .status(401)
      .send({ error: "Unauthorized or insufficient permissions." });
  }
};

/**
 * @openapi
 * /progress/tasks:
 *   post:
 *     summary: Update multiple tasks' progress
 *     tags:
 *       - "Progress"
 *     security:
 *       - bearerAuth: []
 *     description: Update the progress of multiple tasks with the provided states in a single transaction.
 *     requestBody:
 *       required: true
 *       description: An array of task update objects.
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: The ID of the task to update.
 *                 state:
 *                   type: string
 *                   description: The new state of the task.
 *                   enum: [uncompleted, completed, failed]
 *               required:
 *                 - id
 *                 - state
 *     responses:
 *       '200':
 *         description: The tasks were updated successfully.
 *       '400':
 *         description: Invalid request body format or content.
 *       '401':
 *         description: Unauthorized. Invalid token or missing 'WP' permission.
 *       '500':
 *         description: Internal server error during transaction.
 */
const updateMultipleTasks = async (req, res) => {
  if (req.apiToken?.owner && req.apiToken.permissions?.includes("WP")) {
    const db = admin.firestore();
    const ownerId = req.apiToken.owner;
    const requesterProgressRef = db.collection("progress").doc(ownerId);
    const updates = req.body;

    // Validate request body structure
    if (!Array.isArray(updates) || updates.length === 0) {
      return res
        .status(400)
        .send({ error: "Request body must be a non-empty array." });
    }

    const validationError = updates.some(
      (task) =>
        typeof task.id !== "string" ||
        typeof task.state !== "string" ||
        !["uncompleted", "completed", "failed"].includes(task.state),
    );

    if (validationError) {
      return res
        .status(400)
        .send({
          error:
            "Invalid format in task update array. Each item must have 'id' (string) and 'state' (uncompleted/completed/failed).",
        });
    }

    try {
      const taskData = await getTaskData();
      if (!taskData?.tasks) {
        throw new Error("Task data not loaded.");
      }

      await db.runTransaction(async (transaction) => {
        const progressDoc = await transaction.get(requesterProgressRef);
        if (!progressDoc.exists) {
          throw new Error("User's progress document doesn't exist.");
        }

        let progressUpdate = {};
        let updateTime = Date.now();
        let currentProgressData = progressDoc.data();

        updates.forEach((taskUpdate) => {
          const relevantTask = taskData.tasks.find(
            (task) => task.id == taskUpdate.id,
          );
          if (relevantTask) {
            // updateTaskState mutates progressUpdate
            updateTaskState(
              relevantTask,
              taskUpdate.state,
              currentProgressData,
              taskData,
              progressUpdate,
              updateTime,
            );
          } else {
            functions.logger.warn(
              `Task ID ${taskUpdate.id} not found during bulk update for user ${ownerId}. Skipping.`,
            );
          }
        });

        if (Object.keys(progressUpdate).length > 0) {
          transaction.update(requesterProgressRef, progressUpdate);
        } else {
          functions.logger.warn(
            "No progress updates generated for bulk task update.",
            { ownerId },
          );
        }
      });

      res.status(200).send({ message: "Tasks progress updated successfully." });
    } catch (error) {
      functions.logger.error("Bulk task update transaction failed:", {
        error: error.message,
        user: ownerId,
      });
      res.status(500).send({ error: "Progress update failed." });
    }
  } else {
    res
      .status(401)
      .send({ error: "Unauthorized or insufficient permissions." });
  }
};

/**
 * @openapi
 * /progress/task/objective/{objectiveId}:
 *   post:
 *     summary: Update task objective progress (state and/or count).
 *     tags:
 *       - "Progress"
 *     security:
 *       - bearerAuth: []
 *     description: Update the state (completed/uncompleted) and/or the count for a specific task objective.
 *     parameters:
 *       - in: path
 *         name: objectiveId
 *         required: true
 *         description: The ID of the task objective to update.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       description: Objective properties to update. Must include at least 'state' or 'count'.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               state:
 *                 type: string
 *                 description: The new state of the task objective.
 *                 enum: [completed, uncompleted]
 *                 nullable: true
 *               count:
 *                 type: integer
 *                 description: The number of items/completions for the objective.
 *                 minimum: 0
 *                 nullable: true
 *             example: { "state": "completed", "count": 5 }
 *     responses:
 *       '200':
 *         description: The objective progress was updated successfully.
 *       '400':
 *         description: Invalid request parameters (missing objectiveId, invalid state/count, unknown objective, no valid fields provided).
 *       '401':
 *         description: Unauthorized. Invalid token or missing 'WP' permission.
 *       '500':
 *         description: Internal server error during transaction.
 */
const updateTaskObjective = async (req, res) => {
  if (req.apiToken?.owner && req.apiToken.permissions?.includes("WP")) {
    const db = admin.firestore();
    const ownerId = req.apiToken.owner;
    const requesterProgressRef = db.collection("progress").doc(ownerId);
    const objectiveId = req.params.objectiveId;
    const { state, count } = req.body;

    // Basic validation
    if (!objectiveId) {
      return res.status(400).send({ error: "Missing objectiveId in path." });
    }
    if (state === undefined && count === undefined) {
      return res
        .status(400)
        .send({ error: "Request body must contain 'state' and/or 'count'." });
    }
    if (state && !["uncompleted", "completed"].includes(state)) {
      return res
        .status(400)
        .send({
          error:
            "Invalid state provided. Must be 'completed' or 'uncompleted'.",
        });
    }
    if (count !== undefined && (!Number.isInteger(count) || count < 0)) {
      return res
        .status(400)
        .send({
          error: "Invalid count provided. Must be a non-negative integer.",
        });
    }

    try {
      // No need for taskData here, just update the objective directly
      await db.runTransaction(async (transaction) => {
        // We don't strictly need to read the progress doc first unless we have complex logic
        // For simple updates, we can just write. Let's keep the read for consistency/future needs.
        const progressDoc = await transaction.get(requesterProgressRef);
        if (!progressDoc.exists) {
          throw new Error("User's progress document doesn't exist.");
        }

        let progressUpdate = {};
        let updateTime = Date.now();

        if (state !== undefined) {
          progressUpdate[`taskObjectives.${objectiveId}.complete`] =
            state === "completed";
          if (state === "completed") {
            progressUpdate[`taskObjectives.${objectiveId}.timestamp`] =
              updateTime;
          } else {
            // Remove timestamp if marked incomplete
            progressUpdate[`taskObjectives.${objectiveId}.timestamp`] =
              admin.firestore.FieldValue.delete();
          }
        }

        if (count !== undefined) {
          progressUpdate[`taskObjectives.${objectiveId}.count`] = count;
        }

        // Check if objective actually exists? Maybe not necessary, Firestore handles deep merges.
        // Let's assume the client sends valid objective IDs.

        if (Object.keys(progressUpdate).length > 0) {
          transaction.set(requesterProgressRef, progressUpdate, {
            merge: true,
          }); // Use set with merge instead of update for deep paths
        } else {
          // Should not happen due to initial validation, but good practice
          functions.logger.warn(
            "No progress updates generated for objective update.",
            { objectiveId, state, count, ownerId },
          );
        }
      });

      res
        .status(200)
        .send({ message: "Objective progress updated successfully." });
    } catch (error) {
      functions.logger.error("Objective update transaction failed:", {
        error: error.message,
        user: ownerId,
        objectiveId: objectiveId,
        state: state,
        count: count,
      });
      res.status(500).send({ error: "Progress update failed." });
    }
  } else {
    res
      .status(401)
      .send({ error: "Unauthorized or insufficient permissions." });
  }
};

// --- Commented out Hideout Endpoints ---
// Keep them here but commented out, as in the original file.
// If they need to be implemented, they would follow a similar pattern.

// const updateHideoutModule = async (req, res) => { ... }
// const updateHideoutObjective = async (req, res) => { ... }

export default {
  getPlayerProgress,
  getTeamProgress,
  setPlayerLevel,
  updateSingleTask,
  updateMultipleTasks,
  updateTaskObjective,
  // updateHideoutModule, // Export if/when implemented
  // updateHideoutObjective, // Export if/when implemented
};
