import { useSkillCalculation } from '@/composables/useSkillCalculation';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import { getCanonicalSkillKey } from '@/utils/skillHelpers';
import type {
  HideoutLevel,
  HideoutStation,
  SkillRequirement,
  StationLevelRequirement,
  TraderRequirement,
} from '@/types/tarkov';
export type HideoutStationStatus = 'available' | 'locked' | 'maxed';
export type UseHideoutStationStatusReturn = {
  arePrereqsMet: (nextLevel: HideoutLevel | null) => boolean;
  getStationStatus: (station: HideoutStation) => HideoutStationStatus;
  isSkillReqMet: (requirement: SkillRequirement) => boolean;
  isStationReqMet: (requirement: StationLevelRequirement) => boolean;
  isTraderReqMet: (requirement: TraderRequirement) => boolean;
};
export const useHideoutStationStatus = (): UseHideoutStationStatusReturn => {
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const skillCalculation = useSkillCalculation();
  const requireStationLevels = computed(() => preferencesStore.getHideoutRequireStationLevels);
  const requireSkillLevels = computed(() => preferencesStore.getHideoutRequireSkillLevels);
  const requireTraderLoyalty = computed(() => preferencesStore.getHideoutRequireTraderLoyalty);
  const getCurrentLevel = (station: HideoutStation): number =>
    progressStore.hideoutLevels?.[station.id]?.self ?? 0;
  const getNextLevel = (station: HideoutStation): HideoutLevel | null => {
    const currentLevel = getCurrentLevel(station);
    return station.levels.find((level) => level.level === currentLevel + 1) || null;
  };
  const isStationReqMet = (requirement: StationLevelRequirement): boolean => {
    if (!requireStationLevels.value) return true;
    const currentStationLevel = progressStore.hideoutLevels?.[requirement.station.id]?.self ?? 0;
    return currentStationLevel >= requirement.level;
  };
  const isSkillReqMet = (requirement: SkillRequirement): boolean => {
    if (!requireSkillLevels.value) return true;
    if (!requirement?.name || typeof requirement?.level !== 'number') {
      logger.warn('[useHideoutStationStatus] Invalid skill requirement; treating as satisfied', {
        context: 'useHideoutStationStatus.isSkillReqMet',
        requirement,
      });
      return true;
    }
    const skillKey =
      getCanonicalSkillKey(requirement.name, requirement.skill?.id) ?? requirement.name;
    const currentLevel = skillCalculation.getSkillLevel(skillKey);
    return currentLevel >= requirement.level;
  };
  const isTraderReqMet = (requirement: TraderRequirement): boolean => {
    if (!requireTraderLoyalty.value) return true;
    if (!requirement?.trader?.id || typeof requirement?.value !== 'number') {
      logger.warn('[useHideoutStationStatus] Invalid TraderRequirement; treating as satisfied', {
        context: 'useHideoutStationStatus.isTraderReqMet',
        requirement,
      });
      return true;
    }
    const currentLevel = tarkovStore.getTraderLevel(requirement.trader.id);
    return currentLevel >= requirement.value;
  };
  const arePrereqsMet = (nextLevel: HideoutLevel | null): boolean => {
    if (!nextLevel) return false;
    const stationReqsMet = nextLevel.stationLevelRequirements?.every(isStationReqMet) ?? true;
    const skillReqsMet = nextLevel.skillRequirements?.every(isSkillReqMet) ?? true;
    const traderReqsMet = nextLevel.traderRequirements?.every(isTraderReqMet) ?? true;
    return stationReqsMet && skillReqsMet && traderReqsMet;
  };
  const getStationStatus = (station: HideoutStation): HideoutStationStatus => {
    const nextLevel = getNextLevel(station);
    if (!nextLevel) return 'maxed';
    return arePrereqsMet(nextLevel) ? 'available' : 'locked';
  };
  return {
    arePrereqsMet,
    getStationStatus,
    isSkillReqMet,
    isStationReqMet,
    isTraderReqMet,
  };
};
