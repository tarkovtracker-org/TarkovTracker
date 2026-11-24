const sanitizeSkillKey = (skillKey: string): string => skillKey.replace(/[^a-zA-Z0-9_-]/g, '_');
export const getSkillCardId = (skillKey: string): string =>
  `settings-skill-${sanitizeSkillKey(skillKey)}`;
export const getSkillInputId = (skillKey: string): string =>
  `skill-input-${sanitizeSkillKey(skillKey)}`;
export const getSkillRangeId = (skillKey: string): string =>
  `skill-range-${sanitizeSkillKey(skillKey)}`;
export const getSkillRequirementId = (skillKey: string): string =>
  `skill-requirement-${sanitizeSkillKey(skillKey)}`;
