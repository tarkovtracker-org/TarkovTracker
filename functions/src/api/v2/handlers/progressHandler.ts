import functions from "firebase-functions";
import admin from "firebase-admin";
import { Request, Response } from "express";
import {
  Firestore,
  DocumentReference,
  DocumentSnapshot,
  WriteBatch,
} from "firebase-admin/firestore";

// TODO: Convert utils/dataLoaders.js to TypeScript and remove .js extension
// Update: dataLoaders is now TS, keep .js extension for import
import { getTaskData, getHideoutData } from "../utils/dataLoaders.js";
// TODO: Convert utils/progressUtils.js to TypeScript and remove .js extension
// Update: progressUtils is now TS, keep .js extension for import
import { formatProgress, updateTaskState } from "../utils/progressUtils.js";

// --- Interfaces for Data Structures ---

// Assume structure returned by utils (replace with actual types when utils are converted)
interface TaskData {
  [key: string]: any;
} // Keep utils return types generic for now
interface HideoutData {
  [key: string]: any;
}

// Define FormattedProgress strictly based on formatProgress function output
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

// Basic Objective/Progress Item Structure used in FormattedProgress
interface ObjectiveItem {
  id: string;
  complete: boolean;
  count?: number;
  invalid?: boolean;
  failed?: boolean;
}

// Firestore Document Data Interfaces
interface ProgressDocData {
  // Define fields based on actual progress document structure
  level?: number;
  tasks?: { [taskId: string]: TaskProgressData };
  hideout?: { [moduleId: string]: HideoutProgressData };
}

interface TaskProgressData {
  st?: number; // Status
  obj?: { [objectiveId: string]: number | boolean }; // Objectives
}

interface HideoutProgressData {
  level?: number;
  objectives?: { [objectiveId: string]: boolean };
}

interface SystemDocData {
  team?: string | null;
  // Add other fields if needed
}

interface UserDocData {
  teamHide?: { [teammateId: string]: boolean };
  // Add other fields if needed
}

interface TeamDocData {
  members?: string[];
  // Add other fields if needed
}

// Custom Request Interface (matching auth.ts/index.ts)
interface ApiTokenData {
  owner: string;
  note: string;
  permissions: string[];
  calls?: number;
  createdAt?: admin.firestore.Timestamp;
}

interface ApiToken extends ApiTokenData {
  token: string;
}

interface AuthenticatedRequest extends Request {
  apiToken?: ApiToken;
}

// --- Helper Type Check Functions ---
function isValidTaskStatus(status: any): status is number {
  return typeof status === "number" && [0, 1, 2, 3].includes(status);
}

// --- Handler Functions ---

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
const getPlayerProgress = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes("GP")) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection("progress")
      .doc(ownerId) as DocumentReference<ProgressDocData>; // Type assertion
    try {
      let progressDoc: DocumentSnapshot<ProgressDocData> | null = null;
      let taskData: TaskData | null = null;
      let hideoutData: HideoutData | null = null;
      // Fetch data concurrently
      const progressPromise = progressRef.get();
      // Adjust expected types to include null
      const hideoutPromise: Promise<HideoutData | null> = getHideoutData();
      const taskPromise: Promise<TaskData | null> = getTaskData();
      [progressDoc, hideoutData, taskData] = await Promise.all([
        progressPromise,
        hideoutPromise,
        taskPromise,
      ]);
      // Handle potential null data before formatting
      if (hideoutData === null || taskData === null) {
        functions.logger.error(
          "Failed to load essential Tarkov data (tasks or hideout)",
          {
            userId: ownerId,
            hideoutLoaded: hideoutData !== null,
            tasksLoaded: taskData !== null,
          },
        );
        res.status(500).send({ error: "Failed to load essential game data." });
        return;
      }
      if (!progressDoc.exists) {
        functions.logger.warn(
          `Progress document not found for user ${ownerId}`,
        );
        // Send empty progress structure? Or 404? Let's send formatted empty for now.
      }
      // Assuming formatProgress handles potentially undefined data
      const progressData: FormattedProgress = formatProgress(
        progressDoc.data(), // Pass potentially undefined data
        ownerId,
        hideoutData,
        taskData,
      );
      res.status(200).json({ data: progressData, meta: { self: ownerId } });
    } catch (error: any) {
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
const getTeamProgress = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes("TP")) {
    const db: Firestore = admin.firestore();
    try {
      // Get the requesters meta documents, hideout data, and task data concurrently
      const systemRef: DocumentReference<SystemDocData> = db
        .collection("system")
        .doc(ownerId) as DocumentReference<SystemDocData>;
      const userRef: DocumentReference<UserDocData> = db
        .collection("user")
        .doc(ownerId) as DocumentReference<UserDocData>;
      let systemDoc: DocumentSnapshot<SystemDocData> | null = null;
      let userDoc: DocumentSnapshot<UserDocData> | null = null;
      let hideoutData: HideoutData | null = null;
      let taskData: TaskData | null = null;
      const systemPromise = systemRef.get();
      const userPromise = userRef.get();
      // Adjust expected types to include null
      const hideoutPromise: Promise<HideoutData | null> = getHideoutData();
      const taskPromise: Promise<TaskData | null> = getTaskData();
      [systemDoc, userDoc, hideoutData, taskData] = await Promise.all([
        systemPromise,
        userPromise,
        hideoutPromise,
        taskPromise,
      ]);
      // Handle potential null data before proceeding
      if (hideoutData === null || taskData === null) {
        functions.logger.error(
          "Failed to load essential Tarkov data (tasks or hideout) for team progress",
          {
            userId: ownerId,
            hideoutLoaded: hideoutData !== null,
            tasksLoaded: taskData !== null,
          },
        );
        res
          .status(500)
          .send({ error: "Failed to load essential game data for team." });
        return;
      }
      const systemData = systemDoc.data();
      const userData = userDoc.data();
      const teamId: string | null | undefined = systemData?.team;
      const hiddenTeammatesMap: { [key: string]: boolean } =
        userData?.teamHide ?? {};
      let memberIds: string[] = [ownerId]; // Start with the requester
      let teamDoc: DocumentSnapshot<TeamDocData> | null = null;
      if (teamId) {
        const teamRef: DocumentReference<TeamDocData> = db
          .collection("team")
          .doc(teamId) as DocumentReference<TeamDocData>;
        teamDoc = await teamRef.get();
        const teamData = teamDoc.data();
        if (teamDoc.exists) {
          // Use Set to ensure uniqueness and include owner
          memberIds = [...new Set([...(teamData?.members ?? []), ownerId])];
        } else {
          functions.logger.warn(
            `Team document ${teamId} not found for user ${ownerId}`,
          );
          // Proceed with only the owner's progress
        }
      }
      // Prepare progress fetch promises
      const progressPromises = memberIds.map(
        (memberId) =>
          db.collection("progress").doc(memberId).get() as Promise<
            DocumentSnapshot<ProgressDocData>
          >,
      );
      // Fetch all progress docs
      const progressDocs: DocumentSnapshot<ProgressDocData>[] =
        await Promise.all(progressPromises);
      // Format progress for each member
      const teamResponse: FormattedProgress[] = progressDocs
        .map((memberDoc): FormattedProgress | null => {
          const memberId = memberDoc.ref.id;
          if (!memberDoc.exists) {
            functions.logger.warn(
              `Progress document not found for member ${memberId}`,
            );
            return null;
          }
          // Pass non-null hideoutData and taskData
          return formatProgress(
            memberDoc.data(),
            memberId,
            hideoutData, // Known non-null here
            taskData, // Known non-null here
          );
        })
        .filter((p): p is FormattedProgress => p !== null); // Type predicate should now work
      // Determine hidden teammates based on the fetched member list
      const hiddenTeammates = memberIds.filter(
        (id) => id !== ownerId && hiddenTeammatesMap?.[id],
      );
      res.status(200).json({
        data: teamResponse,
        meta: { self: ownerId, hiddenTeammates: hiddenTeammates },
      });
    } catch (error: any) {
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
const setPlayerLevel = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes("WP")) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection("progress")
      .doc(ownerId) as DocumentReference<ProgressDocData>;
    const levelValue = parseInt(req.params.levelValue, 10);
    if (isNaN(levelValue) || levelValue < 1) {
      res.status(400).send({ error: "Invalid level value provided." });
      return;
    }
    try {
      await progressRef.set({ level: levelValue }, { merge: true });
      res.status(200).send({ message: "Level updated successfully." });
    } catch (error: any) {
      functions.logger.error("Error setting player level:", {
        error: error.message,
        userId: ownerId,
        level: levelValue,
      });
      res.status(500).send({ error: "Failed to update player level." });
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
 *     summary: "Updates status for a single task"
 *     tags:
 *       - "Progress"
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: "taskId"
 *         in: "path"
 *         description: "ID of the task to update"
 *         required: true
 *         schema:
 *           type: "string"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: integer
 *                 description: "New status for the task (0: Locked, 1: Unlocked, 2: Complete, 3: Failed)"
 *                 enum: [0, 1, 2, 3]
 *     responses:
 *       200:
 *         description: "Task status updated successfully"
 *       400:
 *         description: "Invalid task ID or status provided."
 *       401:
 *         description: "Unauthorized. Invalid token or missing 'WP' permission."
 *       500:
 *         description: "Internal server error."
 */
const updateSingleTask = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes("WP")) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection("progress")
      .doc(ownerId) as DocumentReference<ProgressDocData>;
    const taskId: string = req.params.taskId;
    const status = req.body.status;
    if (!taskId) {
      res.status(400).send({ error: "Task ID is required." });
      return;
    }
    if (!isValidTaskStatus(status)) {
      res.status(400).send({ error: "Invalid status provided." });
      return;
    }
    try {
      // Fetch existing task data to preserve objectives if needed
      const progressDoc = await progressRef.get();
      const existingTaskData = progressDoc.data()?.tasks?.[taskId] ?? {}; // Get existing or empty object
      const updateData: { [key: string]: any } = {};
      // Use dot notation for specific field update
      updateData[`tasks.${taskId}`] = {
        ...existingTaskData, // Preserve existing fields (like objectives)
        st: status,
      };
      await progressRef.update(updateData);
      // TODO: Consider triggering task dependency updates (using updateTaskState) if needed
      // await updateTaskState(ownerId, taskId, status);
      res.status(200).send({ message: "Task updated successfully." });
    } catch (error: any) {
      functions.logger.error("Error updating single task:", {
        error: error.message,
        userId: ownerId,
        taskId: taskId,
        status: status,
      });
      res.status(500).send({ error: "Failed to update task." });
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
 *     summary: "Updates status for multiple tasks"
 *     tags:
 *       - "Progress"
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: "Object where keys are task IDs and values are the new status (0-3)"
 *             additionalProperties:
 *               type: integer
 *               enum: [0, 1, 2, 3]
 *             example:
 *               {"task1": 2, "task5": 1}
 *     responses:
 *       200:
 *         description: "Tasks updated successfully."
 *       400:
 *         description: "Invalid request body format or invalid status values."
 *       401:
 *         description: "Unauthorized. Invalid token or missing 'WP' permission."
 *       500:
 *         description: "Internal server error during batch update."
 */
const updateMultipleTasks = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes("WP")) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection("progress")
      .doc(ownerId) as DocumentReference<ProgressDocData>;
    const taskUpdates: { [taskId: string]: number } = req.body;
    if (
      typeof taskUpdates !== "object" ||
      taskUpdates === null ||
      Object.keys(taskUpdates).length === 0
    ) {
      res.status(400).send({ error: "Invalid request body format." });
      return;
    }
    const batch: WriteBatch = db.batch();
    let invalidStatusFound = false;
    const updatePromises: Promise<void>[] = [];
    try {
      // Fetch existing progress data once
      const progressDoc = await progressRef.get();
      const existingTasksData = progressDoc.data()?.tasks ?? {};
      for (const taskId in taskUpdates) {
        if (Object.prototype.hasOwnProperty.call(taskUpdates, taskId)) {
          const status = taskUpdates[taskId];
          if (!isValidTaskStatus(status)) {
            invalidStatusFound = true;
            functions.logger.warn("Invalid status found in batch update", {
              userId: ownerId,
              taskId: taskId,
              status: status,
            });
            // Decide whether to fail the whole batch or just skip invalid ones
            // For now, fail the whole batch
            break;
          }
          const existingTaskData = existingTasksData[taskId] ?? {};
          // Prepare update data for this specific task using dot notation
          const updateData: { [key: string]: any } = {};
          updateData[`tasks.${taskId}`] = {
            ...existingTaskData, // Preserve existing fields
            st: status,
          };
          // Add update operation to the batch
          batch.update(progressRef, updateData);
          // TODO: Collect task updates for potential dependency checks
          // updatePromises.push(updateTaskState(ownerId, taskId, status));
        }
      }
      if (invalidStatusFound) {
        res
          .status(400)
          .send({ error: "Invalid status value found in batch update." });
        return;
      }
      // Commit the batch write
      await batch.commit();
      // TODO: Await dependency updates if implemented
      // await Promise.all(updatePromises);
      res.status(200).send({ message: "Tasks updated successfully." });
    } catch (error: any) {
      functions.logger.error("Error updating multiple tasks:", {
        error: error.message,
        userId: ownerId,
      });
      res.status(500).send({ error: "Failed to update tasks." });
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
 *     summary: "Updates status for a single task objective"
 *     tags:
 *       - "Progress"
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: "objectiveId"
 *         in: "path"
 *         description: "ID of the objective to update (format: \"TASKID-INDEX\")"
 *         required: true
 *         schema:
 *           type: "string"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: [boolean, integer]
 *                 description: "New status for the objective (true/false for boolean objectives, number for count objectives)"
 *     responses:
 *       200:
 *         description: "Task objective status updated successfully"
 *       400:
 *         description: "Invalid objective ID format, invalid status, or objective not found."
 *       401:
 *         description: "Unauthorized. Invalid token or missing 'WP' permission."
 *       500:
 *         description: "Internal server error."
 */
const updateTaskObjective = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes("WP")) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection("progress")
      .doc(ownerId) as DocumentReference<ProgressDocData>;
    const objectiveId: string = req.params.objectiveId;
    const status = req.body.status; // Can be boolean or number
    if (!objectiveId || !objectiveId.includes("-")) {
      res.status(400).send({ error: "Invalid objective ID format." });
      return;
    }
    if (typeof status !== "boolean" && typeof status !== "number") {
      res.status(400).send({ error: "Invalid status value." });
      return;
    }
    const [taskId, objIndex] = objectiveId.split("-");
    if (!taskId || !objIndex) {
      res.status(400).send({ error: "Malformed objective ID." });
      return;
    }
    try {
      // Prepare update using dot notation for nested map field
      const updatePath = `tasks.${taskId}.obj.${objIndex}`;
      const updateData = { [updatePath]: status };
      // Use update for nested field
      await progressRef.update(updateData);
      // TODO: Optionally re-evaluate task status based on objective completion
      res.status(200).send({ message: "Task objective updated successfully." });
    } catch (error: any) {
      functions.logger.error("Error updating task objective:", {
        error: error.message,
        userId: ownerId,
        objectiveId: objectiveId,
        status: status,
      });
      // Firestore update might fail if the path doesn't exist (e.g., task doesn't exist)
      // Consider checking if task exists first or handle specific errors
      res.status(500).send({ error: "Failed to update task objective." });
    }
  } else {
    res
      .status(401)
      .send({ error: "Unauthorized or insufficient permissions." });
  }
};

// Export using default export as assumed by index.ts import
export default {
  getPlayerProgress,
  getTeamProgress,
  setPlayerLevel,
  updateSingleTask,
  updateMultipleTasks,
  updateTaskObjective,
  // updateHideoutModule, // Keep commented out if not implemented
  // updateHideoutObjective, // Keep commented out if not implemented
};
