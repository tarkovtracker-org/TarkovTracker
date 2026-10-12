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
  routeChoice?: StorylineRouteChoiceGroup;
  /** 1-based index matching the "Decision N" label endings refer to. */
  routeIndex?: number;
}
const byOrder = (left: { order: number; id: string }, right: { order: number; id: string }) =>
  left.order - right.order || left.id.localeCompare(right.id);
export const sortStorylineObjectives = (objectives: StorylineObjectiveProgress[]) =>
  [...objectives].sort(byOrder);
const routeEntry = (routeChoice: StorylineRouteChoiceGroup, index: number) => ({
  id: routeChoice.id,
  order: Math.min(...routeChoice.objectives.map((objective) => objective.order)),
  complete: routeChoice.objectives.some(
    (objective) => objective.id === routeChoice.chosenObjectiveId && objective.complete
  ),
  routeChoice,
  routeIndex: index + 1,
});
const objectiveEntry = (objective: StorylineObjectiveProgress) => ({
  id: objective.id,
  order: objective.order,
  complete: objective.complete,
  objective,
});
/**
 * Lays a chapter's main objectives, route decisions, and optional objectives out as one
 * chronological sequence. The data only orders optional objectives; it does not say which main step
 * they belong to, so they keep their place in the sequence instead of being grouped under a step.
 */
export const buildStorylineTimeline = (
  chapter: StorylineNormalizedChapterView
): StorylineTimelineEntry[] => {
  const optionalIds = new Set(chapter.optionalLinearObjectives.map((objective) => objective.id));
  let step = 0;
  return [
    ...chapter.mainLinearObjectives.map(objectiveEntry),
    ...chapter.mainRouteChoices.map(routeEntry),
    ...chapter.optionalLinearObjectives.map(objectiveEntry),
  ]
    .sort(byOrder)
    .map((entry) => ({ ...entry, step: optionalIds.has(entry.id) ? null : ++step }));
};
