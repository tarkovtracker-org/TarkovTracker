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
  [key: string]: any;
}

// Interface for the exported data object
interface ExportObject {
  type: 'tarkovtracker-migration';
  timestamp: string;
  version: number;
  data: ProgressData;
}

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
      const progressData = localStorage.getItem('progress');
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
      console.error('Error checking local data:', error);
      return false;
    }
  }

  /**
   * Get the local progress data
   * @returns {ProgressData | null} The local progress data or null if none exists
   */
  static getLocalData(): ProgressData | null {
    try {
      const progressData = localStorage.getItem('progress');
      if (!progressData) {
        console.warn('No progress data in localStorage');
        return null;
      }
      const parsedData: ProgressData = JSON.parse(progressData);
      if (Object.keys(parsedData).length > 0) {
        return JSON.parse(JSON.stringify(parsedData)) as ProgressData;
      }
      return null;
    } catch (error) {
      console.error('Error getting local data:', error);
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
      console.error('Error checking user data:', error);
      return false;
    }
  }

  /**
   * Migrate local data to a user's account
   * @param {string} uid The user's UID
   * @returns {Promise<boolean>} True if migration was successful
   */
  static async migrateDataToUser(uid: string): Promise<boolean> {
    if (!uid) {
      console.error('Migration failed: No user ID provided');
      return false;
    }
    try {
      const localData = this.getLocalData();
      if (!localData) {
        console.error('Migration failed: No local data to migrate');
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
            console.warn(
              'User already has meaningful progress, aborting migration'
            );
            return false;
          }
        }
      } catch (checkError) {
        console.error('Error checking existing data:', checkError);
        // Continue
      }

      localData.lastUpdated = new Date().toISOString();
      localData.migratedFromLocalStorage = true;
      localData.migrationDate = new Date().toISOString();
      localData.autoMigrated = true;
      if (!localData.displayName) {
        localData.imported = true;
      }

      try {
        const progressRef = doc(firestore, 'progress', uid);
        await setDoc(progressRef, localData as DocumentData); // Cast to DocumentData
        const backupKey = `progress_backup_${new Date().toISOString()}`;
        try {
          localStorage.setItem(backupKey, JSON.stringify(localData));
        } catch (backupError) {
          console.warn('Failed to create backup:', backupError);
        }
        return true;
      } catch (firestoreError) {
        console.error('Error writing to Firestore:', firestoreError);
        return false;
      }
    } catch (error) {
      console.error('Error in migration process:', error);
      return false;
    }
  }

  /**
   * Export data in a format suitable for cross-domain migration
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
      console.error('Error exporting data for migration:', error);
      return null;
    }
  }

  /**
   * Import data from a JSON string provided by a user
   * @param {string} jsonString The JSON string to import
   * @returns {ProgressData | null} The parsed data or null if invalid
   */
  static validateImportData(jsonString: string): ProgressData | null {
    try {
      const importedObject: any = JSON.parse(jsonString); // Parse as any first
      if (importedObject.type !== 'tarkovtracker-migration') {
        console.error('Not a valid TarkovTracker migration object');
        return null;
      }
      const data: ProgressData = importedObject.data;
      const requiredFields: (keyof ProgressData)[] = [
        'level',
        'gameEdition',
        'pmcFaction',
      ];
      for (const field of requiredFields) {
        // Check existence and handle potential undefined/null
        if (data[field] === undefined || data[field] === null) {
          console.error(`Missing or invalid required field: ${field}`);
          return null;
        }
      }
      // Basic type checks (can be expanded)
      if (typeof data.level !== 'number') {
        console.error(`Invalid type for field: level (expected number)`);
        return null;
      }
      if (typeof data.gameEdition !== 'string') {
        console.error(`Invalid type for field: gameEdition (expected string)`);
        return null;
      }
      if (typeof data.pmcFaction !== 'string') {
        console.error(`Invalid type for field: pmcFaction (expected string)`);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error parsing import data:', error);
      return null;
    }
  }

  /**
   * Import data from another domain to a user's account
   * @param {string} uid The user's UID
   * @param {ProgressData} importedData The imported data to save
   * @returns {Promise<boolean>} True if import was successful
   */
  static async importDataToUser(
    uid: string,
    importedData: ProgressData
  ): Promise<boolean> {
    if (!uid) {
      console.error('Import failed: No user ID provided');
      return false;
    }
    if (!importedData) {
      console.error('Import failed: No data to import');
      return false;
    }
    try {
      importedData.lastUpdated = new Date().toISOString();
      importedData.importedFromExternalSource = true;
      importedData.importDate = new Date().toISOString();

      try {
        const progressRef = doc(firestore, 'progress', uid);
        await setDoc(progressRef, importedData as DocumentData); // Cast to DocumentData
        return true;
      } catch (firestoreError) {
        console.error('Error writing to Firestore:', firestoreError);
        return false;
      }
    } catch (error) {
      console.error('Error in import process:', error);
      return false;
    }
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
      console.error('No API token provided');
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
        let errorText = await response.text();
        console.error(
          `[DataMigrationService] API fetch failed: ${response.status} ${response.statusText} - ${errorText}`
        );
        return null;
      }

      const responseData: any = await response.json(); // Fetch as any first
      const data = responseData.data || responseData; // Adapt based on actual API response

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
      if (Array.isArray(data.tasksProgress)) {
        data.tasksProgress.forEach((task: OldTaskProgress) => {
          if (task.complete === true) {
            taskCompletions![task.id] = {
              // Non-null assertion because we initialize it
              complete: true,
              timestamp: Date.now(),
              failed: task.failed || false,
            };
          }
        });
      }

      const hideoutModules: ProgressData['hideoutModules'] = {};
      if (Array.isArray(data.hideoutModulesProgress)) {
        data.hideoutModulesProgress.forEach(
          (module: OldHideoutModuleProgress) => {
            if (module.complete === true) {
              hideoutModules![module.id] = {
                // Non-null assertion
                complete: true,
                timestamp: Date.now(),
              };
            }
          }
        );
      }

      const hideoutParts: ProgressData['hideoutParts'] = {};
      if (Array.isArray(data.hideoutPartsProgress)) {
        data.hideoutPartsProgress.forEach((part: OldHideoutPartProgress) => {
          hideoutParts![part.id] = {
            // Non-null assertion
            complete: part.complete || false,
            count: part.count || 0,
            timestamp: part.complete ? Date.now() : null,
          };
        });
      }

      const taskObjectives: ProgressData['taskObjectives'] = {};
      if (Array.isArray(data.taskObjectivesProgress)) {
        data.taskObjectivesProgress.forEach(
          (objective: OldTaskObjectiveProgress) => {
            taskObjectives![objective.id] = {
              // Non-null assertion
              complete: objective.complete || false,
              count: objective.count || 0,
              timestamp: objective.complete ? Date.now() : null,
            };
          }
        );
      }

      const migrationData: ProgressData = {
        level: data.playerLevel || data.level || 1,
        gameEdition: data.gameEdition || 'standard',
        pmcFaction: data.pmcFaction || 'usec',
        displayName: data.displayName || '',
        taskCompletions: taskCompletions,
        taskObjectives: taskObjectives,
        hideoutModules: hideoutModules,
        hideoutParts: hideoutParts,
        importedFromApi: true,
        importDate: new Date().toISOString(),
        sourceUserId: data.userId,
        sourceDomain: oldDomain,
      };

      return migrationData;
    } catch (error) {
      console.error(
        '[DataMigrationService] Error fetching data with API token:',
        error
      );
      return null;
    }
  }
}
