/**
 * Skill Calculation Composable
 *
 * Provides reactive skill level calculations based on:
 * 1. Completed task rewards (skillLevelReward from finishRewards)
 * 2. User manual offsets for passive in-game skill gains
 *
 * Mirrors the pattern established in useXpCalculation.ts
 *
 * @module composables/useSkillCalculation
 */
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import { MAX_SKILL_LEVEL, sortSkillsByGameOrder } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  buildSkillKeyAliases,
  collapseSkillOffsets,
  getCanonicalSkillKey,
  resolveSkillKey as resolveSkillAliasKey,
} from '@/utils/skillHelpers';
import type { Skill, SkillRequirement, TaskObjective } from '@/types/tarkov';
/**
 * Extended TaskObjective with GraphQL __typename discriminator
 */
interface TaskObjectiveWithTypename extends TaskObjective {
  __typename?: string;
}
/**
 * TaskObjectiveSkill - objective type that requires a skill level
 */
interface TaskObjectiveSkill extends TaskObjectiveWithTypename {
  __typename: 'TaskObjectiveSkill';
  skillLevel?: SkillRequirement & {
    skill?: Skill;
  };
}
/**
 * Type guard to check if an objective is a TaskObjectiveSkill
 */
function isTaskObjectiveSkill(
  objective: TaskObjectiveWithTypename
): objective is TaskObjectiveSkill {
  return objective.__typename === 'TaskObjectiveSkill';
}
export interface SkillMetadata {
  key: string;
  id?: string;
  name: string;
  requiredByTasks: string[];
  requiredLevels: number[];
  rewardedByTasks: string[];
  imageLink?: string;
}
export function useSkillCalculation() {
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  let migratingSkillOffsets = false;
  const isTaskSuccessful = (taskId: string) =>
    tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId);
  const allGameSkills = computed<SkillMetadata[]>(() => {
    const skillsMap = new Map<string, SkillMetadata>();
    metadataStore.tasks.forEach((task) => {
      const taskName = task.name;
      if (!taskName) return;
      task.objectives?.forEach((objective) => {
        const objectiveWithType = objective as TaskObjectiveWithTypename;
        if (!isTaskObjectiveSkill(objectiveWithType) || !objectiveWithType.skillLevel?.name) return;
        const skillName = objectiveWithType.skillLevel.name;
        const skillId = objectiveWithType.skillLevel.skill?.id;
        const skillKey = getCanonicalSkillKey(skillName, skillId);
        if (!skillKey) return;
        const requiredLevel = objectiveWithType.skillLevel.level || 0;
        const imageLink = objectiveWithType.skillLevel?.skill?.imageLink;
        if (!skillsMap.has(skillKey)) {
          skillsMap.set(skillKey, {
            key: skillKey,
            id: skillId,
            name: skillName,
            requiredByTasks: [],
            requiredLevels: [],
            rewardedByTasks: [],
            imageLink,
          });
        } else if (imageLink && !skillsMap.get(skillKey)!.imageLink) {
          skillsMap.get(skillKey)!.imageLink = imageLink;
        }
        if (!skillsMap.get(skillKey)!.id && skillId) {
          skillsMap.get(skillKey)!.id = skillId;
        }
        skillsMap.get(skillKey)!.requiredByTasks.push(taskName);
        if (requiredLevel > 0 && !skillsMap.get(skillKey)!.requiredLevels.includes(requiredLevel)) {
          skillsMap.get(skillKey)!.requiredLevels.push(requiredLevel);
        }
      });
      task.finishRewards?.skillLevelReward?.forEach((reward) => {
        if (!reward?.name) return;
        const skillName = reward.name;
        const skillId = reward.skill?.id;
        const skillKey = getCanonicalSkillKey(skillName, skillId);
        if (!skillKey) return;
        const imageLink = reward.skill?.imageLink;
        if (!skillsMap.has(skillKey)) {
          skillsMap.set(skillKey, {
            key: skillKey,
            id: skillId,
            name: skillName,
            requiredByTasks: [],
            requiredLevels: [],
            rewardedByTasks: [],
            imageLink,
          });
        } else if (imageLink && !skillsMap.get(skillKey)!.imageLink) {
          skillsMap.get(skillKey)!.imageLink = imageLink;
        }
        if (!skillsMap.get(skillKey)!.id && skillId) {
          skillsMap.get(skillKey)!.id = skillId;
        }
        skillsMap.get(skillKey)!.rewardedByTasks.push(taskName);
      });
    });
    skillsMap.forEach((skill) => {
      skill.requiredLevels.sort((a, b) => a - b);
    });
    const skills = Array.from(skillsMap.values());
    const sortMode = preferencesStore.getSkillSortMode;
    if (sortMode === 'ingame') {
      return sortSkillsByGameOrder(skills);
    }
    return skills.sort((a, b) => {
      const aRequired = a.requiredByTasks.length > 0;
      const bRequired = b.requiredByTasks.length > 0;
      if (aRequired !== bRequired) return bRequired ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  });
  const skillKeyAliases = computed(() => {
    return buildSkillKeyAliases(metadataStore.tasks);
  });
  const resolveSkillKey = (skillKeyOrName: string): string => {
    return resolveSkillAliasKey(skillKeyOrName, skillKeyAliases.value);
  };
  const calculatedQuestSkills = computed(() => {
    const skills: { [skillName: string]: number } = {};
    metadataStore.tasks
      .filter((task) => isTaskSuccessful(task.id))
      .forEach((task) => {
        const skillRewards = task.finishRewards?.skillLevelReward || [];
        skillRewards.forEach((reward) => {
          const skillKey = getCanonicalSkillKey(reward?.name, reward?.skill?.id);
          if (!skillKey) return;
          const level = reward.level || 0;
          skills[skillKey] = (skills[skillKey] || 0) + level;
        });
      });
    return skills;
  });
  const totalSkills = computed(() => {
    const result: { [skillName: string]: number } = {};
    const offsets = tarkovStore.getAllSkillOffsets();
    Object.entries(calculatedQuestSkills.value).forEach(([skillName, level]) => {
      result[skillName] = level;
    });
    const collapsedOffsets = collapseSkillOffsets(offsets, resolveSkillKey);
    collapsedOffsets.forEach((entry, skillName) => {
      result[skillName] = (result[skillName] || 0) + entry.offset;
    });
    return result;
  });
  const getSkillLevel = (skillName: string): number => {
    const resolvedSkillKey = resolveSkillKey(skillName);
    return totalSkills.value[resolvedSkillKey] || 0;
  };
  const getQuestSkillLevel = (skillName: string): number => {
    const resolvedSkillKey = resolveSkillKey(skillName);
    return calculatedQuestSkills.value[resolvedSkillKey] || 0;
  };
  const getSkillOffset = (skillName: string): number => {
    const resolvedSkillKey = resolveSkillKey(skillName);
    return tarkovStore.getSkillOffset(resolvedSkillKey);
  };
  const setSkillOffset = (skillName: string, offset: number) => {
    const resolvedSkillKey = resolveSkillKey(skillName);
    tarkovStore.setSkillOffset(resolvedSkillKey, offset);
  };
  const setTotalSkillLevel = (skillName: string, totalLevel: number): boolean => {
    if (typeof totalLevel !== 'number' || !Number.isFinite(totalLevel)) {
      logger.error(
        `[useSkillCalculation] Invalid totalLevel "${totalLevel}" for skill "${skillName}"`
      );
      return false;
    }
    const validatedLevel = Math.min(MAX_SKILL_LEVEL, Math.max(0, totalLevel));
    const normalizedLevel = Number(validatedLevel.toFixed(2));
    const resolvedSkillKey = resolveSkillKey(skillName);
    const questLevel = calculatedQuestSkills.value[resolvedSkillKey] || 0;
    const offset = Number((normalizedLevel - questLevel).toFixed(2));
    tarkovStore.setSkillOffset(resolvedSkillKey, offset);
    return true;
  };
  const resetSkillOffset = (skillName: string) => {
    const resolvedSkillKey = resolveSkillKey(skillName);
    if (resolvedSkillKey !== skillName && tarkovStore.getSkillOffset(skillName) !== 0) {
      tarkovStore.resetSkillOffset(skillName);
    }
    tarkovStore.resetSkillOffset(resolvedSkillKey);
  };
  const migrateLegacySkillOffsets = (): boolean => {
    if (migratingSkillOffsets) return false;
    const offsets = tarkovStore.getAllSkillOffsets();
    const entries = Object.entries(offsets);
    if (!entries.length) return false;
    const migrated = collapseSkillOffsets(offsets, resolveSkillKey);
    const hasChanges = entries.some(([skillKey]) => {
      const resolvedSkillKey = resolveSkillKey(skillKey);
      return (
        resolvedSkillKey !== skillKey || migrated.get(resolvedSkillKey)?.sourceKey !== skillKey
      );
    });
    if (!hasChanges) return false;
    const snapshot = { ...offsets };
    migratingSkillOffsets = true;
    try {
      entries.forEach(([skillKey]) => {
        tarkovStore.resetSkillOffset(skillKey);
      });
      migrated.forEach((entry, skillKey) => {
        tarkovStore.setSkillOffset(skillKey, entry.offset);
      });
      return true;
    } catch (error) {
      logger.error('[useSkillCalculation] Skill offset migration failed, restoring:', error);
      try {
        Object.entries(snapshot).forEach(([key, value]) => {
          tarkovStore.setSkillOffset(key, value);
        });
      } catch (rollbackError) {
        logger.error('[useSkillCalculation] Rollback also failed:', rollbackError);
      }
      return false;
    } finally {
      migratingSkillOffsets = false;
    }
  };
  const allSkillNames = computed(() => {
    const names = new Set<string>();
    allGameSkills.value.forEach((skill) => names.add(skill.name));
    const skillNameByKey = new Map(allGameSkills.value.map((skill) => [skill.key, skill.name]));
    Object.keys(tarkovStore.getAllSkillOffsets()).forEach((name) => {
      const resolvedSkillKey = resolveSkillKey(name);
      names.add(skillNameByKey.get(resolvedSkillKey) ?? name);
    });
    return Array.from(names).sort();
  });
  const getSkillMetadata = (skillName: string) => {
    const resolvedSkillKey = resolveSkillKey(skillName);
    return allGameSkills.value.find((skill) => skill.key === resolvedSkillKey) || null;
  };
  return {
    calculatedQuestSkills,
    totalSkills,
    allSkillNames,
    allGameSkills,
    getSkillLevel,
    getQuestSkillLevel,
    getSkillOffset,
    getSkillMetadata,
    setSkillOffset,
    setTotalSkillLevel,
    resetSkillOffset,
    migrateLegacySkillOffsets,
  };
}
