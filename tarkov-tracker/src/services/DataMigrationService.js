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
        // Make a deep copy to avoid reference issues
        return JSON.parse(JSON.stringify(parsedData));
      }
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
      const localData = this.getLocalData();
      if (!localData) {
        console.error("Migration failed: No local data to migrate");
        return false;
      }
      try {
        // Double check that the user doesn't already have data
        const progressRef = doc(firestore, "progress", uid);
        const existingDoc = await getDoc(progressRef);
        if (existingDoc.exists()) {
          const existingData = existingDoc.data();
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
        const progressRef = doc(firestore, "progress", uid);
        await setDoc(progressRef, localData);
        // Create a backup in localStorage with timestamp just in case
        const backupKey = `progress_backup_${new Date().toISOString()}`;
        try {
          localStorage.setItem(backupKey, JSON.stringify(localData));
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
      // Add import metadata to the data
      importedData.lastUpdated = new Date().toISOString();
      importedData.importedFromExternalSource = true;
      importedData.importDate = new Date().toISOString();
      // Write the data to Firestore
      try {
        const progressRef = doc(firestore, "progress", uid);
        await setDoc(progressRef, importedData);
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
  static async fetchDataWithApiToken(
    apiToken,
    oldDomain = "https://tarkovtracker.io/api/v2/progress",
  ) {
    if (!apiToken) {
      console.error("No API token provided");
      return null;
    }
    try {
      // Try to fetch data from the old domain's API
      const apiUrl = `${oldDomain}`;
      const headers = {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      };
      const response = await fetch(apiUrl, {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        let errorText = await response.text();
        console.error(
          `[DataMigrationService] API fetch failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
        return null;
      }
      const responseData = await response.json();
      // Extract the actual data from the response which has 'data' and 'meta' properties
      const data = responseData.data || responseData;
      // Convert array-based task progress to object format
      const taskCompletions = {};
      if (Array.isArray(data.tasksProgress)) {
        data.tasksProgress.forEach((task) => {
          if (task.complete === true) {
            taskCompletions[task.id] = {
              complete: true,
              timestamp: Date.now(),
              failed: task.failed || false,
            };
          }
        });
      }
      // Convert array-based hideout modules to object format
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
      console.error(
        "[DataMigrationService] Error fetching data with API token:",
        error,
      );
      return null;
    }
  }
}
