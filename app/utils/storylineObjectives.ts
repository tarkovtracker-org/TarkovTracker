import { getDefaultStoryObjectiveLinks } from '@/data/storyObjectiveLinks';
import type { StoryChapter, StoryObjective } from '@/types/tarkov';
const defaultStoryObjectiveLinks = getDefaultStoryObjectiveLinks();
type StoryObjectiveInput = StoryChapter['objectives'] | StoryObjective[] | null | undefined;
type StoryObjectiveLike = Partial<StoryObjective> & { id?: string };
const normalizeObjectiveType = (type: StoryObjectiveLike['type']): StoryObjective['type'] => {
  return type === 'optional' ? 'optional' : 'main';
};
const normalizeObjectiveOrder = (order: StoryObjectiveLike['order'], fallback: number): number => {
  return typeof order === 'number' && Number.isFinite(order) && order > 0 ? order : fallback;
};
const normalizeMutualList = (objectiveId: string, objective: StoryObjectiveLike): string[] => {
  const provided = Array.isArray(objective.mutuallyExclusiveWith)
    ? objective.mutuallyExclusiveWith
    : [];
  const defaults = defaultStoryObjectiveLinks[objectiveId] ?? [];
  return Array.from(
    new Set(
      [...provided, ...defaults].filter(
        (linkedId): linkedId is string =>
          typeof linkedId === 'string' && linkedId.length > 0 && linkedId !== objectiveId
      )
    )
  ).sort();
};
const normalizeObjectiveEntries = (
  objectives: StoryObjectiveInput
): Array<{ key: string; objective: StoryObjectiveLike; index: number }> => {
  if (!objectives) {
    return [];
  }
  if (Array.isArray(objectives)) {
    return objectives.map((objective, index) => ({
      key: objective?.id ?? `objective-${index + 1}`,
      objective: objective ?? {},
      index,
    }));
  }
  return Object.entries(objectives).map(([key, objective], index) => ({
    key,
    objective: objective ?? {},
    index,
  }));
};
export const normalizeStoryObjectives = (
  objectives: StoryObjectiveInput
): Record<string, StoryObjective> => {
  const objectiveMap: Record<string, StoryObjective> = {};
  for (const entry of normalizeObjectiveEntries(objectives)) {
    const objectiveId = entry.objective.id ?? entry.key;
    if (!objectiveId) {
      continue;
    }
    objectiveMap[objectiveId] = {
      description:
        typeof entry.objective.description === 'string' && entry.objective.description.length > 0
          ? entry.objective.description
          : objectiveId,
      id: objectiveId,
      mutuallyExclusiveWith: normalizeMutualList(objectiveId, entry.objective),
      notes:
        typeof entry.objective.notes === 'string' || entry.objective.notes === null
          ? entry.objective.notes
          : undefined,
      order: normalizeObjectiveOrder(entry.objective.order, entry.index + 1),
      type: normalizeObjectiveType(entry.objective.type),
    };
  }
  for (const objective of Object.values(objectiveMap)) {
    const linkedIds = objective.mutuallyExclusiveWith ?? [];
    for (const linkedId of linkedIds) {
      const linkedObjective = objectiveMap[linkedId];
      if (!linkedObjective) {
        continue;
      }
      const mergedLinkedIds = new Set(linkedObjective.mutuallyExclusiveWith ?? []);
      mergedLinkedIds.add(objective.id);
      linkedObjective.mutuallyExclusiveWith = Array.from(mergedLinkedIds)
        .filter((id) => id !== linkedObjective.id)
        .sort();
    }
    if ((objective.mutuallyExclusiveWith?.length ?? 0) === 0) {
      objective.mutuallyExclusiveWith = undefined;
    }
  }
  return objectiveMap;
};
export const orderedStoryObjectives = (objectives: StoryObjectiveInput): StoryObjective[] => {
  return Object.values(normalizeStoryObjectives(objectives)).sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.id.localeCompare(b.id);
  });
};
export const normalizeStoryChapter = (chapter: StoryChapter): StoryChapter => {
  return {
    ...chapter,
    objectives: normalizeStoryObjectives(chapter.objectives),
  };
};
