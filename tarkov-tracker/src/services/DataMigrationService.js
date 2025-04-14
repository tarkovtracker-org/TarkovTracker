import { firestore } from "@/plugins/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

/**
 * Service to handle migration of local data to a user's Firebase account
 */
export default class DataMigrationService {
  /**
   * Check if there is local data that can be migrated to a user account
   * @returns {boolean} True if local data exists
   */
  static hasLocalData() {
    try {
      const progressData = localStorage.getItem("progress");

      // Check if progressData exists and contains valid data
      if (!progressData || progressData === "{}") {
        console.log("No progress data found in localStorage");
        return false;
      }

      // Parse the data to validate it
      const parsedData = JSON.parse(progressData);

      // Check if the parsed data has any keys (is not an empty object)
      const hasKeys = Object.keys(parsedData).length > 0;

      // Check if the level is greater than 1 (not a fresh account)
      const hasProgress =
        parsedData.level > 1 ||
        Object.keys(parsedData.taskCompletions || {}).length > 0 ||
        Object.keys(parsedData.taskObjectives || {}).length > 0 ||
        Object.keys(parsedData.hideoutModules || {}).length > 0;

      console.log("Progress data found in localStorage:", hasKeys);
      console.log("Has meaningful progress:", hasProgress);

      return hasKeys && hasProgress;
    } catch (error) {
      console.error("Error checking local data:", error);
      return false;
    }
  }

  /**
   * Get the local progress data
   * @returns {Object|null} The local progress data or null if none exists
   */
  static getLocalData() {
    try {
      const progressData = localStorage.getItem("progress");
      if (!progressData) {
        console.warn("No progress data in localStorage");
        return null;
      }

      const parsedData = JSON.parse(progressData);

      // Only return if there's actual content
      if (Object.keys(parsedData).length > 0) {
        console.log("Found local progress data:", Object.keys(parsedData));
        // Make a deep copy to avoid reference issues
        return JSON.parse(JSON.stringify(parsedData));
      }

      console.warn("Empty progress data object in localStorage");
      return null;
    } catch (error) {
      console.error("Error getting local data:", error);
      return null;
    }
  }

  /**
   * Check if a user already has data in their account
   * @param {string} uid The user's UID
   * @returns {Promise<boolean>} True if the user has existing data
   */
  static async hasUserData(uid) {
    try {
      console.log("Checking user data for UID:", uid);
      const progressRef = doc(firestore, "progress", uid);
      const progressDoc = await getDoc(progressRef);

      const exists = progressDoc.exists();
      const data = progressDoc.data() || {};
      const hasData = Object.keys(data).length > 0;

      // Check for meaningful progress (not just default values)
      const hasProgress =
        data.level > 1 ||
        Object.keys(data.taskCompletions || {}).length > 0 ||
        Object.keys(data.taskObjectives || {}).length > 0 ||
        Object.keys(data.hideoutModules || {}).length > 0;

      console.log("Progress document exists:", exists);
      console.log("Progress document has data:", hasData);
      console.log("Progress document has meaningful progress:", hasProgress);

      return exists && hasData && hasProgress;
    } catch (error) {
      console.error("Error checking user data:", error);
      return false;
    }
  }

  /**
   * Migrate local data to a user's account
   * @param {string} uid The user's UID
   * @returns {Promise<boolean>} True if migration was successful
   */
  static async migrateDataToUser(uid) {
    if (!uid) {
      console.error("Migration failed: No user ID provided");
      return false;
    }

    try {
      console.log("Starting data migration for user:", uid);
      const localData = this.getLocalData();

      if (!localData) {
        console.error("Migration failed: No local data to migrate");
        return false;
      }

      console.log("Migrating local data, level:", localData.level);

      try {
        // Double check that the user doesn't already have data
        const progressRef = doc(firestore, "progress", uid);
        const existingDoc = await getDoc(progressRef);

        if (existingDoc.exists()) {
          const existingData = existingDoc.data();
          console.log("Existing data found:", existingData);

          // If there's already meaningful progress, don't overwrite it
          if (
            existingData &&
            (existingData.level > 1 ||
              Object.keys(existingData.taskCompletions || {}).length > 0 ||
              Object.keys(existingData.taskObjectives || {}).length > 0)
          ) {
            console.warn(
              "User already has meaningful progress, aborting migration",
            );
            return false;
          }
        }
      } catch (checkError) {
        console.error("Error checking existing data:", checkError);
        // Continue with migration anyway since this is just a safety check
      }

      // Add a timestamp and migration flag to the data
      localData.lastUpdated = new Date().toISOString();
      localData.migratedFromLocalStorage = true;
      localData.migrationDate = new Date().toISOString();
      localData.autoMigrated = true; // Flag to indicate this was auto-migrated

      // Make the displayName consistent with Firebase user if it's not set
      if (!localData.displayName) {
        // This helps with linking the data to the user's account
        localData.imported = true;
      }

      // Write the data to Firestore
      try {
        console.log("Writing data to Firestore for user:", uid);
        const progressRef = doc(firestore, "progress", uid);
        await setDoc(progressRef, localData);
        console.log("Migration complete, data saved to Firestore successfully");

        // Create a backup in localStorage with timestamp just in case
        const backupKey = `progress_backup_${new Date().toISOString()}`;
        try {
          localStorage.setItem(backupKey, JSON.stringify(localData));
          console.log("Created local backup of migrated data:", backupKey);
        } catch (backupError) {
          console.warn("Failed to create backup:", backupError);
          // Non-critical error, continue
        }

        return true;
      } catch (firestoreError) {
        console.error("Error writing to Firestore:", firestoreError);
        return false;
      }
    } catch (error) {
      console.error("Error in migration process:", error);
      return false;
    }
  }

  /**
   * Export data in a format suitable for cross-domain migration
   * @returns {Object|null} The formatted data for export or null if no data
   */
  static exportDataForMigration() {
    try {
      const data = this.getLocalData();
      if (!data) return null;

      // Create an export object with metadata
      const exportObject = {
        type: "tarkovtracker-migration",
        timestamp: new Date().toISOString(),
        version: 1,
        data: data,
      };

      return exportObject;
    } catch (error) {
      console.error("Error exporting data for migration:", error);
      return null;
    }
  }

  /**
   * Import data from a JSON string provided by a user
   * @param {string} jsonString The JSON string to import
   * @returns {Object|null} The parsed data or null if invalid
   */
  static validateImportData(jsonString) {
    try {
      // Parse the JSON string
      const importedData = JSON.parse(jsonString);

      // Validate that it's a TarkovTracker migration object
      if (importedData.type !== "tarkovtracker-migration") {
        console.error("Not a valid TarkovTracker migration object");
        return null;
      }

      // Check for required fields in the data
      const data = importedData.data;
      const requiredFields = ["level", "gameEdition", "pmcFaction"];

      for (const field of requiredFields) {
        if (!data.hasOwnProperty(field)) {
          console.error(`Missing required field: ${field}`);
          return null;
        }
      }

      return data;
    } catch (error) {
      console.error("Error parsing import data:", error);
      return null;
    }
  }

  /**
   * Import data from another domain to a user's account
   * @param {string} uid The user's UID
   * @param {Object} importedData The imported data to save
   * @returns {Promise<boolean>} True if import was successful
   */
  static async importDataToUser(uid, importedData) {
    if (!uid) {
      console.error("Import failed: No user ID provided");
      return false;
    }

    if (!importedData) {
      console.error("Import failed: No data to import");
      return false;
    }

    try {
      console.log("Starting data import for user:", uid);

      // Add import metadata to the data
      importedData.lastUpdated = new Date().toISOString();
      importedData.importedFromExternalSource = true;
      importedData.importDate = new Date().toISOString();

      // Write the data to Firestore
      try {
        console.log("Writing imported data to Firestore for user:", uid);
        const progressRef = doc(firestore, "progress", uid);
        await setDoc(progressRef, importedData);
        console.log("Import complete, data saved to Firestore successfully");
        return true;
      } catch (firestoreError) {
        console.error("Error writing to Firestore:", firestoreError);
        return false;
      }
    } catch (error) {
      console.error("Error in import process:", error);
      return false;
    }
  }

  /**
   * Fetch user data from old TarkovTracker domain using API token
   * @param {string} apiToken The user's API token from the old site
   * @param {string} oldDomain Optional domain of the old site (defaults to the original TarkovTracker domain)
   * @returns {Promise<Object|null>} The user's data or null if the fetch failed
   */
  static async fetchDataWithApiToken(apiToken, oldDomain = "tarkovtracker.io") {
    if (!apiToken) {
      console.error("No API token provided");
      return null;
    }

    try {
      // Try to fetch data from the old domain's API
      const apiUrl = `https://${oldDomain}/api/v2/progress`;

      console.log(`Fetching data from ${apiUrl} with token`);

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.error(
          `API fetch failed: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const responseData = await response.json();
      console.log("API data fetched successfully:", Object.keys(responseData));

      // Extract the actual data from the response which has 'data' and 'meta' properties
      const data = responseData.data || responseData;

      // Log the raw data structure to understand the format
      console.log("Raw API response data structure:", {
        data: responseData.data
          ? {
              structure: Object.keys(responseData.data),
              playerLevel: responseData.data.playerLevel,
              pmcFaction: responseData.data.pmcFaction,
              hasTaskProgress: Array.isArray(responseData.data.tasksProgress),
              taskProgressLength: Array.isArray(responseData.data.tasksProgress)
                ? responseData.data.tasksProgress.length
                : 0,
              taskProgressSample:
                Array.isArray(responseData.data.tasksProgress) &&
                responseData.data.tasksProgress.length > 0
                  ? responseData.data.tasksProgress.slice(0, 2)
                  : null,
              hasCompletedTasks: Array.isArray(responseData.data.tasksProgress)
                ? responseData.data.tasksProgress.some(
                    (t) => t.complete === true,
                  )
                : false,
              completedTasksCount: Array.isArray(
                responseData.data.tasksProgress,
              )
                ? responseData.data.tasksProgress.filter(
                    (t) => t.complete === true,
                  ).length
                : 0,
              hasTaskObjectives: Array.isArray(
                responseData.data.taskObjectivesProgress,
              ),
              objectivesCount: Array.isArray(
                responseData.data.taskObjectivesProgress,
              )
                ? responseData.data.taskObjectivesProgress.length
                : 0,
              objectivesSample:
                Array.isArray(responseData.data.taskObjectivesProgress) &&
                responseData.data.taskObjectivesProgress.length > 0
                  ? responseData.data.taskObjectivesProgress.slice(0, 2)
                  : null,
            }
          : null,
      });

      // Convert array-based task progress to object format
      // Our format: { taskId: { complete: true, timestamp: Date.now() } } for completed tasks
      const taskCompletions = {};
      if (Array.isArray(data.tasksProgress)) {
        console.log(
          `Found ${data.tasksProgress.length} tasks in progress data`,
        );
        let completedCount = 0;

        data.tasksProgress.forEach((task, index) => {
          // Log first few tasks to see their structure
          if (index < 5) {
            console.log(`Task ${index}:`, task);
          }

          if (task.complete === true) {
            // Create the proper task completion structure
            taskCompletions[task.id] = {
              complete: true,
              timestamp: Date.now(),
              failed: task.failed || false,
            };
            completedCount++;
          }
        });

        console.log(
          `Found ${completedCount} completed tasks out of ${data.tasksProgress.length}`,
        );
      } else {
        console.log(
          "No task progress array found in data:",
          data.tasksProgress,
        );
      }

      // Convert array-based hideout modules to object format
      // Our format: { moduleId: { complete: true, timestamp: Date.now() } } for completed modules
      const hideoutModules = {};
      if (Array.isArray(data.hideoutModulesProgress)) {
        data.hideoutModulesProgress.forEach((module) => {
          if (module.complete === true) {
            hideoutModules[module.id] = {
              complete: true,
              timestamp: Date.now(),
            };
          }
        });
      }

      // Convert array-based hideout parts to object format
      // Our format: { partId: { complete: true, count: X, timestamp: Date.now() } }
      const hideoutParts = {};
      if (Array.isArray(data.hideoutPartsProgress)) {
        data.hideoutPartsProgress.forEach((part) => {
          hideoutParts[part.id] = {
            complete: part.complete || false,
            count: part.count || 0,
            timestamp: part.complete ? Date.now() : null,
          };
        });
      }

      // Convert array-based task objectives to object format
      // Our format: { objectiveId: { complete: true, count: X, timestamp: Date.now() } }
      const taskObjectives = {};
      if (Array.isArray(data.taskObjectivesProgress)) {
        data.taskObjectivesProgress.forEach((objective) => {
          taskObjectives[objective.id] = {
            complete: objective.complete || false,
            count: objective.count || 0,
            timestamp: objective.complete ? Date.now() : null,
          };
        });
      }

      // Calculate completed task count for logging
      const completedTaskCount = Object.keys(taskCompletions).length;

      // Log the extracted data to help with debugging
      console.log("Player data extracted:", {
        level: data.playerLevel || data.level,
        faction: data.pmcFaction,
        tasks: completedTaskCount,
        taskObjectives: Object.keys(taskObjectives).length,
        hideoutModules: Object.keys(hideoutModules).length,
        hideoutParts: Object.keys(hideoutParts).length,
      });

      // Create a properly formatted migration object
      const migrationData = {
        // Core fields
        level: data.playerLevel || data.level || 1,
        gameEdition: data.gameEdition || "standard",
        pmcFaction: data.pmcFaction || "usec",
        displayName: data.displayName || "",

        // Progress fields - use our converted data
        taskCompletions: taskCompletions,
        taskObjectives: taskObjectives,
        hideoutModules: hideoutModules,
        hideoutParts: hideoutParts,

        // Migration metadata
        importedFromApi: true,
        importDate: new Date().toISOString(),
        sourceUserId: data.userId,
        sourceDomain: oldDomain,
      };

      return migrationData;
    } catch (error) {
      console.error("Error fetching data with API token:", error);
      return null;
    }
  }
}
