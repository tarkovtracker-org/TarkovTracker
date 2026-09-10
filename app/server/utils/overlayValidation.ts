import { isGameEdition } from '@/utils/editionHelpers';
import { isPlainObject } from './deepMerge';
import { mergeOverlayRecords, overlayEntries, scopedOverlay } from './overlayProjectors';
import type { OverlayData, OverlayRecords } from './overlayTypes';
const OVERLAY_SECTION_OWNERS = {
  tasks: 'tasks',
  tasksAdd: 'tasks',
  items: 'items',
  itemsAdd: 'items',
  traders: 'tasks',
  hideout: 'hideout',
  craftsAdd: 'hideout',
  prestige: 'prestige',
  storyChapters: 'editions',
  editions: 'editions',
  seasonalPerks: 'editions (Seasonal only)',
  maps: 'tasks',
} as const;
const sectionNames = new Set(Object.keys(OVERLAY_SECTION_OWNERS));
const isRecordCollection = (value: unknown): boolean =>
  isPlainObject(value) && Object.values(value).every(isPlainObject);
const validCollections = (sections: Record<string, unknown>): boolean =>
  Object.entries(sections).every(
    ([name, value]) => !sectionNames.has(name) || isRecordCollection(value)
  );
const validContainer = (value: unknown): boolean => {
  if (value === undefined) return true;
  return (
    isRecordCollection(value) && Object.values(value as OverlayRecords).every(validCollections)
  );
};
const stringList = (value: unknown): boolean =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const validStoryStatus = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 1 && value[0] === 'complete';
const validRequirementShape = (requirement: Record<string, unknown>): boolean =>
  ['storyChapterStatus', 'storyObjectiveStatus'].includes(String(requirement.type)) &&
  validStoryStatus(requirement.status);
const chapterHasObjective = (
  chapter: Record<string, unknown>,
  requirement: Record<string, unknown>
): boolean =>
  requirement.type !== 'storyObjectiveStatus' ||
  overlayEntries(chapter.objectives).some((objective) => objective.id === requirement.objective);
const validStoryReference = (requirement: unknown, chapters: OverlayRecords): boolean => {
  if (!isPlainObject(requirement)) return false;
  if (!validRequirementShape(requirement)) return false;
  const chapterId = String(requirement.storyChapter);
  if (!Object.hasOwn(chapters, chapterId)) return false;
  const chapter = chapters[chapterId];
  return Boolean(chapter) && chapterHasObjective(chapter!, requirement);
};
const storyRequirements = (level: Record<string, unknown>) =>
  Array.isArray(level.storyRequirements) ? level.storyRequirements : [];
const validChapterReferences = (overlay: OverlayData, mode: string): boolean => {
  const chapters = scopedOverlay(overlay, 'storyChapters', mode);
  return overlayEntries(scopedOverlay(overlay, 'prestige', mode))
    .flatMap(storyRequirements)
    .every((requirement) => validStoryReference(requirement, chapters));
};
const validItemFilter = (filter: unknown): boolean => {
  if (filter === undefined) return true;
  if (!isPlainObject(filter)) return false;
  return ['allowedItems', 'excludedItems', 'allowedCategories', 'excludedCategories'].every((key) =>
    stringList(filter[key])
  );
};
const validEffect = (effect: unknown): boolean =>
  isPlainObject(effect) &&
  typeof effect.effectId === 'string' &&
  validItemFilter(effect.itemFilter);
const validPerk = (perk: Record<string, unknown>): boolean =>
  Array.isArray(perk.effects) &&
  (perk.mutuallyExclusiveSeasonalPerkIds === undefined ||
    stringList(perk.mutuallyExclusiveSeasonalPerkIds)) &&
  perk.effects.every(validEffect);
const validTaskReference = (value: unknown): boolean =>
  isPlainObject(value) && typeof value.id === 'string';
const validCraftUnlock = (unlock: unknown): boolean =>
  unlock == null || typeof unlock === 'string' || validTaskReference(unlock);
const validCraftLocation = (craft: Record<string, unknown>): boolean =>
  typeof craft.station === 'string' && typeof craft.level === 'number';
const validCraft = (craft: Record<string, unknown>): boolean =>
  [
    validCraftLocation(craft),
    Array.isArray(craft.requiredItems),
    isPlainObject(craft.productItem),
    validCraftUnlock(craft.taskUnlock),
  ].every(Boolean);
const validPrestigePatch = (patch: Record<string, unknown>): boolean => {
  const requirements =
    patch.storyRequirements === undefined || Array.isArray(patch.storyRequirements);
  const conditions =
    patch.conditions === undefined ||
    Array.isArray(patch.conditions) ||
    isRecordCollection(patch.conditions);
  return [requirements, conditions].every(Boolean);
};
const validObjectives = (value: unknown): boolean => {
  if (value === undefined) return true;
  return Array.isArray(value) ? value.every(validTaskReference) : isRecordCollection(value);
};
const validEffectiveSections = (overlay: OverlayData, mode: string): boolean => {
  const perks = overlayEntries(scopedOverlay(overlay, 'seasonalPerks', mode)).every(validPerk);
  const crafts = overlayEntries(scopedOverlay(overlay, 'craftsAdd', mode)).every(validCraft);
  const chapters = overlayEntries(scopedOverlay(overlay, 'storyChapters', mode)).every((chapter) =>
    validObjectives(chapter.objectives)
  );
  return [
    perks,
    crafts,
    overlayEntries(scopedOverlay(overlay, 'editions', mode)).every(isGameEdition),
    chapters,
    overlayEntries(scopedOverlay(overlay, 'prestige', mode)).every(validPrestigePatch),
  ].every(Boolean);
};
const validLocalizedReferences = (overlay: OverlayData, mode: string): boolean =>
  Object.values(overlay.locales ?? {}).every((locale) => {
    const localized: OverlayData = {
      ...overlay,
      modes: undefined,
      prestige: mergeOverlayRecords(scopedOverlay(overlay, 'prestige', mode), locale.prestige),
      storyChapters: mergeOverlayRecords(
        scopedOverlay(overlay, 'storyChapters', mode),
        locale.storyChapters
      ),
    };
    return validEffectiveSections(localized, mode) && validChapterReferences(localized, mode);
  });
const hasOverlayMeta = (value: Record<string, unknown>): boolean => {
  const meta = value.$meta;
  if (!isPlainObject(meta)) return false;
  return ['version', 'generated', 'sha256'].every(
    (key) => typeof meta[key] === 'string' && meta[key].trim().length > 0
  );
};
export const validateOverlayData = (value: unknown): value is OverlayData => {
  if (!isPlainObject(value)) return false;
  if (
    ![
      hasOverlayMeta(value),
      isPlainObject(value.editions) && Object.keys(value.editions).length > 0,
      validCollections(value),
      validContainer(value.modes),
      validContainer(value.locales),
    ].every(Boolean)
  )
    return false;
  const overlay = value as OverlayData;
  return ['regular', 'pve', 'pvp-season'].every((mode) =>
    [
      validEffectiveSections(overlay, mode),
      validChapterReferences(overlay, mode),
      validLocalizedReferences(overlay, mode),
    ].every(Boolean)
  );
};
const unknownSectionNames = (value: object, prefix: string, allowed: Set<string>): string[] =>
  Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${prefix}${key}`);
const scopedUnknownSections = (
  prefix: string,
  allowed: Set<string>,
  container: Record<string, object> = {}
): string[] =>
  Object.entries(container).flatMap(([scope, sections]) =>
    unknownSectionNames(sections, `${prefix}.${scope}.`, allowed)
  );
export const unknownOverlaySections = (overlay: OverlayData): string[] => {
  const rootNames = new Set([...sectionNames, '$meta', 'modes', 'locales']);
  const localeNames = new Set(['tasks', 'items', 'traders', 'maps', 'prestige', 'storyChapters']);
  return [
    ...unknownSectionNames(overlay, '', rootNames),
    ...scopedUnknownSections('modes', sectionNames, overlay.modes),
    ...scopedUnknownSections('locales', localeNames, overlay.locales),
  ];
};
