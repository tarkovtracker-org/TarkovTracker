import functions from "firebase-functions";
import admin from "firebase-admin";

// Initialize Firestore
let globalTaskData;
let globalHideoutData;

/**
 * @function getTaskData
 * @description Checks if taskData is already in memory, if not, gets it from Firestore
 * @returns {Object} The taskData object
 * @throws {Error} If taskData does not exist in Firestore
 */
const getTaskData = async () => {
  if (globalTaskData == null) {
    const db = admin.firestore();
    const taskRef = db.collection("tarkovdata").doc("tasks");
    const taskDoc = await taskRef.get();
    if (taskDoc.exists) {
      globalTaskData = taskDoc.data();
      return globalTaskData;
    } else {
      functions.logger.error("Error getting taskData: Document does not exist");
      return null; // Return null instead of throwing error to allow graceful handling
    }
  } else {
    return globalTaskData;
  }
};

/**
 * @function getHideoutData
 * @description Checks if hideoutData is already in memory, if not, gets it from Firestore
 * @returns {Object} The hideoutData object
 * @throws {Error} If hideoutData does not exist in Firestore
 */
const getHideoutData = async () => {
  if (globalHideoutData == null) {
    const db = admin.firestore();
    const hideoutRef = db.collection("tarkovdata").doc("hideout");
    const hideoutDoc = await hideoutRef.get();
    if (hideoutDoc.exists) {
      globalHideoutData = hideoutDoc.data();
      return globalHideoutData;
    } else {
      functions.logger.error(
        "Error getting hideoutData: Document does not exist",
      );
      return null; // Return null instead of throwing error
    }
  } else {
    return globalHideoutData;
  }
};

export { getTaskData, getHideoutData };
