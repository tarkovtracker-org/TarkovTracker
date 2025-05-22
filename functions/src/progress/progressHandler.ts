import functions from 'firebase-functions';
import admin from 'firebase-admin';
import { Request, Response } from 'express';
import {
  Firestore,
  DocumentReference,
  DocumentSnapshot,
  WriteBatch,
} from 'firebase-admin/firestore';

// Update: dataLoaders and progressUtils is now TS, keep .js extension for import
import { getTaskData, getHideoutData } from '../utils/dataLoaders.js';
import { formatProgress, updateTaskState } from './progressUtils.js';

// --- Interfaces for Data Structures ---

// Assume structure returned by utils (replace with actual types when utils are converted)
interface TaskData {
  [key: string]: unknown;
} // Keep utils return types generic for now
interface HideoutData {
  [key: string]: unknown;
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
  st?: string; // Status
  obj?: { [objectiveId: string]: number | boolean }; // Objectives
}

interface HideoutProgressData {
  level?: number;
  objectives?: { [objectiveId: string]: boolean };
}

interface SystemDocData {
  team?: string | null;
}

interface UserDocData {
  teamHide?: { [teammateId: string]: boolean };
}

interface TeamDocData {
  members?: string[];
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
function isValidTaskStatus(status: unknown): status is string {
  return (
    typeof status === 'string' &&
    (status === 'uncompleted' || status === 'completed' || status === 'failed')
  );
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
const getPlayerProgress = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes('GP')) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection('progress')
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
        functions.logger.error('Failed to load essential Tarkov data (tasks or hideout)', {
          userId: ownerId,
          hideoutLoaded: hideoutData !== null,
          tasksLoaded: taskData !== null,
        });
        res.status(500).send({ error: 'Failed to load essential game data.' });
        return;
      }
      if (!progressDoc.exists) {
        functions.logger.warn(`Progress document not found for user ${ownerId}`);
        // Send empty progress structure? Or 404? Let's send formatted empty for now.
      }
      // Assuming formatProgress handles potentially undefined data
      const progressData: FormattedProgress = formatProgress(
        progressDoc.data(), // Pass potentially undefined data
        ownerId,
        hideoutData,
        taskData
      );
      res.status(200).json({ data: progressData, meta: { self: ownerId } });
    } catch (error: unknown) {
      functions.logger.error('Error fetching player progress:', {
        error: error instanceof Error ? error.message : String(error),
        userId: ownerId,
      });
      res.status(500).send({ error: 'Failed to retrieve player progress.' });
    }
  } else {
    res.status(401).send({ error: 'Unauthorized or insufficient permissions.' });
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
 *               $ref: '#/components/schemas/TeamProgress' # Reference the schema
 *       401:
 *         description: "Unauthorized. Invalid token or missing 'TP' permission."
 *       500:
 *         description: "Internal server error."
 */
const getTeamProgress = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes('TP')) {
    const db: Firestore = admin.firestore();
    try {
      // Get the requesters meta documents, hideout data, and task data concurrently
      const systemRef: DocumentReference<SystemDocData> = db
        .collection('system')
        .doc(ownerId) as DocumentReference<SystemDocData>;
      const userRef: DocumentReference<UserDocData> = db
        .collection('user')
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
          'Failed to load essential Tarkov data (tasks or hideout) for team progress',
          {
            userId: ownerId,
            hideoutLoaded: hideoutData !== null,
            tasksLoaded: taskData !== null,
          }
        );
        res.status(500).send({ error: 'Failed to load essential game data for team.' });
        return;
      }
      const systemData = systemDoc.data();
      const userData = userDoc.data();
      const teamId: string | null | undefined = systemData?.team;
      const hiddenTeammatesMap: { [key: string]: boolean } = userData?.teamHide ?? {};
      let memberIds: string[] = [ownerId]; // Start with the requester
      let teamDoc: DocumentSnapshot<TeamDocData> | null = null;
      if (teamId) {
        const teamRef: DocumentReference<TeamDocData> = db
          .collection('team')
          .doc(teamId) as DocumentReference<TeamDocData>;
        teamDoc = await teamRef.get();
        const teamData = teamDoc.data();
        if (teamDoc.exists) {
          // Use Set to ensure uniqueness and include owner
          memberIds = [...new Set([...(teamData?.members ?? []), ownerId])];
        } else {
          functions.logger.warn(`Team document ${teamId} not found for user ${ownerId}`);
          // Proceed with only the owner's progress
        }
      }
      // Prepare progress fetch promises
      const progressPromises = memberIds.map(
        (memberId) =>
          db.collection('progress').doc(memberId).get() as Promise<
            DocumentSnapshot<ProgressDocData>
          >
      );
      // Fetch all progress docs
      const progressDocs: DocumentSnapshot<ProgressDocData>[] = await Promise.all(progressPromises);
      // Format progress for each member
      const teamResponse: FormattedProgress[] = progressDocs
        .map((memberDoc): FormattedProgress | null => {
          const memberId = memberDoc.ref.id;
          if (!memberDoc.exists) {
            functions.logger.warn(`Progress document not found for member ${memberId}`);
            return null;
          }
          // Pass non-null hideoutData and taskData
          return formatProgress(
            memberDoc.data(),
            memberId,
            hideoutData, // Known non-null here
            taskData // Known non-null here
          );
        })
        .filter((p): p is FormattedProgress => p !== null); // Type predicate should now work
      // Determine hidden teammates based on the fetched member list
      const hiddenTeammates = memberIds.filter((id) => id !== ownerId && hiddenTeammatesMap?.[id]);
      res.status(200).json({
        data: teamResponse,
        meta: { self: ownerId, hiddenTeammates: hiddenTeammates },
      });
    } catch (error: unknown) {
      functions.logger.error('Error fetching team progress:', {
        error: error instanceof Error ? error.message : String(error),
        userId: ownerId,
      });
      res.status(500).send({ error: 'Failed to retrieve team progress.' });
    }
  } else {
    res.status(401).send({ error: 'Unauthorized or insufficient permissions.' });
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
const setPlayerLevel = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes('WP')) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection('progress')
      .doc(ownerId) as DocumentReference<ProgressDocData>;
    const levelValue = parseInt(req.params.levelValue, 10);
    if (isNaN(levelValue) || levelValue < 1) {
      res.status(400).send({ error: 'Invalid level value provided.' });
      return;
    }
    try {
      await progressRef.set({ level: levelValue }, { merge: true });
      res.status(200).send({ message: 'Level updated successfully.' });
    } catch (error: unknown) {
      functions.logger.error('Error setting player level:', {
        error: error instanceof Error ? error.message : String(error),
        userId: ownerId,
        level: levelValue,
      });
      res.status(500).send({ error: 'Failed to update player level.' });
    }
  } else {
    res.status(401).send({ error: 'Unauthorized or insufficient permissions.' });
  }
};

/**
 * @openapi
 * /progress/task/{taskId}:
 *   post:
 *     summary: "Update the progress state of a single task."
 *     tags:
 *       - "Progress"
 *     description: "Update the progress state of a single task."
 *     security:
 *       - bearerAuth: [] # Requires authentication
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         description: "The ID (usually UUID from tarkov.dev) of the task to update."
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       description: "The new state for the task."
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - state
 *             properties:
 *               state:
 *                 type: string
 *                 description: "The new state of the task."
 *                 enum: [uncompleted, completed, failed] # Matches the old spec and implementation logic
 *     responses:
 *       200:
 *         description: "The task was updated successfully."
 *       400:
 *         description: "Invalid request parameters (e.g., bad taskId or state)."
 *       401:
 *         description: "Unauthorized to update progress (missing 'WP' permission)."
 *       500:
 *         description: "Internal server error."
 */
const updateSingleTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes('WP')) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection('progress')
      .doc(ownerId) as DocumentReference<ProgressDocData>;
    const taskId: string = req.params.taskId;
    const state = req.body.state;

    if (!taskId) {
      res.status(400).send({ error: 'Task ID is required.' });
      return;
    }
    // Validate the string state
    if (!isValidTaskStatus(state)) {
      res.status(400).send({
        error: "Invalid state provided. Should be 'completed', 'failed', or 'uncompleted'.",
      });
      return;
    }
    try {
      // Fetch existing task data to preserve objectives if needed
      const progressDoc = await progressRef.get();
      const existingTaskData = progressDoc.data()?.tasks?.[taskId] ?? {}; // Get existing or empty object
      const updateData: { [key: `tasks.${string}`]: TaskProgressData } = {};
      // Use dot notation for specific field update
      updateData[`tasks.${taskId}`] = {
        ...existingTaskData, // Preserve existing fields (like objectives)
        st: state, // Use the string state directly
      };
      await progressRef.update(updateData);
      // Implement task dependency updates using updateTaskState
      try {
        const { getTaskData } = await import('../utils/dataLoaders.js');
        const taskData = await getTaskData();
        // Use the top-level imported updateTaskState instead of dynamic import
        await updateTaskState(taskId, state, ownerId, taskData);
      } catch (error) {
        // Log error but don't fail the request if dependency updates fail
        functions.logger.error('Error updating task dependencies:', {
          error: error instanceof Error ? error.message : String(error),
          userId: ownerId,
          taskId,
          state,
        });
      }
      res.status(200).send({ message: 'Task updated successfully.' });
    } catch (error: unknown) {
      functions.logger.error('Error updating single task:', {
        error: error instanceof Error ? error.message : String(error),
        userId: ownerId,
        taskId: taskId,
        state, // Log the string state
      });
      res.status(500).send({ error: 'Failed to update task.' });
    }
  } else {
    res.status(401).send({ error: 'Unauthorized or insufficient permissions.' });
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
const updateMultipleTasks = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes('WP')) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection('progress')
      .doc(ownerId) as DocumentReference<ProgressDocData>;
    const taskUpdates: { [taskId: string]: string } = req.body;
    if (
      typeof taskUpdates !== 'object' ||
      taskUpdates === null ||
      Object.keys(taskUpdates).length === 0
    ) {
      res.status(400).send({ error: 'Invalid request body format.' });
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
            functions.logger.warn('Invalid status found in batch update', {
              userId: ownerId,
              taskId: taskId,
              status: status,
            });
            break;
          }
          const existingTaskData = existingTasksData[taskId] ?? {};
          // Prepare update data for this specific task using dot notation
          const updateData: { [key: `tasks.${string}`]: TaskProgressData } = {};
          updateData[`tasks.${taskId}`] = {
            ...existingTaskData, // Preserve existing fields
            st: status,
          };
          // Add update operation to the batch
          batch.update(progressRef, updateData);
          // Collect task updates for dependency checks
          updatePromises.push(
            (async () => {
              try {
                const { getTaskData } = await import('../utils/dataLoaders.js');
                const taskData = await getTaskData();
                await updateTaskState(taskId, status, ownerId, taskData);
              } catch (error) {
                functions.logger.error('Error updating task dependencies in batch:', {
                  error: error instanceof Error ? error.message : String(error),
                  userId: ownerId,
                  taskId,
                  status,
                });
              }
            })()
          );
        }
      }
      if (invalidStatusFound) {
        res.status(400).send({ error: 'Invalid status value found in batch update.' });
        return;
      }
      // Commit the batch write
      await batch.commit();
      // Process task dependency updates
      await Promise.all(updatePromises);
      res.status(200).send({ message: 'Tasks updated successfully.' });
    } catch (error: unknown) {
      functions.logger.error('Error updating multiple tasks:', {
        error: error instanceof Error ? error.message : String(error),
        userId: ownerId,
      });
      res.status(500).send({ error: 'Failed to update tasks.' });
    }
  } else {
    res.status(401).send({ error: 'Unauthorized or insufficient permissions.' });
  }
};

/**
 * @openapi
 * /progress/task/objective/{objectiveId}:
 *   post:
 *     summary: "Update objective progress for a task."
 *     tags:
 *       - "Progress"
 *     description: "Update the progress (state or count) for a specific task objective."
 *     security:
 *       - bearerAuth: [] # Requires authentication
 *     parameters:
 *       - in: path
 *         name: objectiveId
 *         required: true
 *         description: "The ID (usually UUID from tarkov.dev) of the task objective to update."
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       description: "The objective properties to update. Provide at least one."
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               state:
 *                 type: string
 *                 description: "The new state of the task objective."
 *                 enum: [completed, uncompleted]
 *                 nullable: true
 *               count:
 *                 type: integer
 *                 description: "The number of items or completions toward the objective's goal."
 *                 minimum: 0
 *                 nullable: true
 *     responses:
 *       200:
 *         description: "The objective was updated successfully."
 *       400:
 *         description: "Invalid request parameters (e.g., bad objectiveId, state, or count)."
 *       401:
 *         description: "Unauthorized to update progress (missing 'WP' permission)."
 *       500:
 *         description: "Internal server error."
 */
const updateTaskObjective = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const ownerId = req.apiToken?.owner;
  if (ownerId && req.apiToken?.permissions?.includes('WP')) {
    const db: Firestore = admin.firestore();
    const progressRef: DocumentReference<ProgressDocData> = db
      .collection('progress')
      .doc(ownerId) as DocumentReference<ProgressDocData>;
    const objectiveId: string = req.params.objectiveId;
    const status = req.body.status; // Can be boolean or number
    if (!objectiveId || !objectiveId.includes('-')) {
      res.status(400).send({ error: 'Invalid objective ID format.' });
      return;
    }
    if (typeof status !== 'boolean' && typeof status !== 'number') {
      res.status(400).send({ error: 'Invalid status value.' });
      return;
    }
    const [taskId, objIndex] = objectiveId.split('-');
    if (!taskId || !objIndex) {
      res.status(400).send({ error: 'Malformed objective ID.' });
      return;
    }
    try {
      // Prepare update using dot notation for nested map field
      const updatePath = `tasks.${taskId}.obj.${objIndex}`;
      const updateData = { [updatePath]: status };
      // Use update for nested field
      await progressRef.update(updateData);
      // TODO: Optionally re-evaluate task status based on objective completion
      res.status(200).send({ message: 'Task objective updated successfully.' });
    } catch (error: unknown) {
      functions.logger.error('Error updating task objective:', {
        error: error instanceof Error ? error.message : String(error),
        userId: ownerId,
        objectiveId: objectiveId,
        status: status,
      });
      // Firestore update might fail if the path doesn't exist (e.g., task doesn't exist)
      // Consider checking if task exists first or handle specific errors
      res.status(500).send({ error: 'Failed to update task objective.' });
    }
  } else {
    res.status(401).send({ error: 'Unauthorized or insufficient permissions.' });
  }
};

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
