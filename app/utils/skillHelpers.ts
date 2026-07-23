import { logger } from '@/utils/logger';
import type { Task, TaskObjective } from '@/types/tarkov';
export const normalizeSkillToken = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  if (objective.type !== 'skill' || !skillLevel?.name) return null;
  const skillName = skillLevel.name;
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
      if (!reward?.name) return;
      const skillName = reward.name;
      const skillId = reward.skill?.id;
      const skillKey = getCanonicalSkillKey(skillName, skillId);
      if (!skillKey) return;
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
