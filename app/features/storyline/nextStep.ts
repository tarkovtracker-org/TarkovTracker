import { buildStorylineTimeline } from '@/features/storyline/storylineTimeline';
import type {
  StorylineNormalizedChapterView,
  StorylineObjectiveProgress,
} from '@/composables/useStorylineChapters';
import type { EvaluationLookup } from '@/features/dashboard/upNext';
import type { TaskBlocker } from '@/stores/taskAvailability';
export interface StorylineTarget {
  chapter: string;
  objective: string;
}
export interface StorylineNextStep {
  chapterId: string;
  chapterName: string;
  kind: 'objective' | 'choice' | 'review';
  objectiveId?: string;
  description?: string;
  unlocks: string[];
  opens: number;
}
const isStorylineBlocker = (blocker: TaskBlocker | undefined): blocker is TaskBlocker =>
  Boolean(blocker && ['story_objective', 'trader_unlock'].includes(blocker.type));
/** Only link an objective that belongs to the current mode's catalog. */
export const storylineBlockerTarget = (
  blocker: TaskBlocker | undefined,
  chapters: StorylineNormalizedChapterView[]
): StorylineTarget | undefined => {
  if (!isStorylineBlocker(blocker)) return undefined;
  const chapter = chapters.find(
    (candidate) =>
      blocker.chapterIds?.includes(candidate.id) &&
      candidate.objectives.some((objective) => objective.id === blocker.objective?.id)
  );
  if (!chapter || !blocker.objective) return undefined;
  return { chapter: chapter.id, objective: blocker.objective.id };
};
const isStartedChapter = (chapter: StorylineNormalizedChapterView): boolean =>
  chapter.autoStart || chapter.objectives.some((objective) => objective.complete);
const questRoutes = (
  chapter: StorylineNormalizedChapterView,
  objective: StorylineObjectiveProgress
) =>
  chapter.questRouteChoices.filter((choice) =>
    choice.branches.some((branch) => branch.id === objective.sourceQuestId)
  );
const isExcludedRoute = (
  chapter: StorylineNormalizedChapterView,
  objective: StorylineObjectiveProgress
): boolean =>
  questRoutes(chapter, objective).some(
    (choice) => choice.chosenBranchId && choice.chosenBranchId !== objective.sourceQuestId
  );
const needsRouteReview = (
  chapter: StorylineNormalizedChapterView,
  objective: StorylineObjectiveProgress
): boolean =>
  Boolean(objective.mutuallyExclusiveWith?.length) ||
  questRoutes(chapter, objective).some((choice) => !choice.chosenBranchId || choice.conflicting);
const waitsOnObjective = (blocker: TaskBlocker, chapterId: string, objectiveId: string): boolean =>
  blocker.type === 'story_objective' &&
  blocker.chapterIds?.length === 1 &&
  blocker.chapterIds[0] === chapterId &&
  blocker.objective?.id === objectiveId;
/** Every remaining gate must be this objective; level/trader/other gates never inflate Opens. */
const openedTaskCount = (
  chapterId: string,
  objectiveId: string,
  pendingTaskIds: readonly string[],
  evaluation: EvaluationLookup
): number =>
  pendingTaskIds.filter((id) => {
    const blockers = evaluation(id)?.blockers ?? [];
    return (
      blockers.length > 0 &&
      blockers.every((blocker) => waitsOnObjective(blocker, chapterId, objectiveId))
    );
  }).length;
const chapterNextStep = (
  chapter: StorylineNormalizedChapterView,
  pendingTaskIds: readonly string[],
  evaluation: EvaluationLookup
): StorylineNextStep => {
  const base: StorylineNextStep = {
    chapterId: chapter.id,
    chapterName: chapter.name,
    kind: 'review',
    unlocks: [],
    opens: 0,
  };
  const entry = buildStorylineTimeline(chapter).find((candidate) => {
    if (candidate.step === null || candidate.complete) return false;
    return !candidate.objective || !isExcludedRoute(chapter, candidate.objective);
  });
  if (!entry) return base;
  const objective = entry.objective;
  if (!objective || needsRouteReview(chapter, objective)) return { ...base, kind: 'choice' };
  return {
    ...base,
    kind: 'objective',
    objectiveId: objective.id,
    description: objective.description,
    unlocks: objective.unlocks
      .filter((unlock) => !unlock.estimated)
      .map((unlock) => (unlock.note ? `${unlock.label} (${unlock.note})` : unlock.label)),
    opens: openedTaskCount(chapter.id, objective.id, pendingTaskIds, evaluation),
  };
};
/** Display order is a tracking aid, not proof that an objective is available in game. */
export const nextStorylineStep = (
  chapters: StorylineNormalizedChapterView[],
  pendingTaskIds: readonly string[],
  evaluation: EvaluationLookup
): StorylineNextStep | undefined => {
  const chapter = chapters
    .filter((candidate) => !candidate.complete && isStartedChapter(candidate))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))[0];
  return chapter ? chapterNextStep(chapter, pendingTaskIds, evaluation) : undefined;
};
