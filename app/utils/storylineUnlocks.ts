import type { StoryObjectiveUnlock } from '@/types/tarkov';
const unlockTypes = new Set(['achievement', 'barter', 'map', 'quest', 'trader', 'other']);
const isPlainUnlockObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const nonBlankUnlockText = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;
const optionalUnlockText = (value: unknown): boolean =>
  value === undefined || nonBlankUnlockText(value);
const validUnlockType = (value: unknown): boolean =>
  typeof value === 'string' && unlockTypes.has(value);
export const validStoryUnlock = (value: unknown): value is StoryObjectiveUnlock => {
  if (!isPlainUnlockObject(value)) return false;
  return [
    validUnlockType(value.type),
    nonBlankUnlockText(value.name),
    optionalUnlockText(value.id),
    optionalUnlockText(value.note),
  ].every(Boolean);
};
