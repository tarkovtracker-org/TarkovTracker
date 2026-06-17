import { useToastI18n } from '@/composables/useToastI18n';
import { actions, type UserProgressData, type UserState } from '@/stores/progressState';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { GAME_MODES, SPECIAL_STATIONS } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  buildSkillKeyAliases,
  collapseSkillOffsets,
  getCanonicalSkillKey,
  resolveSkillKey,
} from '@/utils/skillHelpers';
import type { GameEdition, HideoutStation, Task } from '@/types/tarkov';
type TarkovStoreInstance = UserState & {
  $state: UserState;
  $patch(partialOrMutator: Partial<UserState> | ((state: UserState) => void)): void;
};
export type HideoutModuleMeta = {
  id: string;
  stationId: string;
  level: number;
  stationLevelRequirements: HideoutStation['levels'][number]['stationLevelRequirements'];
  skillRequirements: HideoutStation['levels'][number]['skillRequirements'];
  traderRequirements: HideoutStation['levels'][number]['traderRequirements'];
  itemRequirementIds: string[];
};
export const buildHideoutModuleMeta = (stations: HideoutStation[]): HideoutModuleMeta[] => {
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
export const getStationBaseLevel = (station: HideoutStation, edition: GameEdition | undefined) => {
  const maxLevel = station.levels?.length ?? 0;
  if (station.normalizedName === SPECIAL_STATIONS.STASH) {
    return Math.min(edition?.defaultStashLevel ?? 0, maxLevel);
  }
  if (station.normalizedName === SPECIAL_STATIONS.CULTIST_CIRCLE) {
    return Math.min(edition?.defaultCultistCircleLevel ?? 0, maxLevel);
  }
  return 0;
};
export type HideoutCheckOptions = {
  requireStationLevels: boolean;
  requireSkillLevels: boolean;
  requireTraderLoyalty: boolean;
  skills: Record<string, number>;
  skillKeyAliases: ReadonlyMap<string, string>;
  traders: Record<string, { level?: number }>;
};
export const checkStationReqsMet = (
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
export const checkSkillReqsMet = (
  module: HideoutModuleMeta,
  options: HideoutCheckOptions
): boolean => {
  if (!options.requireSkillLevels) return true;
  return (
    module.skillRequirements?.every((req) => {
      if (!req?.name || typeof req?.level !== 'number') return true;
      const canonicalKey = getCanonicalSkillKey(req.name, req.skill?.id) ?? req.name;
      const skillKey = resolveSkillKey(canonicalKey, options.skillKeyAliases);
      const playerSkillLevel = options.skills?.[skillKey] ?? 0;
      return playerSkillLevel >= req.level;
    }) ?? true
  );
};
export const checkTraderReqsMet = (
  module: HideoutModuleMeta,
  options: HideoutCheckOptions
): boolean => {
  if (!options.requireTraderLoyalty) return true;
  return (
    module.traderRequirements?.every((req) => {
      if (!req?.trader?.id || typeof req?.value !== 'number') return true;
      const playerTraderLevel = options.traders?.[req.trader.id]?.level ?? 1;
      return playerTraderLevel >= req.value;
    }) ?? true
  );
};
export const computeNextLevelsAndValidModules = (
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
export const resolveValidHideoutModules = (
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
export const computeTotalSkills = (
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
export const notifyHideoutPrereqEnforcement = (removedCount: number) => {
  if (!removedCount || !import.meta.client) return;
  try {
    const toastI18n = useToastI18n();
    toastI18n.showHideoutUpdated(removedCount);
  } catch (error) {
    logger.warn('[TarkovStore] Could not show hideout enforcement toast:', error);
  }
};
export const enforceHideoutPrereqs = (store: TarkovStoreInstance): string[] => {
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
