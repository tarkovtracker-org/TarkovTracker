import type { UserProgressData } from '@/types/progress';
import type { StoryChapter, StoryObjective } from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
type StoryProgress = UserProgressData['storyChapters'];
/** A cached catalog proves policy only for the mode it was loaded for. */
export const storyCatalogForMode = (
  chapters: readonly StoryChapter[],
  catalogMode: GameMode | null | undefined,
  mode: GameMode
): readonly StoryChapter[] => (catalogMode === mode ? chapters : []);
/** Only recognized producer policies are authoritative; old/unknown metadata stays manual. */
export const isAutomaticStoryObjective = (
  objective?: Pick<StoryObjective, 'completionPolicy'>
): boolean => objective?.completionPolicy === 'tutorial';
export const isEffectiveStoryObjectiveComplete = (
  objective: Pick<StoryObjective, 'completionPolicy'>,
  recorded: boolean
): boolean => isAutomaticStoryObjective(objective) || recorded;
/** A read projection only. Recorded marks and clocks remain untouched for faithful backups/undo. */
export const effectiveStoryProgress = (
  recorded: StoryProgress | undefined,
  chapters: readonly StoryChapter[]
): StoryProgress => {
  const projected = { ...(recorded ?? {}) };
  for (const chapter of chapters) {
    const automatic = Object.values(chapter.objectives ?? {}).filter(isAutomaticStoryObjective);
    if (!automatic.length) continue;
    const saved = recorded?.[chapter.id];
    const objectives = { ...saved?.objectives };
    for (const objective of automatic) {
      objectives[objective.id] = { complete: true };
    }
    projected[chapter.id] = { ...saved, objectives };
  }
  return projected;
};
