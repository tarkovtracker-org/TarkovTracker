import { logger } from '@/utils/logger';
import type { SkillLevelReward, Task, TaskObjective } from '@/types/tarkov';
export const normalizeSkillToken = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
/** Formats raw camelCase skill IDs (e.g. "StressResistance") while preserving acronyms ("SMG", "DMR"). */
export const formatSkillDisplayName = (skillId: string): string => {
  const trimmed = skillId.trim();
  if (!trimmed) return '';
  return trimmed.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
};
export const getCanonicalSkillKey = (
  skillName: string | null | undefined,
  skillId?: string | null
): string | null => {
  return normalizeSkillToken(skillId) ?? normalizeSkillToken(skillName);
};
export type SkillObjectiveDetails = {
  skillKey: string;
  skillName: string;
  skillId?: string;
  requiredLevel: number;
  imageLink?: string;
};
export const readSkillObjective = (objective: TaskObjective): SkillObjectiveDetails | null => {
  const { skillLevel } = objective;
  const skillName = normalizeSkillToken(skillLevel?.name);
  if (objective.type !== 'skill' || !skillLevel || !skillName) return null;
  const skillId = skillLevel.skill?.id;
  const skillKey = getCanonicalSkillKey(skillName, skillId);
  if (!skillKey) return null;
  return {
    skillKey,
    skillName,
    skillId,
    requiredLevel: skillLevel.level || 0,
    imageLink: skillLevel.skill?.imageLink,
  };
};
const getSkillRewardKey = (reward: SkillLevelReward | undefined): string | null =>
  getCanonicalSkillKey(reward?.name, reward?.skill?.id);
export const getNamedSkillRewardKey = (reward: SkillLevelReward): string | null =>
  reward?.name ? getSkillRewardKey(reward) : null;
export const buildSkillKeyAliases = (tasks: Task[]): Map<string, string> => {
  const aliases = new Map<string, string>();
  tasks.forEach((task) => {
    task.objectives?.forEach((objective) => {
      const skill = readSkillObjective(objective);
      if (!skill) return;
      aliases.set(skill.skillKey, skill.skillKey);
      aliases.set(skill.skillName, skill.skillKey);
      if (skill.skillId) {
        aliases.set(skill.skillId, skill.skillKey);
      }
    });
    task.finishRewards?.skillLevelReward?.forEach((reward) => {
      const skillKey = getNamedSkillRewardKey(reward);
      if (!skillKey) return;
      const { name: skillName, skill } = reward;
      const skillId = skill?.id;
      aliases.set(skillKey, skillKey);
      aliases.set(skillName, skillKey);
      if (skillId) {
        aliases.set(skillId, skillKey);
      }
    });
  });
  return aliases;
};
export const resolveSkillKey = (
  skillName: string,
  aliases: ReadonlyMap<string, string>
): string => {
  const normalizedSkillName = normalizeSkillToken(skillName);
  if (!normalizedSkillName) return skillName;
  return aliases.get(normalizedSkillName) ?? normalizedSkillName;
};
export type CollapsedSkillOffset = {
  offset: number;
  sourceKey: string;
  isCanonical: boolean;
};
export const collapseSkillOffsets = (
  offsets: Record<string, number> | null | undefined,
  resolveSkillKey: (skillKey: string) => string
): Map<string, CollapsedSkillOffset> => {
  const collapsed = new Map<string, CollapsedSkillOffset>();
  if (!offsets) return collapsed;
  for (const [skillKey, rawOffset] of Object.entries(offsets)) {
    const resolvedSkillKey = resolveSkillKey(skillKey);
    if (!Number.isFinite(rawOffset)) {
      logger.warn(
        `[collapseSkillOffsets] Non-finite offset "${rawOffset}" for key "${skillKey}" — defaulting to 0`
      );
    }
    const normalizedOffset = Number.isFinite(rawOffset) ? Number(rawOffset.toFixed(2)) : 0;
    const isCanonical = resolvedSkillKey === skillKey;
    const existing = collapsed.get(resolvedSkillKey);
    if (!existing) {
      collapsed.set(resolvedSkillKey, {
        offset: normalizedOffset,
        sourceKey: skillKey,
        isCanonical,
      });
    } else if (isCanonical && !existing.isCanonical) {
      collapsed.set(resolvedSkillKey, {
        offset: normalizedOffset,
        sourceKey: skillKey,
        isCanonical,
      });
    } else if (!isCanonical && existing.isCanonical) {
      // Canonical already stored — ignore this non-canonical alias
    } else {
      // Same canonicity: keep whichever has the larger absolute offset
      if (Math.abs(normalizedOffset) > Math.abs(existing.offset)) {
        collapsed.set(resolvedSkillKey, {
          offset: normalizedOffset,
          sourceKey: skillKey,
          isCanonical,
        });
      }
    }
  }
  return collapsed;
};
export function sumQuestSkillRewards(
  tasks: Task[],
  isTaskSuccessful: (taskId: string) => boolean
): Record<string, number> {
  const totals: Record<string, number> = {};
  tasks
    .filter((task) => isTaskSuccessful(task.id))
    .forEach((task) => {
      const rewards = task.finishRewards?.skillLevelReward || [];
      rewards.forEach((reward) => {
        const skillKey = getSkillRewardKey(reward);
        if (!skillKey) return;
        totals[skillKey] = (totals[skillKey] || 0) + (reward.level || 0);
      });
    });
  return totals;
}
