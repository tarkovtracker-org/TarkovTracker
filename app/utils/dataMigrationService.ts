import {
  DEFAULT_GAME_EDITION,
  DEFAULT_PMC_FACTION,
  GAME_EDITION_STRING_VALUES,
  LIMITS,
  normalizePMCFaction,
} from '@/utils/constants';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type {
  HideoutModule,
  HideoutPart,
  TaskCompletion,
  TaskObjective,
  UserProgressData,
} from '@/types/progress';
import type { GameMode } from '@/utils/constants';
// Compute default edition index once at module scope (constant value)
const DEFAULT_EDITION_INDEX = Math.max(
  0,
  Math.min(GAME_EDITION_STRING_VALUES.length - 1, DEFAULT_GAME_EDITION - 1)
);
const DEFAULT_EDITION_STRING = GAME_EDITION_STRING_VALUES[DEFAULT_EDITION_INDEX];
// Define a basic interface for the progress data structure
export interface ProgressData {
  level: number;
  gameEdition?: string;
  pmcFaction?: string;
  displayName?: string;
  taskCompletions?: { [key: string]: TaskCompletion };
  taskObjectives?: { [key: string]: TaskObjective };
  hideoutModules?: { [key: string]: HideoutModule };
  hideoutParts?: { [key: string]: HideoutPart };
  lastUpdated?: string;
  migratedFromLocalStorage?: boolean;
  migrationDate?: string;
  autoMigrated?: boolean;
  imported?: boolean;
  importedFromExternalSource?: boolean;
  importDate?: string;
  importedFromApi?: boolean;
  sourceUserId?: string;
  sourceDomain?: string;
  [key: string]: unknown;
}
const LOCAL_PROGRESS_KEY = STORAGE_KEYS.progress;
/**
 * Service to handle migration of local data to a user's Supabase account
 * Also includes validation utilities for progress data
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class DataMigrationService {
  // ============================================
  // Validation Utilities
  // ============================================
  /**
   * Check if user has significant progress data worth preserving
   */
  static hasSignificantProgress(data: ProgressData): boolean {
    return (
      data.level > 1 ||
      Object.keys(data.taskCompletions || {}).length > 0 ||
      Object.keys(data.taskObjectives || {}).length > 0 ||
      Object.keys(data.hideoutModules || {}).length > 0 ||
      Object.keys(data.hideoutParts || {}).length > 0
    );
  }
  /**
   * Validate that an object has the structure of progress data
   * Performs shallow structural checks on nested fields to prevent malformed data
   */
  static isValidProgressData(data: unknown): data is ProgressData {
    if (typeof data !== 'object' || data === null) return false;
    const typed = data as ProgressData;
    // Level is required and must be a valid number >= 1
    if (typeof typed.level !== 'number' || typed.level < 1) return false;
    // If taskCompletions exists, validate it's a plain object (not array) with object values
    if (typed.taskCompletions !== undefined) {
      if (
        typeof typed.taskCompletions !== 'object' ||
        typed.taskCompletions === null ||
        Array.isArray(typed.taskCompletions)
      ) {
        return false;
      }
      // Check that all values are objects with expected structure
      for (const key of Object.keys(typed.taskCompletions)) {
        const completion = (typed.taskCompletions as Record<string, unknown>)[key];
        if (typeof completion !== 'object' || completion === null || Array.isArray(completion)) {
          return false;
        }
      }
    }
    // If taskObjectives exists, validate it's a plain object (not array)
    if (typed.taskObjectives !== undefined) {
      if (
        typeof typed.taskObjectives !== 'object' ||
        typed.taskObjectives === null ||
        Array.isArray(typed.taskObjectives)
      ) {
        return false;
      }
    }
    // If hideoutModules exists, validate it's a plain object (not array) with object values
    if (typed.hideoutModules !== undefined) {
      if (
        typeof typed.hideoutModules !== 'object' ||
        typed.hideoutModules === null ||
        Array.isArray(typed.hideoutModules)
      ) {
        return false;
      }
      // Check that all values are objects with expected structure
      for (const key of Object.keys(typed.hideoutModules)) {
        const module = (typed.hideoutModules as Record<string, unknown>)[key];
        if (typeof module !== 'object' || module === null || Array.isArray(module)) {
          return false;
        }
      }
    }
    // If hideoutParts exists, validate it's a plain object (not array) with object values
    if (typed.hideoutParts !== undefined) {
      if (
        typeof typed.hideoutParts !== 'object' ||
        typed.hideoutParts === null ||
        Array.isArray(typed.hideoutParts)
      ) {
        return false;
      }
      // Check that all values are objects with expected structure
      for (const key of Object.keys(typed.hideoutParts)) {
        const part = (typed.hideoutParts as Record<string, unknown>)[key];
        if (typeof part !== 'object' || part === null || Array.isArray(part)) {
          return false;
        }
      }
    }
    return true;
  }
  /**
   * Validate import file format structure
   */
  static validateImportFormat(
    parsedJson: unknown
  ): parsedJson is { type: string; data: ProgressData } {
    return (
      typeof parsedJson === 'object' &&
      parsedJson !== null &&
      'type' in parsedJson &&
      (parsedJson as { type: unknown }).type === 'tarkovtracker-migration' &&
      'data' in parsedJson &&
      this.isValidProgressData((parsedJson as { data: unknown }).data)
    );
  }
  /**
   * Validate API token format
   * Checks that token contains only alphanumeric characters, underscores, and hyphens
   */
  static isValidApiToken(token: string): boolean {
    return (
      typeof token === 'string' &&
      token.length > 10 &&
      token.trim() === token &&
      /^[A-Za-z0-9_-]+$/.test(token)
    );
  }
  /**
   * Check if data is worth migrating (has meaningful content)
   */
  static hasDataWorthMigrating(data: ProgressData): boolean {
    return (
      this.hasSignificantProgress(data) ||
      (data.displayName !== undefined && data.displayName.trim().length > 0) ||
      (data.gameEdition !== undefined &&
        data.gameEdition !== '' &&
        data.gameEdition !== GAME_EDITION_STRING_VALUES[0]) ||
      normalizePMCFaction(data.pmcFaction) !== DEFAULT_PMC_FACTION
    );
  }
  /**
   * Validate that an object looks like old API data
   */
  static isValidOldApiData(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const typed = data as Record<string, unknown>;
    // Must have at least level or playerLevel
    return (
      typeof typed.level === 'number' ||
      typeof typed.playerLevel === 'number' ||
      Array.isArray(typed.tasksProgress) ||
      Array.isArray(typed.hideoutModulesProgress)
    );
  }
  /**
   * Sanitize user input data
   */
  static sanitizeProgressData(data: ProgressData): ProgressData {
    return {
      ...data,
      level: Math.max(1, Math.min(LIMITS.GAME_MAX_LEVEL, Math.floor(data.level))),
      displayName: data.displayName?.trim().slice(0, 50) || '',
      gameEdition: GAME_EDITION_STRING_VALUES.includes(
        data.gameEdition as (typeof GAME_EDITION_STRING_VALUES)[number]
      )
        ? data.gameEdition
        : DEFAULT_EDITION_STRING,
      pmcFaction: normalizePMCFaction(data.pmcFaction).toLowerCase(),
    };
  }
  // ============================================
  // Data Transformation Utilities
  // ============================================
  /**
   * Transform task objectives to ensure proper timestamp format
   * @param taskObjectives The task objectives to transform
   * @returns Transformed task objectives compatible with UserProgressData
   */
  private static transformTaskObjectives(
    taskObjectives: ProgressData['taskObjectives']
  ): UserProgressData['taskObjectives'] {
    const transformed: UserProgressData['taskObjectives'] = {};
    if (taskObjectives) {
      for (const [id, objective] of Object.entries(taskObjectives)) {
        const transformedObjective: Record<string, unknown> = {
          complete: objective.complete || false,
          count: objective.count || 0,
        };
        // Only include timestamp if it's not null/undefined
        if (objective.timestamp !== null && objective.timestamp !== undefined) {
          transformedObjective.timestamp = objective.timestamp;
        }
        transformed[id] = transformedObjective;
      }
    }
    return transformed;
  }
  /**
   * Transform hideout parts to ensure proper timestamp format
   * @param hideoutParts The hideout parts to transform
   * @returns Transformed hideout parts compatible with UserProgressData
   */
  private static transformHideoutParts(
    hideoutParts: ProgressData['hideoutParts']
  ): UserProgressData['hideoutParts'] {
    const transformed: UserProgressData['hideoutParts'] = {};
    if (hideoutParts) {
      for (const [id, part] of Object.entries(hideoutParts)) {
        const transformedPart: Record<string, unknown> = {
          complete: part.complete || false,
          count: part.count || 0,
        };
        // Only include timestamp if it's not null/undefined
        if (part.timestamp !== null && part.timestamp !== undefined) {
          transformedPart.timestamp = part.timestamp;
        }
        transformed[id] = transformedPart;
      }
    }
    return transformed;
  }
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
      const parsedData = JSON.parse(progressData);
      // Validate parsedData has expected structure before checking
      if (!this.isValidProgressData(parsedData)) {
        return false;
      }
      // hasDataWorthMigrating checks progress, displayName, gameEdition, and pmcFaction
      return this.hasDataWorthMigrating(parsedData);
    } catch (error) {
      logger.warn('[DataMigrationService] Error in hasLocalData:', error);
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
      if (!progressData || progressData === '{}') {
        return null;
      }
      const parsedData = JSON.parse(progressData);
      // Validate parsedData has expected structure before returning
      if (!this.isValidProgressData(parsedData)) {
        logger.warn('[DataMigrationService] Invalid progress data structure in localStorage');
        return null;
      }
      // Return a deep copy to prevent mutations to the cached data
      return structuredClone(parsedData);
    } catch (error) {
      logger.warn('[DataMigrationService] Error in getLocalData:', error);
      return null;
    }
  }
  /**
   * Check if a user already has data in their account
   * @param {string} uid The user's UID
   * @returns {Promise<boolean>} True if the user has existing data
   */
  /**
   * Check if a user already has data in their account
   * @param {string} uid The user's UID
   * @returns {Promise<boolean>} True if the user has existing data
   */
  static async hasUserData(uid: string): Promise<boolean> {
    try {
      const { $supabase } = useNuxtApp();
      const { data, error } = await $supabase.client
        .from('user_progress')
        .select('level, task_completions, task_objectives, hideout_modules')
        .eq('user_id', uid)
        .single();
      if (error || !data) return false;
      const hasProgress =
        (data.level && data.level > 1) ||
        (data.task_completions && Object.keys(data.task_completions).length > 0) ||
        (data.task_objectives && Object.keys(data.task_objectives).length > 0) ||
        (data.hideout_modules && Object.keys(data.hideout_modules).length > 0);
      return !!hasProgress;
    } catch (error) {
      logger.warn('[DataMigrationService] Error in hasUserData:', error);
      return false;
    }
  }
  /**
   * Migrate local data to a user's account
   * @param {string} uid The user's UID
   * @returns {Promise<boolean>} True if migration was successful
   */
  static async migrateDataToUser(uid: string): Promise<boolean> {
    if (!uid) return false;
    try {
      const localData = this.getLocalData();
      if (!localData) return false;
      const { $supabase } = useNuxtApp();
      const hasExisting = await this.hasUserData(uid);
      if (hasExisting) {
        logger.warn('[DataMigrationService] User already has data, aborting automatic migration.');
        return false;
      }
      // Prepare data for Supabase (map to snake_case columns)
      const supabaseData = {
        user_id: uid,
        level: localData.level,
        game_edition:
          typeof localData.gameEdition === 'string'
            ? parseInt(localData.gameEdition)
            : localData.gameEdition,
        pmc_faction: localData.pmcFaction,
        display_name: localData.displayName,
        task_completions: localData.taskCompletions,
        task_objectives: this.transformTaskObjectives(localData.taskObjectives),
        hideout_modules: localData.hideoutModules,
        hideout_parts: this.transformHideoutParts(localData.hideoutParts),
        last_updated: new Date().toISOString(),
        // Metadata stored in a separate jsonb column or flattened?
        // For now, we'll assume the schema handles the main fields.
        // If we need to store migration metadata, we might need a metadata column or just ignore it for now as it's less critical.
      };
      const { error } = await $supabase.client.from('user_progress').upsert(supabaseData);
      if (error) {
        logger.error('[DataMigrationService] Error migrating data to Supabase:', error);
        return false;
      }
      // Backup local data
      const backupKey = `${STORAGE_KEYS.progressBackupPrefix}${new Date().toISOString()}`;
      try {
        localStorage.setItem(backupKey, JSON.stringify(localData));
      } catch (backupError) {
        logger.warn('[DataMigrationService] Could not backup local data:', backupError);
      }
      return true;
    } catch (error) {
      logger.error('[DataMigrationService] General error in migrateDataToUser:', error);
      return false;
    }
  }
  // ... exportDataForMigration and validateImportData remain largely the same ...
  /**
   * Import data from another domain/file to a user's account.
   * @param {string} uid The user's UID
   * @param {ProgressData} importedData The imported data to save
   * @returns {Promise<boolean>} True if import was successful
   */
  // TODO: _targetGameMode is reserved for future game-mode-specific import logic.
  // When multi-mode import is implemented, this parameter will determine which
  // game mode's data store receives the imported data.
  static async importDataToUser(
    uid: string,
    importedData: ProgressData,
    _targetGameMode?: GameMode
  ): Promise<boolean> {
    if (!uid || !importedData) return false;
    try {
      const { $supabase } = useNuxtApp();
      // Transform and map to Supabase schema
      const supabaseData = {
        user_id: uid,
        level: importedData.level || 1,
        game_edition:
          typeof importedData.gameEdition === 'string'
            ? parseInt(importedData.gameEdition) || 1
            : importedData.gameEdition || 1,
        pmc_faction: normalizePMCFaction(importedData.pmcFaction).toLowerCase(),
        display_name: importedData.displayName || null,
        task_completions: importedData.taskCompletions || {},
        task_objectives: this.transformTaskObjectives(importedData.taskObjectives || {}),
        hideout_modules: importedData.hideoutModules || {},
        hideout_parts: this.transformHideoutParts(importedData.hideoutParts || {}),
        last_updated: new Date().toISOString(),
      };
      const { error } = await $supabase.client.from('user_progress').upsert(supabaseData);
      if (error) {
        logger.error(
          `[DataMigrationService] Supabase error importing data for user ${uid}:`,
          error
        );
        return false;
      }
      // Update local storage
      // We might need to reconstruct the local storage format if the app still relies on it for some things,
      // but primarily we rely on the store syncing from Supabase now.
      // For safety, we can update the local 'progress' key with the imported data structure.
      localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(importedData));
      return true;
    } catch (error) {
      logger.error(
        `[DataMigrationService] General error in importDataToUser for user ${uid}:`,
        error
      );
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
        logger.error(`[DataMigrationService] API token fetch failed: ${response.status}`);
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
        logger.error('[DataMigrationService] API response is not a valid object.');
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
            timestamp: part.complete ? Date.now() : undefined,
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
            timestamp: objective.complete ? Date.now() : undefined,
          };
        });
      }
      const migrationData: ProgressData = {
        level: dataFromApi.playerLevel || dataFromApi.level || 1,
        gameEdition: dataFromApi.gameEdition || GAME_EDITION_STRING_VALUES[0],
        pmcFaction: normalizePMCFaction(dataFromApi.pmcFaction).toLowerCase(),
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
      logger.error('[DataMigrationService] Error fetching data with API token:', error);
      return null;
    }
  }
}
