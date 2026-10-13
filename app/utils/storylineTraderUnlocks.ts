import { isEffectiveStoryObjectiveComplete } from '@/utils/storylineCompletion';
import type { StoryChapter, StoryObjective } from '@/types/tarkov';
export type TraderUnlockChapter = Pick<
  StoryChapter,
  'id' | 'name' | 'traderUnlocks' | 'objectives'
>;
export type StorylineTraderUnlock = {
  chapter: { id: string; name: string };
  objective: StoryObjective;
};
/** An omitted ID can only be resolved through one explicit chapter reference with the same name. */
const unlockTraderId = (
  unlock: NonNullable<StoryObjective['unlocks']>[number],
  chapter: TraderUnlockChapter
): string | undefined => {
  if (unlock.id) return unlock.id;
  const matches = (chapter.traderUnlocks ?? []).filter(
    (trader) => trader.name.trim() === unlock.name.trim()
  );
  return matches.length === 1 ? matches[0]!.id : undefined;
};
const objectiveTraderIds = (objective: StoryObjective, chapter: TraderUnlockChapter): string[] =>
  (objective.unlocks ?? [])
    .filter((unlock) => unlock.type === 'trader')
    .map((unlock) => unlockTraderId(unlock, chapter))
    .filter((id): id is string => Boolean(id));
const chapterTraderUnlocks = (chapter: TraderUnlockChapter) =>
  Object.values(chapter.objectives ?? {}).flatMap((objective) =>
    objectiveTraderIds(objective, chapter).map((traderId) => ({
      traderId,
      gate: { chapter: { id: chapter.id, name: chapter.name }, objective },
    }))
  );
/** Only a single explicit objective is a clear gate; chapter summaries and wording prove none. */
export const storylineTraderUnlocks = (
  chapters: readonly TraderUnlockChapter[]
): ReadonlyMap<string, StorylineTraderUnlock> => {
  const candidates = new Map<string, Map<string, StorylineTraderUnlock>>();
  for (const { traderId, gate } of chapters.flatMap(chapterTraderUnlocks)) {
    const gates = candidates.get(traderId) ?? new Map<string, StorylineTraderUnlock>();
    gates.set(JSON.stringify([gate.chapter.id, gate.objective.id]), gate);
    candidates.set(traderId, gates);
  }
  return new Map(
    [...candidates].flatMap(([id, gates]) =>
      gates.size === 1 ? [[id, [...gates.values()][0]!]] : []
    )
  );
};
export const isStorylineTraderUnlocked = (
  gate: StorylineTraderUnlock,
  recorded: boolean
): boolean => isEffectiveStoryObjectiveComplete(gate.objective, recorded);
