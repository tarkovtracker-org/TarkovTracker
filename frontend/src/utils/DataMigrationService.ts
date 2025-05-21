import { firestore } from '@/plugins/firebase';
import { doc, getDoc, setDoc, DocumentData } from 'firebase/firestore';

// Define a basic interface for the progress data structure
interface ProgressData {
  level: number;
  gameEdition?: string; // Optional fields can be marked with ?
  pmcFaction?: string;
  displayName?: string;
  taskCompletions?: {
    [key: string]: { complete: boolean; timestamp?: number; failed?: boolean };
  };
  taskObjectives?: {
    [key: string]: {
      complete: boolean;
      count?: number;
      timestamp?: number | null;
    };
  };
  hideoutModules?: { [key: string]: { complete: boolean; timestamp?: number } };
  hideoutParts?: {
    [key: string]: {
      complete: boolean;
      count?: number;
      timestamp?: number | null;
    };
  };
  lastUpdated?: string;
  migratedFromLocalStorage?: boolean;
  migrationDate?: string;
  autoMigrated?: boolean;
  imported?: boolean; // Assuming this is a boolean flag
  importedFromExternalSource?: boolean;
  importDate?: string;
  importedFromApi?: boolean;
  sourceUserId?: string; // Or appropriate type
  sourceDomain?: string;
  // Allow any other properties, as the structure seems flexible
  [key: string]: unknown;
}
// Interface for the exported data object
interface ExportObject {
  type: 'tarkovtracker-migration';
  timestamp: string;
  version: number;
  data: ProgressData;
}

const LOCAL_PROGRESS_KEY = 'progress';

/**
 * Service to handle migration of local data to a user's Firebase account
 */
export default class DataMigrationService {
  /**
   * Check if there is local data that can be migrated to a user account
   * @returns {boolean} True if local data exists
   */
  static hasLocalData(): boolean {
    try {
      const progressData = localStorage.getItem(LOCAL_PROGRESS_KEY);
      if (!progressData || progressData === '{}') {
        return false;
      }
      const parsedData: ProgressData = JSON.parse(progressData);
      const hasKeys = Object.keys(parsedData).length > 0;
      const hasProgress =
        parsedData.level > 1 ||
        Object.keys(parsedData.taskCompletions || {}).length > 0 ||
        Object.keys(parsedData.taskObjectives || {}).length > 0 ||
        Object.keys(parsedData.hideoutModules || {}).length > 0;
      return hasKeys && hasProgress;
    } catch (error) {
      console.warn('[DataMigrationService] Error in hasLocalData:', error);
      return false;
    }
  }
  /**
   * Get the local progress data
   * @returns {ProgressData | null} The local progress data or null if none exists
   */
  static getLocalData(): ProgressData | null {
    try {
      const progressData = localStorage.getItem(LOCAL_PROGRESS_KEY);
      if (!progressData) {
        return null;
      }
      const parsedData: ProgressData = JSON.parse(progressData);
      if (Object.keys(parsedData).length > 0) {
        return JSON.parse(JSON.stringify(parsedData)) as ProgressData;
      }
      return null;
    } catch (error) {
      console.warn('[DataMigrationService] Error in getLocalData:', error);
      return null;
    }
  }
  /**
   * Check if a user already has data in their account
   * @param {string} uid The user's UID
   * @returns {Promise<boolean>} True if the user has existing data
   */
  static async hasUserData(uid: string): Promise<boolean> {
    try {
      const progressRef = doc(firestore, 'progress', uid);
      const progressDoc = await getDoc(progressRef);
      const exists = progressDoc.exists();
      const data: ProgressData = (progressDoc.data() as ProgressData) || {};
      const hasData = Object.keys(data).length > 0;
      const hasProgress =
        data.level > 1 ||
        Object.keys(data.taskCompletions || {}).length > 0 ||
        Object.keys(data.taskObjectives || {}).length > 0 ||
        Object.keys(data.hideoutModules || {}).length > 0;
      return exists && hasData && hasProgress;
    } catch (error) {
      console.warn('[DataMigrationService] Error in hasUserData:', error);
      return false;
    }
  }
  /**
   * Migrate local data to a user's account
   * This is typically called if a user logs in and has local data but no cloud data.
   * It's often handled automatically by sync plugins like pinia-fireswap now,
   * but can be called explicitly if needed.
   * @param {string} uid The user's UID
   * @returns {Promise<boolean>} True if migration was successful
   */
  static async migrateDataToUser(uid: string): Promise<boolean> {
    if (!uid) {
      return false;
    }
    try {
      const localData = this.getLocalData();
      if (!localData) {
        return false;
      }
      try {
        const progressRef = doc(firestore, 'progress', uid);
        const existingDoc = await getDoc(progressRef);
        if (existingDoc.exists()) {
          const existingData = existingDoc.data() as ProgressData;
          if (
            existingData &&
            (existingData.level > 1 ||
              Object.keys(existingData.taskCompletions || {}).length > 0 ||
              Object.keys(existingData.taskObjectives || {}).length > 0)
          ) {
            // User already has significant data, don't overwrite automatically
            console.warn(
              '[DataMigrationService] User already has data, aborting automatic migration.'
            );
            return false;
          }
        }
      } catch (checkError) {
        // Continue with migration if check fails (e.g., permission issue, treat as no data)
        console.warn(
          '[DataMigrationService] Error checking existing user data proceeding',
          checkError
        );
      }
      localData.lastUpdated = new Date().toISOString();
      localData.migratedFromLocalStorage = true;
      localData.migrationDate = new Date().toISOString();
      localData.autoMigrated = true; // Assuming this context is an auto-migration
      if (!localData.displayName) {
        // Potentially set a flag that this was an import/migration if no display name exists
        localData.imported = true;
      }
      try {
        const progressRef = doc(firestore, 'progress', uid);
        await setDoc(progressRef, localData as DocumentData); // Cast to DocumentData
        const backupKey = `progress_backup_${new Date().toISOString()}`;
        try {
          localStorage.setItem(backupKey, JSON.stringify(localData));
          // Clear the main 'progress' key after successful migration to Firestore
          // if this is meant to be a one-time automatic operation.
          // However, if pinia-fireswap keeps it in sync, clearing might be unnecessary
          // or even counter-productive. For now, we'll leave it to allow local use after logout.
          // localStorage.removeItem(LOCAL_PROGRESS_KEY);
        } catch (backupError) {
          console.warn(
            '[DataMigrationService] Could not backup local data after migration:',
            backupError
          );
        }
        return true;
      } catch (firestoreError) {
        console.error('[DataMigrationService] Error migrating data to Firestore:', firestoreError);
      }
    } catch (error) {
      console.error('[DataMigrationService] General error in migrateDataToUser:', error);
      return false;
    }
    return false;
  }
  /**
   * Export data in a format suitable for cross-domain migration (e.g., via file download/upload)
   * @returns {ExportObject | null} The formatted data for export or null if no data
   */
  static exportDataForMigration(): ExportObject | null {
    try {
      const data = this.getLocalData();
      if (!data) return null;
      const exportObject: ExportObject = {
        type: 'tarkovtracker-migration',
        timestamp: new Date().toISOString(),
        version: 1,
        data: data,
      };
      return exportObject;
    } catch (error) {
      console.warn('[DataMigrationService] Error in exportDataForMigration:', error);
      return null;
    }
  }
  /**
   * Import data from a JSON string provided by a user (e.g., from an uploaded file)
   * @param {string} jsonString The JSON string to import
   * @returns {ProgressData | null} The parsed data or null if invalid
   */
  static validateImportData(jsonString: string): ProgressData | null {
    try {
      const parsedJson = JSON.parse(jsonString) as unknown; // Parse as unknown first

      if (
        typeof parsedJson !== 'object' ||
        parsedJson === null ||
        !('type' in parsedJson) || // Ensure 'type' property exists
        (parsedJson as { type: unknown }).type !== 'tarkovtracker-migration' ||
        !('data' in parsedJson) // Ensure 'data' property exists
      ) {
        console.warn(
          '[DataMigrationService] Invalid import type or structure in parsed JSON:',
          (parsedJson as { type?: unknown })?.type // Safely access type for logging
        );
        return null;
      }

      // Now we know parsedJson is an object with 'type' (correct value) and 'data'.
      const data = (parsedJson as { data: unknown }).data as ProgressData;

      // Basic validation (can be expanded)
      if (typeof data.level !== 'number') {
        console.warn('[DataMigrationService] Invalid level in import data.');
        return null;
      }
      // Add more checks as needed for critical fields like gameEdition, pmcFaction
      return data;
    } catch (error) {
      console.error('[DataMigrationService] Error validating import data:', error);
      return null;
    }
  }
  /**
   * Import data from another domain/file to a user's account, overwriting existing data.
   * @param {string} uid The user's UID
   * @param {ProgressData} importedData The imported data to save
   * @returns {Promise<boolean>} True if import was successful
   */
  static async importDataToUser(uid: string, importedData: ProgressData): Promise<boolean> {
    if (!uid) {
      console.error('[DataMigrationService] No UID provided for importDataToUser.');
      return false;
    }
    if (!importedData) {
      console.error('[DataMigrationService] No data provided for importDataToUser.');
      return false;
    }
    try {
      importedData.lastUpdated = new Date().toISOString();
      importedData.importedFromExternalSource = true; // Mark as imported
      importedData.importDate = new Date().toISOString();
      try {
        const progressRef = doc(firestore, 'progress', uid);
        await setDoc(progressRef, importedData as DocumentData, { merge: false });
        console.log(`[DataMigrationService] Data successfully imported for user ${uid}`);
        // Also update local storage to reflect the imported data
        localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(importedData));
        return true;
      } catch (firestoreError) {
        console.error(
          `[DataMigrationService] Firestore error importing data for user ${uid}:`,
          firestoreError
        );
      }
    } catch (error) {
      console.error(
        `[DataMigrationService] General error in importDataToUser for user ${uid}:`,
        error
      );
      return false;
    }
    return false;
  }
  /**
   * Fetch user data from old TarkovTracker domain using API token
   * @param {string} apiToken The user's API token from the old site
   * @param {string} oldDomain Optional domain of the old site
   * @returns {Promise<ProgressData | null>} The user's data or null if failed
   */
  static async fetchDataWithApiToken(
    apiToken: string,
    oldDomain: string = 'https://tarkovtracker.io/api/v2/progress'
  ): Promise<ProgressData | null> {
    if (!apiToken) {
      return null;
    }
    try {
      const apiUrl = oldDomain; // The default parameter already includes the path
      const headers = {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      };
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        // let errorText = await response.text(); // Removed to simplify
        console.error(`[DataMigrationService] API token fetch failed: ${response.status}`);
        return null;
      }

      // Definition for the raw data structure from the old API
      interface OldApiRawData {
        playerLevel?: number;
        level?: number;
        gameEdition?: string;
        pmcFaction?: string;
        displayName?: string;
        tasksProgress?: OldTaskProgress[];
        hideoutModulesProgress?: OldHideoutModuleProgress[];
        hideoutPartsProgress?: OldHideoutPartProgress[];
        taskObjectivesProgress?: OldTaskObjectiveProgress[];
        userId?: string;
        [key: string]: unknown; // For any other properties
      }

      const apiJsonResponse = (await response.json()) as unknown;
      let dataFromApi: OldApiRawData;

      if (typeof apiJsonResponse === 'object' && apiJsonResponse !== null) {
        if (
          'data' in apiJsonResponse &&
          typeof (apiJsonResponse as { data: unknown }).data === 'object' &&
          (apiJsonResponse as { data: unknown }).data !== null
        ) {
          dataFromApi = (apiJsonResponse as { data: OldApiRawData }).data;
        } else {
          dataFromApi = apiJsonResponse as OldApiRawData;
        }
      } else {
        console.error('[DataMigrationService] API response is not a valid object.');
        return null;
      }

      // Type definitions for the expected array elements from the old API
      interface OldTaskProgress {
        id: string;
        complete?: boolean;
        failed?: boolean;
      }
      interface OldHideoutModuleProgress {
        id: string;
        complete?: boolean;
      }
      interface OldHideoutPartProgress {
        id: string;
        complete?: boolean;
        count?: number;
      }
      interface OldTaskObjectiveProgress {
        id: string;
        complete?: boolean;
        count?: number;
      }
      const taskCompletions: ProgressData['taskCompletions'] = {};
      if (Array.isArray(dataFromApi.tasksProgress)) {
        dataFromApi.tasksProgress.forEach((task: OldTaskProgress) => {
          if (task.complete === true || task.failed === true) {
            // Also include failed tasks
            taskCompletions![task.id] = {
              // Non-null assertion because we initialize it
              complete: task.complete || false,
              timestamp: Date.now(),
              failed: task.failed || false,
            };
          }
        });
      }

      const hideoutModules: ProgressData['hideoutModules'] = {};
      if (Array.isArray(dataFromApi.hideoutModulesProgress)) {
        dataFromApi.hideoutModulesProgress.forEach((module: OldHideoutModuleProgress) => {
          if (module.complete === true) {
            hideoutModules![module.id] = {
              // Non-null assertion
              complete: true,
              timestamp: Date.now(),
            };
          }
        });
      }

      const hideoutParts: ProgressData['hideoutParts'] = {};
      if (Array.isArray(dataFromApi.hideoutPartsProgress)) {
        dataFromApi.hideoutPartsProgress.forEach((part: OldHideoutPartProgress) => {
          hideoutParts![part.id] = {
            // Non-null assertion
            complete: part.complete || false,
            count: part.count || 0,
            timestamp: part.complete ? Date.now() : null,
          };
        });
      }

      const taskObjectives: ProgressData['taskObjectives'] = {};
      if (Array.isArray(dataFromApi.taskObjectivesProgress)) {
        dataFromApi.taskObjectivesProgress.forEach((objective: OldTaskObjectiveProgress) => {
          taskObjectives![objective.id] = {
            // Non-null assertion
            complete: objective.complete || false,
            count: objective.count || 0,
            timestamp: objective.complete ? Date.now() : null,
          };
        });
      }

      const migrationData: ProgressData = {
        level: dataFromApi.playerLevel || dataFromApi.level || 1,
        gameEdition: dataFromApi.gameEdition || 'standard',
        pmcFaction: dataFromApi.pmcFaction || 'usec',
        displayName: dataFromApi.displayName || '',
        taskCompletions: taskCompletions,
        taskObjectives: taskObjectives,
        hideoutModules: hideoutModules,
        hideoutParts: hideoutParts,
        importedFromApi: true,
        importDate: new Date().toISOString(),
        sourceUserId: dataFromApi.userId,
        sourceDomain: oldDomain,
      };

      return migrationData;
    } catch (error) {
      console.error('[DataMigrationService] Error fetching data with API token:', error);
      return null;
    }
  }
}
