import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { normalizeStoryObjectives, orderedStoryObjectives } from '@/utils/storylineObjectives';
import type { ComputedRef } from '#imports';
import type { StoryObjective, StoryRewards } from '@/types/tarkov';
export interface StorylineLinkEntry {
  id: string;
  name: string;
}
export interface StorylineChapterView {
  id: string;
  name: string;
  normalizedName: string;
  order: number;
  autoStart: boolean;
  complete: boolean;
  wikiLink: string;
  description?: string | null;
  notes?: string | null;
  rewards?: StoryRewards | null;
  requirements: StorylineLinkEntry[];
  mapUnlocks: StorylineLinkEntry[];
  traderUnlocks: StorylineLinkEntry[];
  objectives: StoryObjective[];
  objectiveMap: Record<string, StoryObjective>;
}
export interface StorylineRequirementView {
  id: string;
  label: string;
}
export interface StorylineObjectiveProgress extends StoryObjective {
  complete: boolean;
}
export interface StorylineNormalizedChapterView extends Omit<
  StorylineChapterView,
  'objectives' | 'requirements'
> {
  mainObjectiveCompleted: number;
  mainObjectiveTotal: number;
  mainObjectives: StorylineObjectiveProgress[];
  objectives: StorylineObjectiveProgress[];
  optionalObjectives: StorylineObjectiveProgress[];
  requirements: StorylineRequirementView[];
}
interface UseStorylineChaptersOptions {
  isChapterComplete?: (chapterId: string) => boolean;
  isObjectiveComplete?: (chapterId: string, objectiveId: string) => boolean;
}
const normalizeChapterRequirements = (
  chapter: StorylineChapterView
): StorylineRequirementView[] => {
  const rawRequirements = chapter.requirements as Array<
    string | { description?: string; id?: string; name?: string }
  >;
  return rawRequirements
    .map((rawRequirement, index) => {
      if (typeof rawRequirement === 'string') {
        const label = rawRequirement.trim();
        if (!label) {
          return null;
        }
        return {
          id: `${chapter.id}-requirement-${index}`,
          label,
        };
      }
      const label = rawRequirement.name?.trim() || rawRequirement.description?.trim();
      if (!label) {
        return null;
      }
      return {
        id: rawRequirement.id?.trim() || `${chapter.id}-requirement-${index}`,
        label,
      };
    })
    .filter((requirement): requirement is StorylineRequirementView => Boolean(requirement));
};
export function useStorylineChapters(options: UseStorylineChaptersOptions = {}): {
  chapters: ComputedRef<StorylineChapterView[]>;
  normalizedChapters: ComputedRef<StorylineNormalizedChapterView[]>;
} {
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const isChapterComplete = options.isChapterComplete ?? tarkovStore.isStoryChapterComplete;
  const isObjectiveComplete = options.isObjectiveComplete ?? tarkovStore.isStoryObjectiveComplete;
  const chapters = computed<StorylineChapterView[]>(() => {
    return (metadataStore.storyChapters ?? []).map((chapter) => {
      const objectiveMap = normalizeStoryObjectives(chapter.objectives);
      return {
        id: chapter.id,
        name: chapter.name || chapter.id,
        normalizedName: chapter.normalizedName,
        order: chapter.order,
        autoStart: chapter.autoStart ?? false,
        complete: isChapterComplete(chapter.id),
        wikiLink: chapter.wikiLink,
        description: chapter.description,
        notes: chapter.notes,
        rewards: chapter.rewards,
        requirements: chapter.chapterRequirements ?? [],
        mapUnlocks: chapter.mapUnlocks ?? [],
        traderUnlocks: chapter.traderUnlocks ?? [],
        objectives: orderedStoryObjectives(objectiveMap),
        objectiveMap,
      };
    });
  });
  const normalizedChapters = computed<StorylineNormalizedChapterView[]>(() => {
    return chapters.value.map((chapter) => {
      const objectives = chapter.objectives.map((objective) => ({
        ...objective,
        complete: isObjectiveComplete(chapter.id, objective.id),
      }));
      const mainObjectives = objectives.filter((objective) => objective.type === 'main');
      const optionalObjectives = objectives.filter((objective) => objective.type === 'optional');
      return {
        ...chapter,
        mainObjectiveCompleted: mainObjectives.filter((objective) => objective.complete).length,
        mainObjectiveTotal: mainObjectives.length,
        mainObjectives,
        objectives,
        optionalObjectives,
        requirements: normalizeChapterRequirements(chapter),
      };
    });
  });
  return {
    chapters,
    normalizedChapters,
  };
}
