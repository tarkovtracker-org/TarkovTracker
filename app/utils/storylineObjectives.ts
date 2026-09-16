import type { StoryChapter, StoryObjective } from '@/types/tarkov';
type StoryObjectiveInput = StoryChapter['objectives'] | StoryObjective[] | null | undefined;
type StoryObjectiveLike = Partial<StoryObjective> & { id?: string };
type StoryQuestPairs = NonNullable<StoryChapter['mutuallyExclusiveQuestPairs']>;
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const optionalText = (value: unknown): string | undefined =>
  isNonEmptyString(value) ? value : undefined;
const compareIds = (left: string, right: string): number => left.localeCompare(right);
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
  return Array.from(
    new Set(
      provided.filter(
        (linkedId): linkedId is string => isNonEmptyString(linkedId) && linkedId !== objectiveId
      )
    )
  ).sort(compareIds);
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
      endingId: optionalText(entry.objective.endingId),
      id: objectiveId,
      mutuallyExclusiveWith: normalizeMutualList(objectiveId, entry.objective),
      notes:
        typeof entry.objective.notes === 'string' || entry.objective.notes === null
          ? entry.objective.notes
          : undefined,
      order: normalizeObjectiveOrder(entry.objective.order, entry.index + 1),
      sourceQuestId: optionalText(entry.objective.sourceQuestId),
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
        .sort(compareIds);
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
const isDistinctIdPair = (pair: readonly unknown[]): boolean =>
  isNonEmptyString(pair[0]) && isNonEmptyString(pair[1]) && pair[0] !== pair[1];
const isQuestPair = (pair: unknown): pair is [string, string] =>
  Array.isArray(pair) && pair.length === 2 && isDistinctIdPair(pair);
const normalizedQuestPairs = (pairs?: StoryQuestPairs): Array<[string, string]> =>
  (pairs ?? []).filter(isQuestPair);
/**
 * Sub-quest IDs the overlay declares mutually exclusive for a chapter. Completing every objective
 * of one such quest rules the paired quest out, but partial progress on both stays legal, so these
 * IDs gate bulk completion only — never an individual objective toggle.
 */
export const storyExclusiveQuestIds = (pairs?: StoryQuestPairs): Set<string> => {
  const questIds = new Set<string>();
  for (const [questId, otherQuestId] of normalizedQuestPairs(pairs)) {
    questIds.add(questId);
    questIds.add(otherQuestId);
  }
  return questIds;
};
const buildQuestAdjacency = (pairs?: StoryQuestPairs): Map<string, Set<string>> => {
  const adjacency = new Map<string, Set<string>>();
  const link = (fromQuestId: string, toQuestId: string) => {
    const linked = adjacency.get(fromQuestId) ?? new Set<string>();
    linked.add(toQuestId);
    adjacency.set(fromQuestId, linked);
  };
  for (const [questId, otherQuestId] of normalizedQuestPairs(pairs)) {
    link(questId, otherQuestId);
    link(otherQuestId, questId);
  }
  return adjacency;
};
const collectQuestGroup = (
  startQuestId: string,
  adjacency: Map<string, Set<string>>,
  visited: Set<string>
): string[] => {
  const pending = [startQuestId];
  const group: string[] = [];
  while (pending.length > 0) {
    const questId = pending.pop()!;
    if (visited.has(questId)) {
      continue;
    }
    visited.add(questId);
    group.push(questId);
    pending.push(...(adjacency.get(questId) ?? []));
  }
  return group.sort(compareIds);
};
/** Connected groups of mutually exclusive sub-quests, so a quest paired with several appears once. */
export const storyQuestExclusionGroups = (pairs?: StoryQuestPairs): string[][] => {
  const adjacency = buildQuestAdjacency(pairs);
  const visited = new Set<string>();
  const groups: string[][] = [];
  for (const questId of adjacency.keys()) {
    if (visited.has(questId)) {
      continue;
    }
    groups.push(collectQuestGroup(questId, adjacency, visited));
  }
  return groups.sort((left, right) => (left[0] ?? '').localeCompare(right[0] ?? ''));
};
const belongsToExclusiveQuest = (
  objective: StoryObjective,
  exclusiveQuestIds: ReadonlySet<string>
): boolean =>
  isNonEmptyString(objective.sourceQuestId) && exclusiveQuestIds.has(objective.sourceQuestId);
/**
 * Objectives a chapter-level "mark complete" may set. Objectives on a mutually exclusive route are
 * excluded so bulk completion never records both sides of a branch the player has to choose between.
 */
export const getAutoCompletableObjectiveIds = (
  objectives: StoryObjectiveInput,
  mutuallyExclusiveQuestPairs?: StoryQuestPairs
): string[] => {
  const exclusiveQuestIds = storyExclusiveQuestIds(mutuallyExclusiveQuestPairs);
  return orderedStoryObjectives(objectives)
    .filter(
      (objective) =>
        !objective.mutuallyExclusiveWith?.length &&
        !belongsToExclusiveQuest(objective, exclusiveQuestIds)
    )
    .map((objective) => objective.id);
};
/**
 * Persisted objective IDs the current chapter data no longer defines. Upstream re-keys curated
 * objectives to real client IDs on occasion (overlay v1.93 replaced all of The Ticket's), which
 * leaves saved marks stranded rather than failing loudly; surfacing the count keeps that visible.
 */
export const unknownStoryObjectiveIds = (
  objectives: StoryObjectiveInput,
  storedObjectiveIds: Iterable<string>
): string[] => {
  const known = normalizeStoryObjectives(objectives);
  return Array.from(new Set(storedObjectiveIds))
    .filter((objectiveId) => isNonEmptyString(objectiveId) && !known[objectiveId])
    .sort(compareIds);
};
export interface ToggleStoryChapterWithLinearObjectivesOptions {
  chapterId: string;
  isChapterComplete: boolean;
  objectives?: Exclude<StoryObjectiveInput, undefined>;
  mutuallyExclusiveQuestPairs?: StoryQuestPairs;
  isObjectiveComplete: (objectiveId: string) => boolean;
  setChapterComplete: (chapterId: string) => void;
  setChapterUncomplete: (chapterId: string) => void;
  setObjectiveComplete: (chapterId: string, objectiveId: string) => void;
  setObjectiveUncomplete: (chapterId: string, objectiveId: string) => void;
}
export const toggleStoryChapterWithLinearObjectives = (
  options: ToggleStoryChapterWithLinearObjectivesOptions
): void => {
  const objectiveIds = getAutoCompletableObjectiveIds(
    options.objectives,
    options.mutuallyExclusiveQuestPairs
  );
  if (options.isChapterComplete) {
    options.setChapterUncomplete(options.chapterId);
    for (const objectiveId of objectiveIds) {
      if (options.isObjectiveComplete(objectiveId)) {
        options.setObjectiveUncomplete(options.chapterId, objectiveId);
      }
    }
    return;
  }
  options.setChapterComplete(options.chapterId);
  for (const objectiveId of objectiveIds) {
    if (!options.isObjectiveComplete(objectiveId)) {
      options.setObjectiveComplete(options.chapterId, objectiveId);
    }
  }
};
export const normalizeStoryChapter = (chapter: StoryChapter): StoryChapter => {
  return {
    ...chapter,
    order: Number.isFinite(chapter.order) ? chapter.order : 0,
    objectives: normalizeStoryObjectives(chapter.objectives),
  };
};
