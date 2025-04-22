import functions from "firebase-functions";
import admin from "firebase-admin";
import {
  Firestore,
  DocumentReference,
  DocumentSnapshot,
} from "firebase-admin/firestore";

// Define interfaces for the expected data structures
// TODO: Refine these interfaces based on the actual structure of your Firestore documents
interface TaskData {
  [taskId: string]: any; // Basic structure, assumes tasks are keyed by ID
}

interface HideoutData {
  [moduleId: string]: any; // Basic structure, assumes modules are keyed by ID
}

// Initialize Firestore and in-memory caches with types
let globalTaskData: TaskData | null | undefined = undefined;
let globalHideoutData: HideoutData | null | undefined = undefined;

/**
 * @function getTaskData
 * @description Checks if taskData is already in memory, if not, gets it from Firestore
 * @returns {Promise<TaskData | null>} The taskData object or null if not found
 */
const getTaskData = async (): Promise<TaskData | null> => {
  // Check cache first (use undefined as initial state to differentiate from null)
  if (globalTaskData !== undefined) {
    return globalTaskData;
  }

  const db: Firestore = admin.firestore();
  const taskRef: DocumentReference<TaskData> = db
    .collection("tarkovdata")
    .doc("tasks") as DocumentReference<TaskData>; // Type assertion

  try {
    const taskDoc: DocumentSnapshot<TaskData> = await taskRef.get();
    if (taskDoc.exists) {
      globalTaskData = taskDoc.data() ?? null; // Store null if data() returns undefined
      return globalTaskData;
    } else {
      functions.logger.error("Error getting taskData: Document does not exist");
      globalTaskData = null; // Cache the null result
      return null;
    }
  } catch (error: any) {
    functions.logger.error("Firestore error getting taskData:", {
      error: error.message,
    });
    globalTaskData = null; // Cache null on error too?
    return null;
  }
};

/**
 * @function getHideoutData
 * @description Checks if hideoutData is already in memory, if not, gets it from Firestore
 * @returns {Promise<HideoutData | null>} The hideoutData object or null if not found
 */
const getHideoutData = async (): Promise<HideoutData | null> => {
  if (globalHideoutData !== undefined) {
    return globalHideoutData;
  }

  const db: Firestore = admin.firestore();
  const hideoutRef: DocumentReference<HideoutData> = db
    .collection("tarkovdata")
    .doc("hideout") as DocumentReference<HideoutData>; // Type assertion

  try {
    const hideoutDoc: DocumentSnapshot<HideoutData> = await hideoutRef.get();
    if (hideoutDoc.exists) {
      globalHideoutData = hideoutDoc.data() ?? null;
      return globalHideoutData;
    } else {
      functions.logger.error(
        "Error getting hideoutData: Document does not exist",
      );
      globalHideoutData = null;
      return null;
    }
  } catch (error: any) {
    functions.logger.error("Firestore error getting hideoutData:", {
      error: error.message,
    });
    globalHideoutData = null;
    return null;
  }
};

export { getTaskData, getHideoutData };
