import { isStoryObjectiveParent } from '@/utils/storylineObjectives';
import type {
  StorylineNormalizedChapterView,
  StorylineObjectiveProgress,
  StorylineRouteChoiceGroup,
} from '@/composables/useStorylineChapters';
export interface StorylineTimelineEntry {
  id: string;
  order: number;
  /** 1-based position among the chapter's main steps; null for optional objectives. */
  step: number | null;
  complete: boolean;
  objective?: StorylineObjectiveProgress;
  /** Optional children shown beside this step, each with its own checkbox and progress. */
  optionalObjectives: StorylineObjectiveProgress[];
  routeChoice?: StorylineRouteChoiceGroup;
  /** 1-based index matching the "Decision N" label endings refer to. */
  routeIndex?: number;
}
type TimelineEntryContent = Omit<StorylineTimelineEntry, 'step'>;
const byOrder = (left: { order: number; id: string }, right: { order: number; id: string }) =>
  left.order - right.order || left.id.localeCompare(right.id);
export interface StorylineTimelineUnlockGroup {
  id: string;
  /** The route option the unlocks belong to; null when the entry is a single objective. */
  label: string | null;
  objective: StorylineObjectiveProgress;
}
/**
 * Unlocks shown in an entry's unlock column. Each option of a route decision keeps its own group so
 * the column still says which choice unlocks what.
 */
export const storylineEntryUnlockGroups = (
  entry: StorylineTimelineEntry
): StorylineTimelineUnlockGroup[] => {
  const options = entry.routeChoice?.objectives ?? [];
  const groups = entry.objective
    ? [{ id: entry.objective.id, label: null, objective: entry.objective }]
    : options.map((objective) => ({ id: objective.id, label: objective.description, objective }));
  const children = entry.optionalObjectives.map((objective) => ({
    id: objective.id,
    label: objective.description,
    objective,
  }));
  return [...groups, ...children].filter((group) => group.objective.unlocks.length);
};
export const sortStorylineObjectives = (objectives: StorylineObjectiveProgress[]) =>
  [...objectives].sort(byOrder);
const routeEntry = (
  routeChoice: StorylineRouteChoiceGroup,
  index: number
): TimelineEntryContent => ({
  id: routeChoice.id,
  order: Math.min(...routeChoice.objectives.map((objective) => objective.order)),
  complete: routeChoice.objectives.some(
    (objective) => objective.id === routeChoice.chosenObjectiveId && objective.complete
  ),
  routeChoice,
  routeIndex: index + 1,
  optionalObjectives: [],
});
const objectiveEntry = (objective: StorylineObjectiveProgress): TimelineEntryContent => ({
  id: objective.id,
  order: objective.order,
  complete: objective.complete,
  objective,
  optionalObjectives: [],
});
const entryObjectives = (entry: TimelineEntryContent): StorylineObjectiveProgress[] =>
  entry.objective ? [entry.objective] : (entry.routeChoice?.objectives ?? []);
const groupOptionalObjectives = (
  entries: TimelineEntryContent[],
  optionals: StorylineObjectiveProgress[]
): TimelineEntryContent[] => {
  const parents = new Map(
    entries.flatMap((entry) =>
      entryObjectives(entry).map((objective) => [objective.id, { entry, objective }] as const)
    )
  );
  const standalone = sortStorylineObjectives(optionals).flatMap((objective) => {
    const parent = parents.get(objective.parentObjectiveId ?? '');
    if (!parent || !isStoryObjectiveParent(objective, parent.objective)) {
      return [objectiveEntry(objective)];
    }
    parent.entry.optionalObjectives.push(objective);
    return [];
  });
  return [...entries, ...standalone];
};
/**
 * Main objectives and route decisions keep their order and numbering. Explicit optional children
 * share their parent's row; unlinked objectives retain their original place in the sequence.
 */
export const buildStorylineTimeline = (
  chapter: StorylineNormalizedChapterView
): StorylineTimelineEntry[] => {
  const optionalIds = new Set(chapter.optionalLinearObjectives.map((objective) => objective.id));
  let step = 0;
  return groupOptionalObjectives(
    [
      ...chapter.mainLinearObjectives.map(objectiveEntry),
      ...chapter.mainRouteChoices.map(routeEntry),
    ],
    chapter.optionalLinearObjectives
  )
    .sort(byOrder)
    .map((entry) => ({ ...entry, step: optionalIds.has(entry.id) ? null : ++step }));
};
