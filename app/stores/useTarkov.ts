import { type _GettersTree, defineStore, type StateTree } from 'pinia';
import { useSupabaseSync } from '@/composables/supabase/useSupabaseSync';
import { useSafeToast } from '@/composables/useSafeToast';
import { useToastI18n } from '@/composables/useToastI18n';
import {
  actions,
  defaultState,
  getters,
  migrateToGameModeStructure,
  type ApiTaskUpdate,
  type ApiUpdateMeta,
  type UserActions,
  type UserProgressData,
  type UserState,
} from '@/stores/progressState';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { delay } from '@/utils/async';
import {
  GAME_MODES,
  MANUAL_FAIL_TASK_IDS,
  SPECIAL_STATIONS,
  type GameMode,
} from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  buildSkillKeyAliases,
  collapseSkillOffsets,
  getCanonicalSkillKey,
  resolveSkillKey,
} from '@/utils/skillHelpers';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { getCompletionFlags, type RawTaskCompletion } from '@/utils/taskStatus';
import type { GameEdition, HideoutStation, Task } from '@/types/tarkov';
// ============================================================================
// Constants
// ============================================================================
const QUOTA_CHECK_INTERVAL_MS = 60000;
const ESTIMATED_QUOTA_BYTES = 5 * 1024 * 1024;
const QUOTA_SAFETY_BUFFER_BYTES = 512 * 1024;
const SYNC_DEBOUNCE_MS = 5000;
const SELF_ORIGIN_THRESHOLD_MS = 3000;
const RECENT_LOCAL_SYNC_HISTORY_SIZE = 20;
const SYNC_RESUME_DELAY_MS = 1000;
const RESET_SETTLE_DELAY_MS = 100;
const API_UPDATE_FRESHNESS_MS = 30000;
const ISSUE_71_ACCOUNT_AGE_THRESHOLD_MS = 5000;
const LOAD_RETRY_COUNT = 3;
const LOAD_RETRY_DELAY_MS = 500;
// ============================================================================
// Module State
// ============================================================================
let lastQuotaCheckTime = 0;
type UserProgressRow = {
  user_id: string;
  current_game_mode: string | null;
  game_edition: number | null;
  tarkov_uid: number | null;
  pvp_data: UserProgressData | null;
  pve_data: UserProgressData | null;
  created_at: string | null;
  updated_at: string | null;
};
const coerceGameMode = (mode?: string | null): GameMode => {
  return mode === GAME_MODES.PVE ? GAME_MODES.PVE : GAME_MODES.PVP;
};
// Create a type that extends UserState with Pinia store methods
type TarkovStoreInstance = UserState & {
  $state: UserState;
  $patch(partialOrMutator: Partial<UserState> | ((state: UserState) => void)): void;
  migrateTaskCompletionSchema(): { pvpMigrated: number; pveMigrated: number };
  repairGameModeFailedTasks(gameModeData: UserProgressData, tasksMap: Map<string, Task>): number;
  repairGameModeCompletedObjectives(
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
  setTasksAndObjectivesUncompleted(taskIds: string[], objectiveIds: string[]): void;
  enforceHideoutPrereqsNow(): number;
  markTaskAsUncompleted(
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
  markTaskAsFailed(
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
};
// ============================================================================
// Utility Functions
// ============================================================================
const hasProgress = (data: unknown): boolean => {
  const state = data as UserState;
  if (!state) return false;
  const modeHasData = (mode: UserProgressData | undefined) =>
    mode &&
    (mode.level > 1 ||
      Object.keys(mode.taskCompletions || {}).length > 0 ||
      Object.keys(mode.hideoutModules || {}).length > 0 ||
      Object.keys(mode.storyChapters || {}).length > 0);
  return Boolean(modeHasData(state.pvp) || modeHasData(state.pve));
};
const buildUpsertPayload = (
  userId: string,
  state: UserState,
  partial?: Partial<{ pvp_data: UserProgressData; pve_data: UserProgressData }>
) => ({
  user_id: userId,
  current_game_mode: state.currentGameMode || GAME_MODES.PVP,
  game_edition: state.gameEdition || defaultState.gameEdition,
  tarkov_uid: state.tarkovUid ?? null,
  pvp_data: partial?.pvp_data ?? state.pvp ?? defaultState.pvp,
  pve_data: partial?.pve_data ?? state.pve ?? defaultState.pve,
});
const cloneStateSnapshot = <T>(value: T): T => {
  const rawValue = value !== null && typeof value === 'object' ? toRaw(value) : value;
  try {
    return structuredClone(rawValue);
  } catch {
    return JSON.parse(JSON.stringify(rawValue)) as T;
  }
};
type CountableEntry = { count?: number; complete?: boolean; timestamp?: number };
type StoryChapterEntry = UserProgressData['storyChapters'][string];
type StoryObjectiveEntry = NonNullable<StoryChapterEntry['objectives']>[string];
type TimestampedCompletionEntry = { complete?: boolean; timestamp?: number };
const mergeTimestampedCompletion = <T extends TimestampedCompletionEntry>(
  local: T | undefined,
  remote: T | undefined
): T | undefined => {
  if (!local && !remote) return undefined;
  if (!local) return { ...remote } as T;
  if (!remote) return { ...local } as T;
  const localTs = local.timestamp ?? 0;
  const remoteTs = remote.timestamp ?? 0;
  const newer = remoteTs >= localTs ? remote : local;
  const older = newer === remote ? local : remote;
  const merged: TimestampedCompletionEntry = {};
  if (typeof newer.complete === 'boolean') {
    merged.complete = newer.complete;
  } else if (typeof older.complete === 'boolean') {
    merged.complete = older.complete;
  }
  const latestTimestamp = Math.max(localTs, remoteTs);
  if (latestTimestamp > 0) {
    merged.timestamp = latestTimestamp;
  }
  return merged as T;
};
const mergeStoryChapterProgress = (
  local: UserProgressData['storyChapters'] | undefined,
  remote: UserProgressData['storyChapters'] | undefined
): UserProgressData['storyChapters'] => {
  const allChapterIds = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
  const merged: UserProgressData['storyChapters'] = {};
  for (const chapterId of allChapterIds) {
    const localChapter = local?.[chapterId];
    const remoteChapter = remote?.[chapterId];
    const mergedChapter = mergeTimestampedCompletion<StoryChapterEntry>(
      localChapter,
      remoteChapter
    );
    if (!mergedChapter) continue;
    const allObjectiveIds = new Set([
      ...Object.keys(localChapter?.objectives || {}),
      ...Object.keys(remoteChapter?.objectives || {}),
    ]);
    if (allObjectiveIds.size > 0) {
      const mergedObjectives: NonNullable<StoryChapterEntry['objectives']> = {};
      for (const objectiveId of allObjectiveIds) {
        const mergedObjective = mergeTimestampedCompletion<StoryObjectiveEntry>(
          localChapter?.objectives?.[objectiveId],
          remoteChapter?.objectives?.[objectiveId]
        );
        if (mergedObjective) {
          mergedObjectives[objectiveId] = mergedObjective;
        }
      }
      mergedChapter.objectives = mergedObjectives;
    }
    merged[chapterId] = mergedChapter;
  }
  return merged;
};
const mergeCountableObjects = <T extends Record<string, CountableEntry>>(
  local: T | undefined,
  remote: T | undefined
): T => {
  const merged = { ...local, ...remote } as T;
  for (const id of Object.keys(merged)) {
    const l = local?.[id];
    const r = remote?.[id];
    if (l && r) {
      const localTs = l.timestamp ?? 0;
      const remoteTs = r.timestamp ?? 0;
      const newer = remoteTs >= localTs ? r : l;
      const older = newer === r ? l : r;
      const newerHasComplete = typeof newer.complete === 'boolean';
      const olderHasComplete = typeof older.complete === 'boolean';
      merged[id as keyof T] = {
        complete: newerHasComplete ? newer.complete : olderHasComplete ? older.complete : false,
        count: Math.max(l.count || 0, r.count || 0),
        timestamp: Math.max(localTs, remoteTs) || undefined,
      } as T[keyof T];
    }
  }
  return merged;
};
const normalizeTaskCompletionEntry = (
  completion: RawTaskCompletion
): { complete?: boolean; failed?: boolean; timestamp?: number; manual?: boolean } | undefined => {
  if (completion === null || completion === undefined) return undefined;
  if (typeof completion === 'boolean') {
    return { complete: completion, failed: false };
  }
  const normalized: { complete?: boolean; failed?: boolean; timestamp?: number; manual?: boolean } =
    {
      complete: completion.complete === true,
      failed: completion.failed === true,
    };
  if (typeof completion.timestamp === 'number') {
    normalized.timestamp = completion.timestamp;
  }
  if (typeof completion.manual === 'boolean') {
    normalized.manual = completion.manual;
  }
  return normalized;
};
const normalizeTaskCompletionsMap = (
  taskCompletions: Record<string, RawTaskCompletion> | undefined
): number => {
  if (!taskCompletions) return 0;
  let migrated = 0;
  for (const [taskId, completion] of Object.entries(taskCompletions)) {
    if (typeof completion !== 'boolean') continue;
    const normalized = normalizeTaskCompletionEntry(completion);
    if (!normalized) continue;
    taskCompletions[taskId] = normalized;
    migrated += 1;
  }
  return migrated;
};
const notifyHideoutPrereqEnforcement = (removedCount: number) => {
  if (!removedCount || !import.meta.client) return;
  try {
    const toastI18n = useToastI18n();
    toastI18n.showHideoutUpdated(removedCount);
  } catch (error) {
    logger.warn('[TarkovStore] Could not show hideout enforcement toast:', error);
  }
};
type HideoutModuleMeta = {
  id: string;
  stationId: string;
  level: number;
  stationLevelRequirements: HideoutStation['levels'][number]['stationLevelRequirements'];
  skillRequirements: HideoutStation['levels'][number]['skillRequirements'];
  traderRequirements: HideoutStation['levels'][number]['traderRequirements'];
  itemRequirementIds: string[];
};
const buildHideoutModuleMeta = (stations: HideoutStation[]): HideoutModuleMeta[] => {
  const modules: HideoutModuleMeta[] = [];
  for (const station of stations) {
    for (const level of station.levels ?? []) {
      modules.push({
        id: level.id,
        stationId: station.id,
        level: level.level ?? 0,
        stationLevelRequirements: level.stationLevelRequirements ?? [],
        skillRequirements: level.skillRequirements ?? [],
        traderRequirements: level.traderRequirements ?? [],
        itemRequirementIds: level.itemRequirements?.map((req) => req.id) ?? [],
      });
    }
  }
  return modules;
};
const getStationBaseLevel = (station: HideoutStation, edition: GameEdition | undefined) => {
  const maxLevel = station.levels?.length ?? 0;
  if (station.normalizedName === SPECIAL_STATIONS.STASH) {
    return Math.min(edition?.defaultStashLevel ?? 0, maxLevel);
  }
  if (station.normalizedName === SPECIAL_STATIONS.CULTIST_CIRCLE) {
    return Math.min(edition?.defaultCultistCircleLevel ?? 0, maxLevel);
  }
  return 0;
};
type HideoutCheckOptions = {
  requireStationLevels: boolean;
  requireSkillLevels: boolean;
  requireTraderLoyalty: boolean;
  skills: Record<string, number>;
  skillKeyAliases: ReadonlyMap<string, string>;
  traders: Record<string, { level?: number }>;
};
const checkStationReqsMet = (
  module: HideoutModuleMeta,
  stationLevels: Map<string, number>,
  options: HideoutCheckOptions
): boolean => {
  if (!options.requireStationLevels) return true;
  return (
    module.stationLevelRequirements?.every((req) => {
      const requiredLevel = stationLevels.get(req.station.id) ?? 0;
      return requiredLevel >= req.level;
    }) ?? true
  );
};
const checkSkillReqsMet = (module: HideoutModuleMeta, options: HideoutCheckOptions): boolean => {
  if (!options.requireSkillLevels) return true;
  return (
    module.skillRequirements?.every((req) => {
      if (!req?.name || typeof req?.level !== 'number') return true;
      const skillKey = resolveSkillKey(req.name, options.skillKeyAliases);
      const playerSkillLevel = options.skills?.[skillKey] ?? 0;
      return playerSkillLevel >= req.level;
    }) ?? true
  );
};
const checkTraderReqsMet = (module: HideoutModuleMeta, options: HideoutCheckOptions): boolean => {
  if (!options.requireTraderLoyalty) return true;
  return (
    module.traderRequirements?.every((req) => {
      if (!req?.trader?.id || typeof req?.value !== 'number') return true;
      const playerTraderLevel = options.traders?.[req.trader.id]?.level ?? 1;
      return playerTraderLevel >= req.value;
    }) ?? true
  );
};
const computeNextLevelsAndValidModules = (
  stations: HideoutStation[],
  modulesByStation: Map<string, HideoutModuleMeta[]>,
  baseLevels: Map<string, number>,
  stationLevels: Map<string, number>,
  completedModuleIds: Set<string>,
  options: HideoutCheckOptions
): { nextLevels: Map<string, number>; nextValidModules: Set<string> } => {
  const nextLevels = new Map(baseLevels);
  const nextValidModules = new Set<string>();
  for (const station of stations) {
    const baseLevel = baseLevels.get(station.id) ?? 0;
    let currentLevel = baseLevel;
    const stationModules = modulesByStation.get(station.id) ?? [];
    for (const module of stationModules) {
      if (module.level <= baseLevel) {
        if (completedModuleIds.has(module.id)) {
          nextValidModules.add(module.id);
        }
        continue;
      }
      if (!completedModuleIds.has(module.id)) break;
      const stationReqsMet = checkStationReqsMet(module, stationLevels, options);
      const skillReqsMet = checkSkillReqsMet(module, options);
      const traderReqsMet = checkTraderReqsMet(module, options);
      if (stationReqsMet && skillReqsMet && traderReqsMet) {
        currentLevel = module.level;
        nextValidModules.add(module.id);
      } else {
        break;
      }
    }
    nextLevels.set(station.id, currentLevel);
  }
  return { nextLevels, nextValidModules };
};
const resolveValidHideoutModules = (
  modules: HideoutModuleMeta[],
  stations: HideoutStation[],
  completedModuleIds: Set<string>,
  edition: GameEdition | undefined,
  options: HideoutCheckOptions
) => {
  const modulesByStation = new Map<string, HideoutModuleMeta[]>();
  for (const module of modules) {
    const list = modulesByStation.get(module.stationId) ?? [];
    list.push(module);
    modulesByStation.set(module.stationId, list);
  }
  for (const list of modulesByStation.values()) {
    list.sort((a, b) => a.level - b.level);
  }
  const baseLevels = new Map<string, number>();
  for (const station of stations) {
    baseLevels.set(station.id, getStationBaseLevel(station, edition));
  }
  let stationLevels = new Map(baseLevels);
  let validModules = new Set<string>();
  const maxIterations = Math.max(5, modules.length * 2);
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    const { nextLevels, nextValidModules } = computeNextLevelsAndValidModules(
      stations,
      modulesByStation,
      baseLevels,
      stationLevels,
      completedModuleIds,
      options
    );
    const levelsStable =
      stationLevels.size === nextLevels.size &&
      Array.from(stationLevels.entries()).every(
        ([stationId, level]) => nextLevels.get(stationId) === level
      );
    const modulesStable =
      validModules.size === nextValidModules.size &&
      Array.from(validModules).every((moduleId) => nextValidModules.has(moduleId));
    stationLevels = nextLevels;
    validModules = nextValidModules;
    if (levelsStable && modulesStable) break;
  }
  if (iterations >= maxIterations) {
    logger.warn('[TarkovStore] Hideout validation hit iteration cap.', {
      iterations,
      maxIterations,
      validModulesCount: validModules.size,
      stationLevels: Object.fromEntries(stationLevels.entries()),
    });
  }
  return validModules;
};
const computeTotalSkills = (
  currentData: UserProgressData,
  tasks: Task[],
  skillKeyAliases: ReadonlyMap<string, string>
): Record<string, number> => {
  const result: Record<string, number> = {};
  const completions = currentData.taskCompletions ?? {};
  for (const task of tasks) {
    if (!completions[task.id]?.complete || completions[task.id]?.failed) continue;
    const skillRewards = task.finishRewards?.skillLevelReward ?? [];
    for (const reward of skillRewards) {
      const skillKey = getCanonicalSkillKey(reward?.name, reward?.skill?.id);
      if (!skillKey) continue;
      result[skillKey] = (result[skillKey] ?? 0) + (reward.level ?? 0);
    }
  }
  const offsets = currentData.skillOffsets ?? {};
  const collapsedOffsets = collapseSkillOffsets(offsets, (skillName) =>
    resolveSkillKey(skillName, skillKeyAliases)
  );
  collapsedOffsets.forEach((entry, skillKey) => {
    result[skillKey] = (result[skillKey] ?? 0) + entry.offset;
  });
  return result;
};
const enforceHideoutPrereqs = (store: TarkovStoreInstance): string[] => {
  const metadataStore = useMetadataStore();
  const stations = metadataStore.hideoutStations;
  if (!stations.length) return [];
  const preferencesStore = usePreferencesStore();
  const requireStationLevels = preferencesStore.getHideoutRequireStationLevels;
  const requireSkillLevels = preferencesStore.getHideoutRequireSkillLevels;
  const requireTraderLoyalty = preferencesStore.getHideoutRequireTraderLoyalty;
  if (!requireStationLevels && !requireSkillLevels && !requireTraderLoyalty) return [];
  const currentData = store.currentGameMode === GAME_MODES.PVE ? store.pve : store.pvp;
  const modulesState = currentData.hideoutModules ?? {};
  const completedModuleIds = new Set<string>();
  for (const [moduleId, state] of Object.entries(modulesState)) {
    if (state?.complete) {
      completedModuleIds.add(moduleId);
    }
  }
  if (!completedModuleIds.size) return [];
  const modules = buildHideoutModuleMeta(stations);
  if (!modules.length) return [];
  const edition = metadataStore.editions.find((entry) => entry.value === store.gameEdition);
  const skillKeyAliases = buildSkillKeyAliases(metadataStore.tasks);
  const validModules = resolveValidHideoutModules(modules, stations, completedModuleIds, edition, {
    requireStationLevels,
    requireSkillLevels,
    requireTraderLoyalty,
    skills: computeTotalSkills(currentData, metadataStore.tasks, skillKeyAliases),
    skillKeyAliases,
    traders: currentData.traders ?? {},
  });
  const removedModules = new Set<string>();
  for (const moduleId of completedModuleIds) {
    if (!validModules.has(moduleId)) {
      removedModules.add(moduleId);
    }
  }
  if (!removedModules.size) return [];
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const itemIdsToReset = new Set<string>();
  for (const moduleId of removedModules) {
    actions.setHideoutModuleUncomplete.call(store, moduleId);
    const module = modulesById.get(moduleId);
    if (!module?.itemRequirementIds?.length) continue;
    for (const itemId of module.itemRequirementIds) {
      itemIdsToReset.add(itemId);
    }
  }
  if (itemIdsToReset.size) {
    store.$patch((state) => {
      const currentData = state.currentGameMode === GAME_MODES.PVE ? state.pve : state.pvp;
      if (!currentData.hideoutParts || typeof currentData.hideoutParts !== 'object') {
        currentData.hideoutParts = {};
      }
      const hideoutParts = currentData.hideoutParts as Record<string, Record<string, unknown>>;
      for (const itemId of itemIdsToReset) {
        const existing = hideoutParts[itemId];
        hideoutParts[itemId] = {
          ...(existing && typeof existing === 'object' ? existing : {}),
          complete: false,
        };
      }
    });
  }
  return Array.from(removedModules);
};
type ResetMode = 'pvp' | 'pve' | 'all';
const executeWithSyncPause = async <T>(operation: () => Promise<T>): Promise<T> => {
  const controller = getSyncController();
  controller?.pause();
  try {
    const result = await operation();
    await delay(RESET_SETTLE_DELAY_MS);
    controller?.resume();
    return result;
  } catch (error) {
    logger.error('[TarkovStore] Reset operation failed:', error);
    getSyncController()?.resume();
    throw error;
  }
};
const performReset = async (
  mode: ResetMode,
  store: { $patch: (fn: (state: UserState) => void) => void }
): Promise<void> => {
  const { $supabase } = useNuxtApp();
  const freshState = structuredClone(defaultState);
  if ($supabase.user.loggedIn && $supabase.user.id) {
    const payload =
      mode === 'all'
        ? buildUpsertPayload($supabase.user.id, freshState)
        : mode === 'pvp'
          ? { user_id: $supabase.user.id, pvp_data: freshState.pvp }
          : { user_id: $supabase.user.id, pve_data: freshState.pve };
    const { error } = await $supabase.client.from('user_progress').upsert(payload);
    if (error) {
      throw new Error(`Failed to reset remote progress: ${error.message}`);
    }
  }
  if (mode === 'all') {
    localStorage.clear();
  } else {
    localStorage.removeItem(STORAGE_KEYS.progress);
  }
  store.$patch((state) => {
    if (mode === 'all' || mode === 'pvp') state.pvp = freshState.pvp;
    if (mode === 'all' || mode === 'pve') state.pve = freshState.pve;
    if (mode === 'all') {
      state.currentGameMode = freshState.currentGameMode;
      state.gameEdition = freshState.gameEdition;
      state.tarkovUid = freshState.tarkovUid;
    }
  });
};
// ============================================================================
// Store Definition
// ============================================================================
const tarkovGetters = {
  ...getters,
  // Removed side-effect causing getters. Migration should be handled in actions or initialization.
} satisfies _GettersTree<UserState>;
// Create typed actions object with the additional store-specific actions
const tarkovActions = {
  ...(actions as UserActions),
  setHideoutModuleUncomplete(this: TarkovStoreInstance, hideoutId: string) {
    actions.setHideoutModuleUncomplete.call(this, hideoutId);
    const removedModules = enforceHideoutPrereqs(this);
    notifyHideoutPrereqEnforcement(removedModules.length);
  },
  setSkillLevel(this: TarkovStoreInstance, skillName: string, level: number) {
    actions.setSkillLevel.call(this, skillName, level);
    const removedModules = enforceHideoutPrereqs(this);
    notifyHideoutPrereqEnforcement(removedModules.length);
  },
  setTraderLevel(this: TarkovStoreInstance, traderId: string, level: number) {
    actions.setTraderLevel.call(this, traderId, level);
    const removedModules = enforceHideoutPrereqs(this);
    notifyHideoutPrereqEnforcement(removedModules.length);
  },
  setTasksAndObjectivesUncompleted(
    this: TarkovStoreInstance,
    taskIds: string[],
    objectiveIds: string[]
  ) {
    const validTaskIds = taskIds
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim());
    const validObjectiveIds = objectiveIds
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim());
    if (!validTaskIds.length && !validObjectiveIds.length) return;
    for (const taskId of validTaskIds) {
      actions.setTaskUncompleted.call(this, taskId);
    }
    for (const objectiveId of validObjectiveIds) {
      actions.setTaskObjectiveUncomplete.call(this, objectiveId);
    }
  },
  enforceHideoutPrereqsNow(this: TarkovStoreInstance) {
    const removedModules = enforceHideoutPrereqs(this);
    notifyHideoutPrereqEnforcement(removedModules.length);
    return removedModules.length;
  },
  async switchGameMode(this: TarkovStoreInstance, mode: GameMode) {
    actions.switchGameMode.call(this, mode);
    const { $supabase } = useNuxtApp();
    if ($supabase.user.loggedIn && $supabase.user.id) {
      try {
        const completeState = {
          user_id: $supabase.user.id,
          current_game_mode: mode,
          game_edition: this.gameEdition,
          tarkov_uid: this.tarkovUid ?? null,
          pvp_data: this.pvp,
          pve_data: this.pve,
        };
        recordLocalSyncTime(); // Track for self-origin filtering
        await $supabase.client.from('user_progress').upsert(completeState);
      } catch (error) {
        logger.error('Error syncing gamemode to backend:', error);
      }
    }
  },
  async migrateDataIfNeeded(this: TarkovStoreInstance) {
    const needsMigration =
      !this.currentGameMode ||
      !this.pvp ||
      !this.pve ||
      ((this as unknown as Record<string, unknown>).level !== undefined && !this.pvp?.level);
    const taskCompletionMigration = this.migrateTaskCompletionSchema();
    const hasTaskCompletionMigration =
      taskCompletionMigration.pvpMigrated > 0 || taskCompletionMigration.pveMigrated > 0;
    if (needsMigration) {
      logger.debug('Migrating legacy data structure to gamemode-aware structure');
      const migratedData = migrateToGameModeStructure(cloneStateSnapshot(this.$state));
      this.$patch(migratedData);
      this.migrateTaskCompletionSchema();
      const { $supabase } = useNuxtApp();
      if ($supabase.user.loggedIn && $supabase.user.id) {
        try {
          recordLocalSyncTime(); // Track for self-origin filtering
          await $supabase.client.from('user_progress').upsert({
            user_id: $supabase.user.id,
            current_game_mode: this.currentGameMode,
            game_edition: this.gameEdition,
            tarkov_uid: this.tarkovUid ?? null,
            pvp_data: this.pvp,
            pve_data: this.pve,
          });
        } catch (error) {
          logger.error('Error saving migrated data to Supabase:', error);
        }
      }
    } else if (hasTaskCompletionMigration) {
      const { $supabase } = useNuxtApp();
      if ($supabase.user.loggedIn && $supabase.user.id) {
        try {
          recordLocalSyncTime();
          await $supabase.client.from('user_progress').upsert({
            user_id: $supabase.user.id,
            current_game_mode: this.currentGameMode,
            game_edition: this.gameEdition,
            tarkov_uid: this.tarkovUid ?? null,
            pvp_data: this.pvp,
            pve_data: this.pve,
          });
        } catch (error) {
          logger.error('Error saving task completion migration to Supabase:', error);
        }
      }
    }
  },
  migrateTaskCompletionSchema(this: TarkovStoreInstance) {
    const pvpMigrated = normalizeTaskCompletionsMap(this.pvp?.taskCompletions);
    const pveMigrated = normalizeTaskCompletionsMap(this.pve?.taskCompletions);
    if (pvpMigrated > 0 || pveMigrated > 0) {
      logger.debug(
        `[TarkovStore] Migrated legacy task completion schema - PvP: ${pvpMigrated}, PvE: ${pveMigrated}`
      );
    }
    return { pvpMigrated, pveMigrated };
  },
  async resetOnlineProfile(this: TarkovStoreInstance) {
    const { $supabase } = useNuxtApp();
    if (!$supabase.user.loggedIn || !$supabase.user.id) {
      logger.error('User not logged in. Cannot reset online profile.');
      return;
    }
    try {
      const freshState = structuredClone(defaultState);
      await $supabase.client
        .from('user_progress')
        .upsert(buildUpsertPayload($supabase.user.id, freshState));
      localStorage.clear();
      this.$patch((state) => {
        state.currentGameMode = freshState.currentGameMode;
        state.gameEdition = freshState.gameEdition;
        state.tarkovUid = freshState.tarkovUid;
        state.pvp = freshState.pvp;
        state.pve = freshState.pve;
      });
    } catch (error) {
      logger.error('Error resetting online profile:', error);
    }
  },
  async resetCurrentGameModeData(this: TarkovStoreInstance) {
    const tarkovStore = useTarkovStore();
    const currentMode = tarkovStore.getCurrentGameMode();
    if (currentMode === GAME_MODES.PVP) {
      // Use the actions object directly to avoid type issues
      await tarkovActions.resetPvPData.call(this);
    } else {
      // Use the actions object directly to avoid type issues
      await tarkovActions.resetPvEData.call(this);
    }
  },
  async resetPvPData(this: TarkovStoreInstance) {
    logger.debug('[TarkovStore] Resetting PvP data...');
    await executeWithSyncPause(() => performReset('pvp', this));
    logger.debug('[TarkovStore] PvP data reset complete');
  },
  async resetPvEData(this: TarkovStoreInstance) {
    logger.debug('[TarkovStore] Resetting PvE data...');
    await executeWithSyncPause(() => performReset('pve', this));
    logger.debug('[TarkovStore] PvE data reset complete');
  },
  async resetAllData(this: TarkovStoreInstance) {
    logger.debug('[TarkovStore] Resetting all data (both PvP and PvE)...');
    await executeWithSyncPause(() => performReset('all', this));
    logger.debug('[TarkovStore] All data reset complete');
  },
  /**
   * Repair failed task states for existing users.
   * Re-applies legitimate branch failures and clears stale failed flags.
   */
  repairFailedTaskStates(this: TarkovStoreInstance) {
    const metadataStore = useMetadataStore();
    const tasks = metadataStore.tasks;
    if (!tasks || tasks.length === 0) {
      logger.debug('[TarkovStore] No tasks available for repair, skipping');
      return { pvpRepaired: 0, pveRepaired: 0 };
    }
    // Create a map for O(1) task lookup
    const tasksMap = new Map<string, Task>();
    tasks.forEach((task) => tasksMap.set(task.id, task));
    const clearFailedTaskObjectives = (
      gameModeData: UserProgressData,
      tasksLookup: Map<string, Task>
    ) => {
      if (!gameModeData.taskObjectives) return 0;
      let clearedTasks = 0;
      const completions = gameModeData.taskCompletions ?? {};
      for (const [taskId, completion] of Object.entries(completions)) {
        if (!completion?.failed) continue;
        const task = tasksLookup.get(taskId);
        if (!task?.objectives?.length) continue;
        let cleared = false;
        for (const obj of task.objectives) {
          if (!obj?.id) continue;
          const existing = gameModeData.taskObjectives[obj.id];
          if (!existing) continue;
          if (existing.complete || (existing.count ?? 0) > 0) {
            existing.complete = false;
            if (existing.count !== undefined || (obj.count ?? 0) > 0) {
              existing.count = 0;
            }
            cleared = true;
          }
        }
        if (cleared) {
          clearedTasks += 1;
        }
      }
      return clearedTasks;
    };
    let pvpRepaired = 0;
    let pveRepaired = 0;
    let pvpCleared = 0;
    let pveCleared = 0;
    // Repair PvP data
    if (this.pvp?.taskCompletions) {
      pvpRepaired = this.repairGameModeFailedTasks(this.pvp, tasksMap);
      pvpCleared = clearFailedTaskObjectives(this.pvp, tasksMap);
    }
    // Repair PvE data
    if (this.pve?.taskCompletions) {
      pveRepaired = this.repairGameModeFailedTasks(this.pve, tasksMap);
      pveCleared = clearFailedTaskObjectives(this.pve, tasksMap);
    }
    if (pvpRepaired > 0 || pveRepaired > 0) {
      logger.debug(
        `[TarkovStore] Repaired task failed flags - PvP: ${pvpRepaired}, PvE: ${pveRepaired}`
      );
    }
    if (pvpCleared > 0 || pveCleared > 0) {
      logger.debug(
        `[TarkovStore] Cleared objectives for failed tasks - PvP: ${pvpCleared}, PvE: ${pveCleared}`
      );
    }
    return { pvpRepaired, pveRepaired };
  },
  /**
   * Repair objective states for completed tasks.
   * Ensures that any completed task has all its objectives marked complete.
   */
  repairCompletedTaskObjectives(this: TarkovStoreInstance) {
    const metadataStore = useMetadataStore();
    const tasks = metadataStore.tasks;
    if (!tasks || tasks.length === 0) {
      logger.debug('[TarkovStore] No tasks available for objective repair, skipping');
      return { pvpRepaired: 0, pveRepaired: 0 };
    }
    const tasksMap = new Map<string, Task>();
    tasks.forEach((task) => tasksMap.set(task.id, task));
    let pvpRepaired = 0;
    let pveRepaired = 0;
    if (this.pvp?.taskCompletions) {
      pvpRepaired = this.repairGameModeCompletedObjectives(this.pvp, tasksMap);
    }
    if (this.pve?.taskCompletions) {
      pveRepaired = this.repairGameModeCompletedObjectives(this.pve, tasksMap);
    }
    if (pvpRepaired > 0 || pveRepaired > 0) {
      logger.debug(
        `[TarkovStore] Repaired completed task objectives - PvP: ${pvpRepaired}, PvE: ${pveRepaired}`
      );
    }
    return { pvpRepaired, pveRepaired };
  },
  /**
   * Helper to repair objectives for completed tasks in a specific game mode.
   */
  repairGameModeCompletedObjectives(
    this: TarkovStoreInstance,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number {
    let repairedCount = 0;
    const completions = gameModeData.taskCompletions ?? {};
    if (!gameModeData.taskObjectives) {
      gameModeData.taskObjectives = {};
    }
    for (const [taskId, completion] of Object.entries(completions)) {
      if (!completion?.complete || completion?.failed) continue;
      const task = tasksMap.get(taskId);
      if (!task?.objectives?.length) continue;
      for (const objective of task.objectives) {
        if (!objective?.id) continue;
        const existing = gameModeData.taskObjectives[objective.id] ?? {};
        let changed = false;
        if (existing.complete !== true) {
          existing.complete = true;
          changed = true;
        }
        if (objective.count !== undefined && objective.count > 0) {
          const requiredCount = objective.count;
          const existingCount = existing.count ?? 0;
          if (existingCount < requiredCount) {
            existing.count = requiredCount;
            changed = true;
          }
        }
        if (changed) {
          if (!existing.timestamp) {
            existing.timestamp = completion.timestamp ?? Date.now();
          }
          gameModeData.taskObjectives[objective.id] = existing;
          repairedCount += 1;
        }
      }
    }
    return repairedCount;
  },
  /**
   * Helper to repair failed tasks for a specific game mode's data.
   */
  repairGameModeFailedTasks(
    this: TarkovStoreInstance,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number {
    let repairedCount = 0;
    const completions = gameModeData.taskCompletions ?? {};
    if (!gameModeData.taskCompletions) {
      gameModeData.taskCompletions = completions;
    }
    const processedPairs = new Set<string>();
    const normalizeStatuses = (statuses?: string[]) =>
      (statuses ?? []).map((status) => status.toLowerCase());
    const hasAnyStatus = (statuses: string[], values: string[]) =>
      values.some((value) => statuses.includes(value));
    const hasCompleteStatus = (statuses?: string[]) =>
      hasAnyStatus(normalizeStatuses(statuses), ['complete', 'completed']);
    const shouldFailWhenOtherCompleted = (task: Task | undefined, otherTaskId: string) => {
      if (!task) return false;
      return (task.failConditions ?? []).some(
        (objective) => objective?.task?.id === otherTaskId && hasCompleteStatus(objective.status)
      );
    };
    // First, enforce branch-failure consistency for completed alternatives.
    for (const [taskId, completion] of Object.entries(completions)) {
      if (!completion?.complete || completion?.failed) continue;
      const task = tasksMap.get(taskId);
      if (!task?.alternatives?.length) continue;
      for (const altTaskId of task.alternatives) {
        const pairKey = [taskId, altTaskId].sort().join('|');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);
        const altCompletion = completions[altTaskId];
        if (altCompletion?.failed) continue;
        if (!altCompletion?.complete) {
          repairedCount += this.markTaskAsFailed(altTaskId, gameModeData, tasksMap);
          continue;
        }
        const altTask = tasksMap.get(altTaskId);
        const shouldFailAlt = shouldFailWhenOtherCompleted(altTask, taskId);
        const shouldFailTask = shouldFailWhenOtherCompleted(task, altTaskId);
        if (!shouldFailAlt || !shouldFailTask) {
          continue;
        }
        const taskTimestamp = completion.timestamp ?? 0;
        const altTimestamp = altCompletion.timestamp ?? 0;
        if (taskTimestamp === altTimestamp) {
          const deterministicFail = taskId > altTaskId ? taskId : altTaskId;
          logger.warn(
            `[TarkovStore] Both "${taskId}" and alternative "${altTaskId}" are complete ` +
              `${taskTimestamp === 0 ? 'with no timestamps' : 'with identical timestamps'} - ` +
              `applying deterministic fallback (failing "${deterministicFail}").`
          );
          repairedCount += this.markTaskAsFailed(deterministicFail, gameModeData, tasksMap);
          continue;
        }
        if (taskTimestamp > altTimestamp) {
          repairedCount += this.markTaskAsFailed(altTaskId, gameModeData, tasksMap);
        } else {
          repairedCount += this.markTaskAsFailed(taskId, gameModeData, tasksMap);
        }
      }
    }
    // Then clear stale failed flags that no longer have a valid cause.
    const isTaskSuccessful = (taskId: string) => {
      const completion = completions[taskId];
      return completion?.complete === true && completion?.failed !== true;
    };
    const alternativeSourcesByTask = new Map<string, string[]>();
    for (const [taskId, task] of tasksMap.entries()) {
      (task.alternatives ?? []).forEach((alternativeId) => {
        if (!alternativeSourcesByTask.has(alternativeId)) {
          alternativeSourcesByTask.set(alternativeId, []);
        }
        alternativeSourcesByTask.get(alternativeId)!.push(taskId);
      });
    }
    const wasCompletedBeforeTrigger = (
      task: Task | undefined,
      taskTimestamp: number | undefined,
      triggerTaskId: string,
      taskWasCompleted?: boolean
    ) => {
      if (shouldFailWhenOtherCompleted(tasksMap.get(triggerTaskId), task?.id ?? '')) return false;
      const ts = taskTimestamp ?? 0;
      const triggerTs = completions[triggerTaskId]?.timestamp ?? 0;
      if (ts > 0 && triggerTs > 0) return ts < triggerTs;
      if (taskWasCompleted) return true;
      return false;
    };
    const shouldRemainFailed = (
      task: Task | undefined,
      completion:
        | { complete?: boolean; failed?: boolean; manual?: boolean; timestamp?: number }
        | undefined
    ) => {
      if (completion?.manual === true) return true;
      if (!task) return true;
      if (MANUAL_FAIL_TASK_IDS.includes(task.id)) return true;
      if (
        (task.failConditions ?? []).some(
          (objective) =>
            objective?.task?.id &&
            hasCompleteStatus(objective.status) &&
            isTaskSuccessful(objective.task.id) &&
            !wasCompletedBeforeTrigger(
              task,
              completion?.timestamp,
              objective.task.id,
              completion?.complete === true
            )
        )
      ) {
        return true;
      }
      const alternativeSources = alternativeSourcesByTask.get(task.id) ?? [];
      const failedByAlternative = alternativeSources.some(
        (sourceId) =>
          isTaskSuccessful(sourceId) &&
          !wasCompletedBeforeTrigger(
            task,
            completion?.timestamp,
            sourceId,
            completion?.complete === true
          )
      );
      if (failedByAlternative) {
        return true;
      }
      return false;
    };
    for (const [taskId, completion] of Object.entries(completions)) {
      if (!completion?.failed) continue;
      const task = tasksMap.get(taskId);
      const remainsFailed = shouldRemainFailed(task, completion);
      if (remainsFailed) continue;
      const alternativeSources = alternativeSourcesByTask.get(taskId) ?? [];
      const successfulAlternativeSources = alternativeSources.filter((sourceId) =>
        isTaskSuccessful(sourceId)
      );
      const failConditionMatches =
        task?.failConditions
          ?.filter(
            (objective) =>
              objective?.task?.id &&
              hasCompleteStatus(objective.status) &&
              isTaskSuccessful(objective.task.id)
          )
          .map((objective) => objective?.task?.id)
          .filter((sourceId): sourceId is string => typeof sourceId === 'string') ?? [];
      const manualFailTask = task ? MANUAL_FAIL_TASK_IDS.includes(task.id) : false;
      logger.debug(
        `[TarkovStore] Clearing stale failed flag for "${taskId}" via markTaskAsUncompleted ` +
          '(shouldRemainFailed=false: no manual/sticky fail condition is active).',
        {
          taskId,
          shouldRemainFailed: remainsFailed,
          reason: 'no manual fail, no matched failConditions, no successful alternative source',
          manualFlag: completion.manual === true,
          manualFailTaskIdsIncludesTask: manualFailTask,
          alternativeSourcesByTask: alternativeSources,
          successfulAlternativeSources,
          failConditionMatches,
        }
      );
      repairedCount += this.markTaskAsUncompleted(taskId, gameModeData, tasksMap);
    }
    return repairedCount;
  },
  markTaskAsUncompleted(
    this: TarkovStoreInstance,
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number {
    const completions = gameModeData.taskCompletions ?? {};
    if (!gameModeData.taskCompletions) {
      gameModeData.taskCompletions = completions;
    }
    if (!completions[taskId]) {
      completions[taskId] = {};
    }
    const now = Date.now();
    completions[taskId]!.complete = false;
    completions[taskId]!.failed = false;
    completions[taskId]!.manual = false;
    completions[taskId]!.timestamp = now;
    const task = tasksMap.get(taskId);
    if (task?.objectives) {
      if (!gameModeData.taskObjectives) {
        gameModeData.taskObjectives = {};
      }
      for (const obj of task.objectives) {
        if (!obj?.id) continue;
        const existing = gameModeData.taskObjectives[obj.id] ?? {};
        existing.complete = false;
        if (existing.count !== undefined || (obj.count ?? 0) > 0) {
          existing.count = 0;
        }
        existing.timestamp = now;
        gameModeData.taskObjectives[obj.id] = existing;
      }
    }
    return 1;
  },
  /**
   * Helper to mark a single task as failed and complete its objectives
   */
  markTaskAsFailed(
    this: TarkovStoreInstance,
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number {
    const completions = gameModeData.taskCompletions ?? {};
    if (!gameModeData.taskCompletions) {
      gameModeData.taskCompletions = completions;
    }
    if (!completions[taskId]) {
      completions[taskId] = {};
    }
    completions[taskId]!.complete = true;
    completions[taskId]!.failed = true;
    if (completions[taskId]!.manual !== true) {
      completions[taskId]!.manual = false;
    }
    completions[taskId]!.timestamp = completions[taskId]!.timestamp ?? Date.now();
    // Clear the task's objectives when failed
    const task = tasksMap.get(taskId);
    if (task?.objectives) {
      if (!gameModeData.taskObjectives) {
        gameModeData.taskObjectives = {};
      }
      for (const obj of task.objectives) {
        if (!obj?.id) continue;
        const existing = gameModeData.taskObjectives[obj.id] ?? {};
        existing.complete = false;
        if (existing.count !== undefined || (obj.count ?? 0) > 0) {
          existing.count = 0;
        }
        gameModeData.taskObjectives[obj.id] = existing;
      }
    }
    return 1;
  },
} satisfies UserActions & {
  switchGameMode(mode: GameMode): Promise<void>;
  migrateDataIfNeeded(): Promise<void>;
  migrateTaskCompletionSchema(): { pvpMigrated: number; pveMigrated: number };
  resetOnlineProfile(): Promise<void>;
  resetCurrentGameModeData(): Promise<void>;
  resetPvPData(): Promise<void>;
  resetPvEData(): Promise<void>;
  resetAllData(): Promise<void>;
  repairFailedTaskStates(): { pvpRepaired: number; pveRepaired: number };
  repairCompletedTaskObjectives(): { pvpRepaired: number; pveRepaired: number };
  repairGameModeFailedTasks(gameModeData: UserProgressData, tasksMap: Map<string, Task>): number;
  repairGameModeCompletedObjectives(
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
  markTaskAsUncompleted(
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
  setTasksAndObjectivesUncompleted(taskIds: string[], objectiveIds: string[]): void;
  enforceHideoutPrereqsNow(): number;
  markTaskAsFailed(
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
};
// Export type for external usage
export type TarkovStoreActions = typeof tarkovActions;
export const useTarkovStore = defineStore('swapTarkov', {
  state: () => structuredClone(defaultState),
  getters: tarkovGetters,
  actions: tarkovActions,
  // Enable automatic localStorage persistence with user scoping
  persist: {
    key: STORAGE_KEYS.progress, // LocalStorage key for user progress data
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    // Add userId to serialized data to prevent cross-user contamination
    serializer: {
      serialize: (state: StateTree) => {
        // Get current user ID (may be null if not logged in)
        let currentUserId: string | null = null;
        try {
          const nuxtApp = useNuxtApp();
          currentUserId = nuxtApp.$supabase?.user?.id || null;
        } catch {
          // Nuxt app may not be available during SSR serialize
        }
        // Wrap state with userId for validation on restore
        const wrappedState = {
          _userId: currentUserId,
          _timestamp: Date.now(),
          data: state,
        };
        const serialized = JSON.stringify(wrappedState);
        // QUOTA MANAGEMENT: Check if localStorage has enough space
        // Throttled to avoid performance impact - only check every 60 seconds
        const now = Date.now();
        const shouldCheckQuota = now - lastQuotaCheckTime > QUOTA_CHECK_INTERVAL_MS;
        if (shouldCheckQuota && typeof window !== 'undefined') {
          lastQuotaCheckTime = now;
          try {
            // Estimate current localStorage usage
            let currentUsage = 0;
            for (const key in localStorage) {
              if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
                currentUsage += localStorage[key].length + key.length;
              }
            }
            const neededSpace = serialized.length;
            const estimatedQuota = ESTIMATED_QUOTA_BYTES;
            const safetyBuffer = QUOTA_SAFETY_BUFFER_BYTES;
            // If we're close to quota, clean up old backups
            if (currentUsage + neededSpace > estimatedQuota - safetyBuffer) {
              logger.warn('[TarkovStore] localStorage quota low, cleaning up old backups', {
                currentUsage: Math.round(currentUsage / 1024) + 'KB',
                needed: Math.round(neededSpace / 1024) + 'KB',
                quota: Math.round(estimatedQuota / 1024) + 'KB',
              });
              // Get all backup keys sorted by timestamp (oldest first)
              const backupKeys = Object.keys(localStorage)
                .filter((k) => k.startsWith(STORAGE_KEYS.progressBackupPrefix))
                .sort((a, b) => {
                  // Extract timestamp from key (format: prefix_userId_timestamp or prefix_isoString)
                  const extractTimestamp = (key: string): number => {
                    const suffix = key.substring(STORAGE_KEYS.progressBackupPrefix.length);
                    // Try parsing as ISO string first
                    const isoDate = Date.parse(suffix);
                    if (!isNaN(isoDate)) return isoDate;
                    // Try extracting numeric timestamp from userId_timestamp format
                    const parts = suffix.split('_');
                    const lastPart = parts[parts.length - 1] ?? '';
                    const numericTimestamp = parseInt(lastPart, 10);
                    return isNaN(numericTimestamp) ? 0 : numericTimestamp;
                  };
                  return extractTimestamp(a) - extractTimestamp(b);
                });
              // Remove old backups until we have enough space
              let removedCount = 0;
              for (const key of backupKeys) {
                if (currentUsage + neededSpace <= estimatedQuota - safetyBuffer) break;
                const keySize = localStorage[key].length + key.length;
                localStorage.removeItem(key);
                currentUsage -= keySize;
                removedCount++;
                logger.debug(`[TarkovStore] Removed old backup: ${key}`);
              }
              if (removedCount > 0) {
                logger.info(`[TarkovStore] Cleaned up ${removedCount} old backups to free space`);
              }
            }
          } catch (quotaError) {
            logger.error('[TarkovStore] Error managing localStorage quota:', quotaError);
            // If we can't manage quota, try to at least warn the user
            // The persist plugin will handle the actual save error
          }
        }
        return serialized;
      },
      deserialize: (value: string) => {
        try {
          const parsed = JSON.parse(value);
          // Old format without wrapper (migrate)
          if (!parsed._userId && !parsed.data) {
            if (import.meta.dev) logger.debug('[TarkovStore] Migrating old localStorage format');
            return parsed as UserState;
          }
          // New format with wrapper - validate userId
          const storedUserId = parsed._userId;
          let currentUserId: string | null = null;
          try {
            const nuxtApp = useNuxtApp();
            currentUserId = nuxtApp.$supabase?.user?.id || null;
          } catch {
            // Nuxt app not available, allow restore for unauthenticated users
            if (!storedUserId) {
              return parsed.data as UserState;
            }
          }
          // If user is logged in and stored userId doesn't match, return default state
          if (currentUserId && storedUserId && storedUserId !== currentUserId) {
            logger.warn(
              `[TarkovStore] localStorage userId mismatch! ` +
                `Stored: ${storedUserId}, Current: ${currentUserId}. ` +
                `Backing up and clearing localStorage to prevent data corruption.`
            );
            // Backup the corrupted/mismatching localStorage
            if (typeof window !== 'undefined') {
              try {
                const backupKey = `${STORAGE_KEYS.progressBackupPrefix}${storedUserId}_${Date.now()}`;
                localStorage.setItem(backupKey, value);
                if (import.meta.dev) logger.debug(`[TarkovStore] Data backed up to ${backupKey}`);
                localStorage.removeItem(STORAGE_KEYS.progress);
              } catch (e) {
                logger.error('[TarkovStore] Error backing up/clearing localStorage:', e);
              }
            }
            return structuredClone(defaultState);
          }
          // UserId matches or user not logged in - safe to restore
          return parsed.data as UserState;
        } catch (e) {
          logger.error('[TarkovStore] Error deserializing localStorage:', e);
          return structuredClone(defaultState);
        }
      },
    },
  },
});
// Export type for future typing
export type TarkovStore = ReturnType<typeof useTarkovStore>;
// Store reference to sync controller for pause/resume during resets
let syncController: ReturnType<typeof useSupabaseSync> | null = null;
let syncUserId: string | null = null;
let pendingSyncWatchStop: (() => void) | null = null;
let hasShownLocalIgnoreToast = false;
export function getSyncController() {
  return syncController;
}
export function resetTarkovSync(reason?: string) {
  if (syncController) {
    logger.debug(`[TarkovStore] Clearing Supabase sync${reason ? ` (${reason})` : ''}`);
    syncController.cleanup();
    syncController = null;
  }
  if (pendingSyncWatchStop) {
    pendingSyncWatchStop();
    pendingSyncWatchStop = null;
  }
  cleanupRealtimeListener();
  syncUserId = null;
  hasShownLocalIgnoreToast = false;
}
export async function initializeTarkovSync() {
  const tarkovStore = useTarkovStore();
  const { $supabase } = useNuxtApp();
  if (import.meta.client && $supabase.user.loggedIn) {
    const toastI18n = useToastI18n();
    const currentUserId = $supabase.user.id;
    if (syncController) {
      if (syncUserId === currentUserId) {
        logger.debug('[TarkovStore] Supabase sync already initialized, skipping');
        return;
      }
      logger.warn('[TarkovStore] Supabase sync user changed; resetting');
      resetTarkovSync('user changed');
    }
    logger.debug('[TarkovStore] Setting up Supabase sync and listener');
    const getLocalStorageMeta = () => {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem(STORAGE_KEYS.progress);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as
          | { _userId?: string | null; _timestamp?: number; data?: unknown }
          | Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && 'data' in parsed) {
          return {
            storedUserId: (parsed as { _userId?: string | null })._userId ?? null,
            timestamp:
              typeof (parsed as { _timestamp?: number })._timestamp === 'number'
                ? (parsed as { _timestamp?: number })._timestamp
                : null,
          };
        }
        return { storedUserId: null, timestamp: null };
      } catch {
        return null;
      }
    };
    const notifyLocalIgnored = (reason: 'other_account' | 'unsaved' | 'guest') => {
      if (!import.meta.client || hasShownLocalIgnoreToast) return;
      try {
        toastI18n.showLocalIgnored(reason);
        hasShownLocalIgnoreToast = true;
      } catch (e) {
        logger.warn('[TarkovStore] Could not show toast notification:', e);
      }
    };
    const persistLocalOwnership = (
      userId: string,
      state: UserState,
      timestamp: number | null = null
    ) => {
      if (typeof window === 'undefined') return;
      try {
        localStorage.setItem(
          STORAGE_KEYS.progress,
          JSON.stringify({
            _userId: userId,
            _timestamp: timestamp ?? Date.now(),
            data: cloneStateSnapshot(state),
          })
        );
      } catch (error) {
        logger.warn('[TarkovStore] Could not persist local ownership metadata:', error);
      }
    };
    const resetStoreToDefault = () => {
      const freshState = structuredClone(defaultState);
      tarkovStore.$patch((state) => {
        state.currentGameMode = freshState.currentGameMode;
        state.gameEdition = freshState.gameEdition;
        state.tarkovUid = freshState.tarkovUid;
        state.pvp = freshState.pvp;
        state.pve = freshState.pve;
      });
    };
    const loadData = async (): Promise<{ ok: boolean; hadRemoteData: boolean }> => {
      const localMeta = getLocalStorageMeta();
      const storedUserId = localMeta?.storedUserId ?? null;
      const localTimestamp = localMeta?.timestamp ?? null;
      const hasLocalPersistence = Boolean(localMeta);
      let resolvedLocalState: UserState | null = null;
      if (storedUserId && storedUserId !== currentUserId) {
        logger.warn('[TarkovStore] Local progress belongs to a different user; clearing');
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEYS.progress);
        }
        resetStoreToDefault();
        notifyLocalIgnored('other_account');
      }
      // Get current localStorage state (loaded by persist plugin)
      let localState = tarkovStore.$state;
      let hasLocalProgress = hasProgress(localState);
      if (hasLocalProgress && !hasLocalPersistence) {
        logger.warn('[TarkovStore] Local progress exists in memory without persistence; resetting');
        resetStoreToDefault();
        localState = tarkovStore.$state;
        hasLocalProgress = hasProgress(localState);
        notifyLocalIgnored('unsaved');
      }
      const progressScore = (state: UserState): number => {
        const scoreMode = (mode: UserProgressData | undefined) => {
          if (!mode) return 0;
          return (
            Object.keys(mode.taskCompletions || {}).length +
            Object.keys(mode.taskObjectives || {}).length +
            Object.keys(mode.hideoutModules || {}).length +
            Object.keys(mode.hideoutParts || {}).length +
            (mode.level > 1 ? 1 : 0) +
            (mode.prestigeLevel || 0)
          );
        };
        return scoreMode(state.pvp) + scoreMode(state.pve);
      };
      logger.debug('[TarkovStore] Initial load starting...', {
        userId: $supabase.user.id,
        hasLocalProgress,
      });
      // Try to load from Supabase with retry logic to prevent race conditions
      let data: UserProgressRow | null = null;
      let error: { code?: string; message?: string } | null = null;
      for (let attempt = 0; attempt < LOAD_RETRY_COUNT; attempt++) {
        if (attempt > 0) {
          logger.debug(`[TarkovStore] Retry attempt ${attempt + 1}/${LOAD_RETRY_COUNT}`);
          await delay(LOAD_RETRY_DELAY_MS);
        }
        const result = await $supabase.client
          .from('user_progress')
          .select('*')
          .eq('user_id', $supabase.user.id)
          .single();
        data = result.data as UserProgressRow | null;
        error = result.error as { code?: string; message?: string } | null;
        // Break if we got data or a real error (not "no rows")
        if (data || (error && error.code !== 'PGRST116')) {
          break;
        }
      }
      logger.debug('[TarkovStore] Supabase query result:', {
        hasData: !!data,
        error: error?.code ?? null,
        errorMessage: error?.message ?? null,
      });
      const hadRemoteData = Boolean(data);
      // Handle query errors (but not "no rows" which is expected for new users)
      if (error && error.code !== 'PGRST116') {
        logger.error('[TarkovStore] Error loading data from Supabase:', error);
        return { ok: false, hadRemoteData };
      }
      // Normalize Supabase data with defaults for safety
      const normalizedRemote = data
        ? ({
            currentGameMode: coerceGameMode(data.current_game_mode),
            gameEdition: data.game_edition || defaultState.gameEdition,
            tarkovUid: data.tarkov_uid ?? null,
            pvp: { ...defaultState.pvp, ...(data.pvp_data || {}) },
            pve: { ...defaultState.pve, ...(data.pve_data || {}) },
          } as UserState)
        : null;
      const remoteScore = normalizedRemote ? progressScore(normalizedRemote) : 0;
      const localScore = progressScore(localState);
      if (data) {
        const remoteUpdatedAt = data.updated_at ? Date.parse(data.updated_at) : null;
        const localOwnedByUser = storedUserId === currentUserId;
        if (hasLocalProgress && !localOwnedByUser && storedUserId === null) {
          notifyLocalIgnored('guest');
        }
        let shouldPreferLocal = false;
        if (localOwnedByUser && localTimestamp && remoteUpdatedAt) {
          shouldPreferLocal = localTimestamp > remoteUpdatedAt;
        } else if (localOwnedByUser && localTimestamp && !remoteUpdatedAt) {
          shouldPreferLocal = localScore > remoteScore;
        } else if (localOwnedByUser && !localTimestamp && !remoteUpdatedAt) {
          shouldPreferLocal = localScore > remoteScore;
        }
        // If local has more progress than remote, protect local and push it to Supabase.
        // Skip sync if scores are equal - no need to push identical data.
        if (shouldPreferLocal && localScore !== remoteScore) {
          logger.warn('[TarkovStore] Local progress ahead of Supabase; preserving local data', {
            localScore,
            remoteScore,
          });
          recordLocalSyncTime(); // Track for self-origin filtering
          const { error: upsertError } = await $supabase.client.from('user_progress').upsert({
            user_id: $supabase.user.id,
            current_game_mode: localState.currentGameMode || GAME_MODES.PVP,
            game_edition: localState.gameEdition || defaultState.gameEdition,
            tarkov_uid: localState.tarkovUid ?? null,
            pvp_data: localState.pvp || defaultState.pvp,
            pve_data: localState.pve || defaultState.pve,
          });
          if (upsertError) {
            logger.error('[TarkovStore] Error syncing local progress to Supabase:', upsertError);
            return { ok: false, hadRemoteData };
          }
          resolvedLocalState = localState;
        } else if (shouldPreferLocal && localScore === remoteScore) {
          // Local timestamp is newer but data is identical - no sync needed
          logger.debug('[TarkovStore] Local timestamp newer but data identical; skipping sync');
          resolvedLocalState = localState;
        } else {
          logger.debug('[TarkovStore] Loading data from Supabase (user exists in DB)');
          tarkovStore.$patch((state) => {
            state.currentGameMode = normalizedRemote?.currentGameMode ?? state.currentGameMode;
            state.gameEdition = normalizedRemote?.gameEdition ?? state.gameEdition;
            if (
              normalizedRemote &&
              Object.prototype.hasOwnProperty.call(normalizedRemote, 'tarkovUid')
            ) {
              state.tarkovUid = normalizedRemote.tarkovUid;
            }
            state.pvp = normalizedRemote?.pvp
              ? { ...state.pvp, ...normalizedRemote.pvp }
              : state.pvp;
            state.pve = normalizedRemote?.pve
              ? { ...state.pve, ...normalizedRemote.pve }
              : state.pve;
          });
          resolvedLocalState = normalizedRemote!;
        }
      } else if (hasLocalProgress && hasLocalPersistence) {
        // No Supabase record at all, but localStorage has progress - migrate it
        logger.debug('[TarkovStore] Migrating localStorage data to Supabase');
        const migrateData = {
          user_id: $supabase.user.id,
          current_game_mode: localState.currentGameMode || GAME_MODES.PVP,
          game_edition: localState.gameEdition || defaultState.gameEdition,
          tarkov_uid: localState.tarkovUid ?? null,
          pvp_data: localState.pvp || defaultState.pvp,
          pve_data: localState.pve || defaultState.pve,
        };
        recordLocalSyncTime(); // Track for self-origin filtering
        const { error: upsertError } = await $supabase.client
          .from('user_progress')
          .upsert(migrateData);
        if (upsertError) {
          logger.error('[TarkovStore] Error migrating local data to Supabase:', upsertError);
          return { ok: false, hadRemoteData };
        }
        logger.debug('[TarkovStore] Migration complete');
        resolvedLocalState = localState;
      } else {
        // SAFETY CHECKS: Before treating as "new user", verify this isn't Issue #71 scenario
        // Issue #71: User links a second OAuth provider → race condition → false "no data" → overwrites
        // Check 1: Account age
        const accountCreatedAt = $supabase.user.createdAt;
        const accountAgeMs = accountCreatedAt ? Date.now() - Date.parse(accountCreatedAt) : 0;
        const isRecentlyCreated = accountAgeMs < ISSUE_71_ACCOUNT_AGE_THRESHOLD_MS;
        // Check 2: Multiple OAuth providers - strongest signal of Issue #71
        const linkedProviders = $supabase.user.providers || [];
        const hasMultipleProviders = linkedProviders.length > 1;
        // ONLY block if hasMultipleProviders (Issue #71 scenario)
        // OLD accounts with single provider are legitimate first-time users who waited to log in
        if (hasMultipleProviders) {
          // Multiple providers + no data = Issue #71 race condition
          logger.error(
            '[TarkovStore] SAFETY ABORT: Multi-provider account with no progress data (Issue #71)',
            {
              accountAgeMs,
              isRecentlyCreated,
              linkedProviders,
              hasMultipleProviders,
              userId: $supabase.user.id,
            }
          );
          // Reset to default state but DO NOT sync to Supabase
          // This prevents overwriting potentially existing data
          resetStoreToDefault();
          // Notify user of the issue
          toastI18n.showLoadFailed();
          return { ok: false, hadRemoteData: false };
        }
        // All safety checks passed - truly new user (or old account, first login)
        logger.debug('[TarkovStore] New user - no existing progress found', {
          accountAgeMs,
          linkedProviders,
        });
      }
      if (currentUserId && storedUserId === null && hasLocalPersistence && resolvedLocalState) {
        persistLocalOwnership(currentUserId, resolvedLocalState, localTimestamp);
      }
      logger.debug('[TarkovStore] Initial load complete');
      return { ok: true, hadRemoteData };
    };
    // Wait for data load to complete BEFORE enabling sync
    // This prevents race conditions and overwriting server data with empty local state
    const loadResult = await loadData();
    if (!loadResult.ok) {
      logger.error('[TarkovStore] Initial load failed; sync not started');
      throw new Error('Supabase initial load failed');
    }
    // Repair failed task states for existing users (runs once after data load)
    // This reapplies valid branch failures and clears stale failed flags
    const completionSchemaMigration = tarkovStore.migrateTaskCompletionSchema();
    const failedRepairResult = tarkovStore.repairFailedTaskStates();
    const completedObjectivesRepairResult = tarkovStore.repairCompletedTaskObjectives();
    const hasCompletionSchemaMigration =
      completionSchemaMigration.pvpMigrated > 0 || completionSchemaMigration.pveMigrated > 0;
    const hasRepairChanges =
      failedRepairResult.pvpRepaired > 0 ||
      failedRepairResult.pveRepaired > 0 ||
      completedObjectivesRepairResult.pvpRepaired > 0 ||
      completedObjectivesRepairResult.pveRepaired > 0;
    if (hasCompletionSchemaMigration || hasRepairChanges) {
      try {
        recordLocalSyncTime();
        await $supabase.client.from('user_progress').upsert({
          user_id: $supabase.user.id,
          current_game_mode: tarkovStore.currentGameMode,
          game_edition: tarkovStore.gameEdition,
          tarkov_uid: tarkovStore.tarkovUid ?? null,
          pvp_data: tarkovStore.pvp,
          pve_data: tarkovStore.pve,
        });
      } catch (error) {
        logger.error('[TarkovStore] Failed to persist post-load data migration/repair:', error);
      }
    }
    const startSync = () => {
      if (syncController) return;
      if (pendingSyncWatchStop) {
        pendingSyncWatchStop();
        pendingSyncWatchStop = null;
      }
      syncUserId = currentUserId ?? null;
      syncController = useSupabaseSync({
        store: tarkovStore,
        table: 'user_progress',
        debounceMs: SYNC_DEBOUNCE_MS,
        onSynced: () => {
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel(`tarkov-progress:${$supabase.user.id}`);
            bc.postMessage('updated');
            bc.close();
          }
        },
        transform: (state: unknown) => {
          const userState = state as UserState;
          // SAFETY CHECK: Prevent syncing completely empty state for existing accounts
          // This protects against accidental data overwrites during edge cases
          const stateHasProgress = hasProgress(userState);
          if (!stateHasProgress && loadResult.hadRemoteData) {
            logger.warn(
              '[TarkovStore] Blocking sync of empty state - account had remote data on load'
            );
            return null; // Returning null prevents the sync
          }
          // Track sync time for self-origin filtering in realtime listener
          recordLocalSyncTime();
          return {
            user_id: $supabase.user.id,
            current_game_mode: userState.currentGameMode || GAME_MODES.PVP,
            game_edition:
              typeof userState.gameEdition === 'string'
                ? parseInt(userState.gameEdition)
                : userState.gameEdition,
            tarkov_uid: userState.tarkovUid ?? null,
            pvp_data: userState.pvp || {},
            pve_data: userState.pve || {},
          };
        },
      });
    };
    const shouldStartSyncNow = loadResult.hadRemoteData || hasProgress(tarkovStore.$state);
    if (shouldStartSyncNow) {
      startSync();
    } else {
      logger.debug('[TarkovStore] Delaying sync until progress exists');
      const stopWatch = watch(
        () => tarkovStore.$state,
        (state) => {
          if (hasProgress(state)) {
            startSync();
          }
        },
        { deep: true }
      );
      pendingSyncWatchStop = stopWatch;
    }
    // MULTI-DEVICE CONFLICT RESOLUTION
    // Setup realtime listener for remote changes from other devices
    setupRealtimeListener();
  }
}
// Realtime channel for multi-device sync
let realtimeChannel: unknown = null;
let lastLocalSyncTime = 0; // Track when we last synced locally to filter self-origin updates
const recentLocalSyncTimes: number[] = [];
const recordLocalSyncTime = () => {
  const now = Date.now();
  lastLocalSyncTime = now;
  recentLocalSyncTimes.push(now);
  if (recentLocalSyncTimes.length > RECENT_LOCAL_SYNC_HISTORY_SIZE) {
    recentLocalSyncTimes.shift();
  }
};
const isLikelySelfOriginUpdate = (updateTime: number) => {
  if (!Number.isFinite(updateTime)) return false;
  return recentLocalSyncTimes.some((syncTime) => {
    return Math.abs(updateTime - syncTime) < SELF_ORIGIN_THRESHOLD_MS;
  });
};
const lastApiUpdateIds: { pvp: string | null; pve: string | null } = { pvp: null, pve: null };
const API_TASK_STATES = ['completed', 'failed', 'uncompleted'] as const;
const isApiTaskState = (state: unknown): state is ApiTaskUpdate['state'] => {
  return API_TASK_STATES.includes(state as ApiTaskUpdate['state']);
};
const normalizeApiTaskUpdates = (updates: ApiUpdateMeta['tasks']): ApiTaskUpdate[] => {
  if (!Array.isArray(updates)) return [];
  return updates.filter(
    (update): update is ApiTaskUpdate =>
      Boolean(update) && typeof update.id === 'string' && isApiTaskState(update.state)
  );
};
const formatApiUpdateDescription = (
  updates: ApiTaskUpdate[],
  metadataStore: ReturnType<typeof useMetadataStore>
): string => {
  if (!updates.length) return 'Your progress was updated via API.';
  const previewLimit = 3;
  const label = updates.length === 1 ? 'Task updated' : 'Tasks updated';
  const formatted = updates.slice(0, previewLimit).map((update) => {
    const taskName = metadataStore.getTaskById(update.id)?.name ?? update.id;
    return `${taskName} → ${update.state}`;
  });
  const remaining = updates.length - previewLimit;
  const suffix = remaining > 0 ? `, +${remaining} more` : '';
  return `${label}: ${formatted.join(', ')}${suffix}.`;
};
const getApiUpdateMeta = (data: UserProgressData | undefined): ApiUpdateMeta | null => {
  const meta = data?.lastApiUpdate;
  if (
    !meta ||
    meta.source !== 'api' ||
    typeof meta.id !== 'string' ||
    typeof meta.at !== 'number'
  ) {
    return null;
  }
  return meta;
};
const maybeNotifyApiUpdate = (
  mode: 'pvp' | 'pve',
  data: UserProgressData | undefined,
  metadataStore: ReturnType<typeof useMetadataStore>,
  updateTime: number,
  toast: ReturnType<typeof useToast> | null
): boolean => {
  const meta = getApiUpdateMeta(data);
  if (!meta || lastApiUpdateIds[mode] === meta.id) return false;
  if (Math.abs(updateTime - meta.at) > API_UPDATE_FRESHNESS_MS) return false;
  lastApiUpdateIds[mode] = meta.id;
  toast?.add({
    title: 'Update from API',
    description: formatApiUpdateDescription(normalizeApiTaskUpdates(meta.tasks), metadataStore),
    color: 'primary',
    duration: 6000,
  });
  return true;
};
/**
 * Detect if there are actual data conflicts between local and remote state.
 * A conflict occurs when both local and remote have different values for the same field,
 * not just when remote has new data that local doesn't have.
 * Returns { hasConflict, conflictCount } to determine notification behavior.
 */
function detectDataConflicts(
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined
): { hasConflict: boolean; conflictCount: number } {
  if (!local || !remote) return { hasConflict: false, conflictCount: 0 };
  let conflictCount = 0;
  // Check task completion conflicts (different complete/failed status for same task)
  const localTasks = local.taskCompletions || {};
  const remoteTasks = remote.taskCompletions || {};
  for (const taskId of Object.keys(remoteTasks)) {
    const localTask = localTasks[taskId] as RawTaskCompletion;
    const remoteTask = remoteTasks[taskId] as RawTaskCompletion;
    if (
      localTask !== undefined &&
      localTask !== null &&
      remoteTask !== undefined &&
      remoteTask !== null
    ) {
      const localFlags = getCompletionFlags(localTask);
      const remoteFlags = getCompletionFlags(remoteTask);
      if (
        localFlags.complete !== remoteFlags.complete ||
        localFlags.failed !== remoteFlags.failed
      ) {
        conflictCount++;
      }
    }
    // Remote has task that local doesn't = not a conflict, just new data
  }
  // Check task objective conflicts (different counts for same objective)
  const localObjectives = local.taskObjectives || {};
  const remoteObjectives = remote.taskObjectives || {};
  for (const objId of Object.keys(remoteObjectives)) {
    const localObj = localObjectives[objId];
    const remoteObj = remoteObjectives[objId];
    if (localObj && remoteObj) {
      // Normalize counts to 0 and booleans to false when undefined
      if (
        (localObj.count ?? 0) !== (remoteObj.count ?? 0) ||
        (localObj.complete ?? false) !== (remoteObj.complete ?? false)
      ) {
        conflictCount++;
      }
    }
  }
  // Check hideout module conflicts
  const localModules = local.hideoutModules || {};
  const remoteModules = remote.hideoutModules || {};
  for (const modId of Object.keys(remoteModules)) {
    const localMod = localModules[modId];
    const remoteMod = remoteModules[modId];
    // Normalize booleans to false when undefined
    if (localMod && remoteMod && (localMod.complete ?? false) !== (remoteMod.complete ?? false)) {
      conflictCount++;
    }
  }
  // Check hideout part conflicts
  const localParts = local.hideoutParts || {};
  const remoteParts = remote.hideoutParts || {};
  for (const partId of Object.keys(remoteParts)) {
    const localPart = localParts[partId];
    const remotePart = remoteParts[partId];
    if (localPart && remotePart) {
      // Normalize counts to 0 and booleans to false when undefined
      if (
        (localPart.count ?? 0) !== (remotePart.count ?? 0) ||
        (localPart.complete ?? false) !== (remotePart.complete ?? false)
      ) {
        conflictCount++;
      }
    }
  }
  return { hasConflict: conflictCount > 0, conflictCount };
}
/**
 * Setup realtime listener for user_progress changes from other devices
 * This prevents silent data overwrites when using multiple devices simultaneously
 */
function setupRealtimeListener() {
  const { $supabase } = useNuxtApp();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const toast = useSafeToast();
  if (!$supabase.user.loggedIn || !$supabase.user.id) return;
  // Clean up existing channel if any
  if (realtimeChannel) {
    $supabase.client.removeChannel(
      realtimeChannel as Parameters<typeof $supabase.client.removeChannel>[0]
    );
    realtimeChannel = null;
  }
  logger.debug('[TarkovStore] Setting up realtime listener for multi-device sync');
  realtimeChannel = $supabase.client
    .channel(`user_progress_${$supabase.user.id}`)
    .on(
      'postgres_changes' as const,
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_progress',
        filter: `user_id=eq.${$supabase.user.id}`,
      },
      (payload: { new: unknown; old: unknown }) => {
        const remoteData = payload.new as {
          current_game_mode?: string;
          game_edition?: number;
          tarkov_uid?: number | null;
          pvp_data?: UserProgressData;
          pve_data?: UserProgressData;
          updated_at?: string;
        };
        const parsedUpdateTime = remoteData.updated_at ? Date.parse(remoteData.updated_at) : NaN;
        const updateTime = Number.isNaN(parsedUpdateTime) ? Date.now() : parsedUpdateTime;
        const timeSinceLastSync = updateTime - lastLocalSyncTime;
        // Get current local state
        const localState = tarkovStore.$state;
        // Merge remote changes with local state
        const merged: Partial<UserState> = {
          currentGameMode: remoteData.current_game_mode
            ? coerceGameMode(remoteData.current_game_mode)
            : localState.currentGameMode,
          gameEdition: remoteData.game_edition || localState.gameEdition,
          pvp: mergeProgressData(localState.pvp, remoteData.pvp_data),
          pve: mergeProgressData(localState.pve, remoteData.pve_data),
        };
        const nextState: UserState = {
          currentGameMode: merged.currentGameMode ?? localState.currentGameMode,
          gameEdition: merged.gameEdition ?? localState.gameEdition,
          tarkovUid: Object.prototype.hasOwnProperty.call(remoteData, 'tarkov_uid')
            ? (remoteData.tarkov_uid ?? null)
            : (localState.tarkovUid ?? null),
          pvp: merged.pvp ?? localState.pvp,
          pve: merged.pve ?? localState.pve,
        };
        const stateUnchanged = deepEqual(nextState, localState);
        const isLikelySelfOrigin = isLikelySelfOriginUpdate(updateTime);
        if (isLikelySelfOrigin && stateUnchanged) {
          logger.debug('[TarkovStore] Ignoring realtime update - likely self-origin', {
            timeSinceLastSync,
            threshold: SELF_ORIGIN_THRESHOLD_MS,
          });
          return;
        }
        if (stateUnchanged) {
          logger.debug('[TarkovStore] Realtime update matches local state; skipping patch');
          return;
        }
        // Detect actual data conflicts (not just new data from API/other sources)
        const pvpConflicts = detectDataConflicts(localState.pvp, remoteData.pvp_data);
        const pveConflicts = detectDataConflicts(localState.pve, remoteData.pve_data);
        const hasRealConflict = pvpConflicts.hasConflict || pveConflicts.hasConflict;
        const totalConflicts = pvpConflicts.conflictCount + pveConflicts.conflictCount;
        const apiUpdateHandled =
          maybeNotifyApiUpdate('pvp', remoteData.pvp_data, metadataStore, updateTime, toast) ||
          maybeNotifyApiUpdate('pve', remoteData.pve_data, metadataStore, updateTime, toast);
        logger.debug('[TarkovStore] Remote update detected, applying changes', {
          hasRealConflict,
          totalConflicts,
          isLikelySelfOrigin,
        });
        // Pause local sync to prevent update loop
        const controller = getSyncController();
        if (controller) {
          controller.pause();
        }
        // Apply merged state
        tarkovStore.$patch((state) => {
          state.currentGameMode = nextState.currentGameMode;
          state.gameEdition = nextState.gameEdition;
          state.tarkovUid = nextState.tarkovUid;
          state.pvp = { ...state.pvp, ...nextState.pvp };
          state.pve = { ...state.pve, ...nextState.pve };
        });
        setTimeout(() => {
          const currentController = getSyncController();
          if (currentController && currentController === controller) {
            currentController.resume();
          }
        }, SYNC_RESUME_DELAY_MS);
        // Only notify user if there was an actual data conflict that required merging
        // Silent sync for API updates or other-device updates that don't conflict
        if (hasRealConflict && !apiUpdateHandled && !isLikelySelfOrigin) {
          toast?.add({
            title: 'Progress merged',
            description: `${totalConflicts} conflicting change${totalConflicts > 1 ? 's were' : ' was'} resolved from another source.`,
            color: 'warning',
            duration: 5000,
          });
        }
      }
    )
    .subscribe((status: string) => {
      logger.debug(`[TarkovStore] Realtime subscription status: ${status}`);
    });
}
/**
 * Merge two progress data objects, preserving maximum progress from both
 * Strategy: Prefer latest timestamps for task completions, max values for levels/counts
 */
export function mergeProgressData(
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined
): UserProgressData {
  if (!local && !remote) return {} as UserProgressData;
  if (!local) return remote!;
  if (!remote) return local;
  // Merge task completions with "sticky complete" semantics:
  // - Uses timestamp-based merge as the baseline (newer entry wins)
  // - Treats absence of a `complete` flag (undefined) as "no explicit change"
  // - Once complete=true is set, it persists UNLESS the newer entry explicitly sets complete=false
  // - This prevents progress regression when syncing partial updates that omit the complete flag
  const mergeTaskCompletion = (
    localComp: RawTaskCompletion,
    remoteComp: RawTaskCompletion
  ): { complete?: boolean; failed?: boolean; timestamp?: number; manual?: boolean } | undefined => {
    const normalizedLocal = normalizeTaskCompletionEntry(localComp);
    const normalizedRemote = normalizeTaskCompletionEntry(remoteComp);
    if (!normalizedLocal) return normalizedRemote;
    if (!normalizedRemote) return normalizedLocal;
    const localTs = normalizedLocal.timestamp ?? 0;
    const remoteTs = normalizedRemote.timestamp ?? 0;
    // Start with timestamp-based merge (newer entry takes precedence)
    const base = remoteTs >= localTs ? normalizedRemote : normalizedLocal;
    const other = remoteTs >= localTs ? normalizedLocal : normalizedRemote;
    const merged = { ...other, ...base };
    // Sticky complete: preserve complete=true unless explicitly overridden with complete=false
    // Check if the newer entry (base) explicitly sets complete to false via own property check
    const newerExplicitlySetsFalse =
      Object.prototype.hasOwnProperty.call(base, 'complete') && base.complete === false;
    if ((normalizedLocal.complete || normalizedRemote.complete) && !newerExplicitlySetsFalse) {
      merged.complete = true;
    }
    // Use the latest timestamp from either entry
    merged.timestamp = Math.max(localTs, remoteTs);
    return merged;
  };
  const resolveApiUpdate = (
    localUpdate?: ApiUpdateMeta,
    remoteUpdate?: ApiUpdateMeta
  ): ApiUpdateMeta | undefined => {
    if (!localUpdate) return remoteUpdate;
    if (!remoteUpdate) return localUpdate;
    const localAt = typeof localUpdate.at === 'number' ? localUpdate.at : 0;
    const remoteAt = typeof remoteUpdate.at === 'number' ? remoteUpdate.at : 0;
    return remoteAt >= localAt ? remoteUpdate : localUpdate;
  };
  const resolveTarkovDevProfile = (
    localProfile?: UserProgressData['tarkovDevProfile'],
    remoteProfile?: UserProgressData['tarkovDevProfile']
  ): UserProgressData['tarkovDevProfile'] => {
    if (!localProfile) return remoteProfile;
    if (!remoteProfile) return localProfile;
    const localImportedAt =
      typeof localProfile.importedAt === 'number' ? localProfile.importedAt : 0;
    const remoteImportedAt =
      typeof remoteProfile.importedAt === 'number' ? remoteProfile.importedAt : 0;
    return remoteImportedAt >= localImportedAt ? remoteProfile : localProfile;
  };
  return {
    ...local,
    ...remote,
    level: Math.max(local.level || 1, remote.level || 1),
    prestigeLevel: Math.max(local.prestigeLevel || 0, remote.prestigeLevel || 0),
    displayName: remote.displayName || local.displayName,
    pmcFaction: remote.pmcFaction || local.pmcFaction,
    xpOffset: remote.xpOffset !== undefined ? remote.xpOffset : local.xpOffset,
    lastApiUpdate: resolveApiUpdate(local.lastApiUpdate, remote.lastApiUpdate),
    tarkovDevProfile: resolveTarkovDevProfile(local.tarkovDevProfile, remote.tarkovDevProfile),
    // Merge task completions - preserve completed status to prevent progress regression
    taskCompletions: (() => {
      const allKeys = new Set([
        ...Object.keys(local.taskCompletions || {}),
        ...Object.keys(remote.taskCompletions || {}),
      ]);
      const merged: UserProgressData['taskCompletions'] = {};
      for (const id of allKeys) {
        const resolved = mergeTaskCompletion(
          local.taskCompletions?.[id],
          remote.taskCompletions?.[id]
        );
        if (resolved) {
          merged[id] = resolved;
        }
      }
      return merged;
    })(),
    taskObjectives: mergeCountableObjects(local.taskObjectives, remote.taskObjectives),
    hideoutModules: { ...local.hideoutModules, ...remote.hideoutModules },
    hideoutParts: mergeCountableObjects(local.hideoutParts, remote.hideoutParts),
    storyChapters: mergeStoryChapterProgress(local.storyChapters, remote.storyChapters),
    // Merge traders - max level and reputation
    traders: {
      ...local.traders,
      ...remote.traders,
      ...Object.fromEntries(
        Object.entries({ ...local.traders, ...remote.traders }).map(([traderId, trader]) => {
          const localTrader = local.traders?.[traderId];
          const remoteTrader = remote.traders?.[traderId];
          if (localTrader && remoteTrader) {
            return [
              traderId,
              {
                level: Math.max(localTrader.level || 1, remoteTrader.level || 1),
                reputation: Math.max(localTrader.reputation || 0, remoteTrader.reputation || 0),
              },
            ];
          }
          return [traderId, trader];
        })
      ),
    },
    // Merge skills - max values
    skills: {
      ...local.skills,
      ...remote.skills,
      ...Object.fromEntries(
        Object.entries({ ...local.skills, ...remote.skills }).map(([skillName, skillLevel]) => {
          const localSkill = local.skills?.[skillName];
          const remoteSkill = remote.skills?.[skillName];
          if (localSkill !== undefined && remoteSkill !== undefined) {
            return [skillName, Math.max(localSkill, remoteSkill)];
          }
          return [skillName, skillLevel];
        })
      ),
    },
    // Merge skillOffsets - prefer remote (latest manual adjustment)
    skillOffsets: {
      ...local.skillOffsets,
      ...remote.skillOffsets,
    },
  };
}
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Object.prototype.toString.call(value) === '[object Object]';
};
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
};
/**
 * Cleanup realtime listener on disconnect
 */
function cleanupRealtimeListener() {
  if (realtimeChannel) {
    const { $supabase } = useNuxtApp();
    $supabase.client.removeChannel(
      realtimeChannel as Parameters<typeof $supabase.client.removeChannel>[0]
    );
    realtimeChannel = null;
    logger.debug('[TarkovStore] Cleaned up realtime listener');
  }
}
