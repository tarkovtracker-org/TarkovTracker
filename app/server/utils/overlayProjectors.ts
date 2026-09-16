import { normalizeStoryChapter } from '@/utils/storylineObjectives';
import { deepMerge, isPlainObject } from './deepMerge';
import type { OverlayData, OverlayRecords, OverlaySections } from './overlayTypes';
import type { GameEdition, StoryChapter, SeasonalPerk } from '@/types/tarkov';
const overlayRecords = (value: unknown): OverlayRecords => {
  if (!isPlainObject(value)) return {};
  return value as OverlayRecords;
};
export const overlayEntries = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.filter(isPlainObject);
  return Object.entries(overlayRecords(value)).map(([id, entry]) => ({ ...entry, id }));
};
export const mergeOverlayRecords = (
  base: OverlayRecords = {},
  patch: OverlayRecords = {}
): OverlayRecords => {
  const result = { ...base };
  for (const [id, entry] of Object.entries(patch)) result[id] = deepMerge(result[id] ?? {}, entry);
  return result;
};
export const scopedOverlay = (
  overlay: OverlayData,
  section: keyof OverlaySections,
  mode: string
): OverlayRecords => mergeOverlayRecords(overlay[section], overlay.modes?.[mode]?.[section]);
const projectOverlayEntities = (
  entities: unknown,
  patches: OverlayRecords
): Array<Record<string, unknown>> => {
  const byId = Object.fromEntries(
    overlayEntries(entities).map((entity) => [String(entity.id), entity])
  );
  return Object.entries(mergeOverlayRecords(byId, patches)).map(([id, entity]) => ({
    ...entity,
    id,
  }));
};
const patchExistingEntities = (
  entities: unknown,
  patches: OverlayRecords
): Array<Record<string, unknown>> =>
  overlayEntries(entities).map((entity) => ({
    ...deepMerge(entity, patches[String(entity.id)] ?? {}),
    id: entity.id,
  }));
export const projectStoryChapters = (
  overlay: OverlayData,
  mode: string,
  locale: string
): StoryChapter[] =>
  patchExistingEntities(
    scopedOverlay(overlay, 'storyChapters', mode),
    overlay.locales?.[locale]?.storyChapters ?? {}
  )
    .map((chapter) => normalizeStoryChapter(chapter as unknown as StoryChapter))
    .sort((a, b) => a.order - b.order);
export const projectEditions = (overlay: OverlayData, mode: string): GameEdition[] =>
  overlayEntries(scopedOverlay(overlay, 'editions', mode)) as unknown as GameEdition[];
export const projectSeasonalPerks = (overlay: OverlayData, mode: string): SeasonalPerk[] => {
  if (mode !== 'pvp-season') return [];
  return overlayEntries(scopedOverlay(overlay, 'seasonalPerks', mode)) as unknown as SeasonalPerk[];
};
const withPatchedConditions = (
  prestige: Record<string, unknown>,
  patch: Record<string, unknown>
) => {
  const merged = deepMerge(prestige, patch);
  if (patch.conditions !== undefined)
    merged.conditions = Array.isArray(patch.conditions)
      ? patch.conditions
      : projectOverlayEntities(prestige.conditions, overlayRecords(patch.conditions));
  return merged;
};
const prestigeTasks = (raw: unknown, additions: OverlayRecords) => {
  const upstreamTasks = overlayEntries(raw);
  const upstreamIds = new Set(upstreamTasks.map((task) => task.id));
  return [
    ...upstreamTasks,
    ...overlayEntries(additions).filter(
      (task) => !upstreamIds.has(task.id) && task.disabled !== true
    ),
  ];
};
const patchPrestigeEntries = (entries: unknown, patches: OverlayRecords) =>
  overlayEntries(entries).map((entry) =>
    withPatchedConditions(entry, patches[String(entry.id)] ?? {})
  );
const localeSections = (overlay: OverlayData, locale: string) => overlay.locales?.[locale] ?? {};
export const projectRawPrestige = (
  payload: import('./tarkov-json').JsonTasksPayload,
  overlay: OverlayData,
  mode: string,
  locale: string
) => {
  const local = localeSections(overlay, locale);
  const tasks = prestigeTasks(payload.tasks, scopedOverlay(overlay, 'tasksAdd', mode));
  const correctedTasks = patchExistingEntities(tasks, scopedOverlay(overlay, 'tasks', mode));
  const localizedTasks = patchExistingEntities(correctedTasks, local.tasks ?? {}).filter(
    (task) => task.disabled !== true
  );
  const patches = scopedOverlay(overlay, 'prestige', mode);
  const prestige = patchPrestigeEntries(payload.prestige, patches);
  const chapters = projectStoryChapters(overlay, mode, locale);
  return {
    ...payload,
    tasks: localizedTasks,
    prestige: patchPrestigeEntries(prestige, local.prestige ?? {}).map((entry) =>
      localizeStoryRequirements(entry, chapters)
    ),
  };
};
const chapterObjectives = (chapter: StoryChapter | undefined) =>
  Object.values(chapter?.objectives ?? {});
const storyRequirementName = (
  requirement: Record<string, unknown>,
  chapter: StoryChapter | undefined
) => {
  if (requirement.type !== 'storyObjectiveStatus') return chapter?.name;
  return chapterObjectives(chapter).find((objective) => objective.id === requirement.objective)
    ?.description;
};
const localizeStoryRequirements = (entry: Record<string, unknown>, chapters: StoryChapter[]) => {
  if (!Array.isArray(entry.storyRequirements)) return entry;
  const requirements = entry.storyRequirements.map((requirement) => {
    if (!isPlainObject(requirement)) return requirement;
    const chapter = chapters.find((chapter) => chapter.id === requirement.storyChapter);
    const name = storyRequirementName(requirement, chapter);
    return { ...requirement, name: name ?? requirement.name, unresolved: !name };
  });
  return { ...entry, storyRequirements: requirements };
};
